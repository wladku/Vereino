import { expect, test, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { addDays, safeDay } from '../_fixtures/activities'
import { declare, familyFor, weeklySeries } from '../_fixtures/attendance'
import { birthDateTurning, calendarDate, call, createClub, createPerson } from '../_fixtures/club'
import {
  addMembership,
  ageCategoryOptions,
  createGroup,
  createSeason,
  endMembership,
  roster,
  seedAgeCategories,
  type MembershipItem,
} from '../_fixtures/groups'
import { createFee, generate, listCharges, periodFromNow } from '../_fixtures/payments'

// People life-cycle spec phase L11 (#383; REQ-L15 with REQ-L11's effects, DD-L16, Q-L22…Q-L24, AC-L15): TEST-L21 —
// Żaki with seven participants on the list (one already in Skrzaty, one whose membership starts later, two with a
// declaration for a later Żaki session) and a monthly fee in both groups, the month generated: the academy
// coordinator previews a move of the seven to Skrzaty from today — five moves, two skips with their reasons, the two
// declarations that will be dropped and the age fit — a membership changed after the preview answers 409
// `move_preview_stale`, the fresh preview applies in one step, both rosters show the move, the declarations are gone,
// generating the month again charges each moved child once, and one undo restores both groups and the declarations.
// AC-L16 (#601): a team with a ranged age category (Orlik U10–U11, season 2026/27) fits by birth year, 2016–2017,
// whatever its age range says; a group without a category fits by age.
// Refusals: the same group, a past day, more than 100 children, an inactive target and a coach's membership (422); a
// coordinator of another section on either side (403); TEST-L20 — no `groups.manage` (403) and another club (404).
test.describe.configure({ timeout: 480_000 })

type PreviewItem = {
  membershipId: string
  personId: string
  outcome: string
  futureDeclarations: number
  feeNote: string | null
  fitsTarget: boolean | null
}
type FitRule = Record<string, unknown> & { kind: 'birth_years' | 'age' }
type MoveBody = {
  items?: PreviewItem[]
  fitRule?: FitRule | null
  moved?: number
  skipped?: number
  futureDeclarations?: number
  previewToken?: string
  undoToken?: string | null
  ok?: boolean
  code?: string
  error?: string
}

function moveMany(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<MoveBody>(request, 'POST', '/api/groups/memberships/move-many', token, { data })
}

async function liveDeclarations(tenantId: string, personId: string, occurrenceId: string): Promise<number> {
  return withClient(async (client) => {
    const rows = await client.query<{ count: string }>(
      `select count(*)::text as count from activities_attendances
        where tenant_id = $1 and person_id = $2 and occurrence_id = $3 and deleted_at is null`,
      [tenantId, personId, occurrenceId],
    )
    return Number(rows.rows[0]?.count ?? 0)
  })
}

test('TEST-L21 several children move to another group in one previewed step that can be undone', async ({
  request,
}) => {
  const club = await createClub(request, 'test-l21')
  const otherClub = await createClub(request, 'test-l21-b')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const coordinator = family.academyCoordinator.token
    // Calendar-day offsets from today (as the attendance fixture does): `calendarDate(-30)` subtracts 30 × 24 h, which
    // lands one day off when the span crosses a DST change late in the evening.
    const today = calendarDate()
    const yesterday = addDays(today, -1)
    const since = addDays(today, -30)
    const period = periodFromNow(0)
    // Skrzaty takes 14–16-year-olds: Hania (14) and Kuba (16) fit, Staś (12) does not.
    const skrzaty = await createGroup(request, admin, {
      sectionId: family.academy,
      name: 'Skrzaty',
      kind: 'team',
      ageFrom: 14,
      ageTo: 16,
    })
    const closed = await createGroup(request, admin, {
      sectionId: family.academy,
      name: 'Rocznik zamknięty',
      kind: 'team',
      isActive: false,
    })

    // Four more children in Żaki: two plain, one already in Skrzaty for a week, one who joins Żaki only later.
    const child = async (firstName: string, age: number) =>
      createPerson(request, admin, { firstName, lastName: 'Lewandowski', birthDate: birthDateTurning(age) })
    const ola = await child('Ola', 9)
    const jas = await child('Jaś', 10)
    const zosia = await child('Zosia', 15)
    const tymek = await child('Tymek', 11)
    for (const personId of [ola, jas, zosia]) {
      await addMembership(request, admin, { groupId: family.zaki, personId, role: 'participant', validFrom: since })
    }
    await addMembership(request, admin, {
      groupId: skrzaty,
      personId: zosia,
      role: 'participant',
      validFrom: addDays(today, -7),
    })
    await addMembership(request, admin, {
      groupId: family.zaki,
      personId: tymek,
      role: 'participant',
      validFrom: addDays(today, 40),
    })

    const zakiFee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: family.zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: `${period}-01`,
    })
    await createFee(request, admin, {
      name: 'Skrzaty',
      groupId: skrzaty,
      period: 'monthly',
      amount: 9000,
      dueDay: 10,
      validFrom: `${period}-01`,
    })
    const first = await generate(request, admin, period)
    expect(first.status, JSON.stringify(first.body)).toBe(200)

    // Two declarations for a later Żaki session (lesson `integration-tests-pick-days-two-days-ahead`).
    const training = await weeklySeries(request, club, coordinator, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening Żaków L21',
      type: 'training',
      weekday: 'WE',
      start: '17:00',
      end: '18:00',
    })
    const later = training.sessions.find((session) => (session.occurrenceDate ?? '') >= safeDay())
    expect(later, 'a later Żaki session').toBeTruthy()
    const laterId = String(later?.id)
    for (const [token, personId] of [
      [family.guardian.token, family.elder.personId],
      [family.other.guardian.token, family.other.child.personId],
    ]) {
      const declared = await declare(request, token, { occurrenceId: laterId, personId, declared: 'no' })
      expect([200, 201], JSON.stringify(declared.body)).toContain(declared.status)
    }

    const zakiRows = (await roster(request, admin, family.zaki)).items
    const membershipOf = (personId: string): MembershipItem => {
      const row = zakiRows.find((item) => item.personId === personId && item.role === 'participant')
      expect(row, `a Żaki membership of ${personId}`).toBeTruthy()
      return row as MembershipItem
    }
    const movers = [family.younger.personId, family.elder.personId, family.other.child.personId, ola, jas]
    const ids = [...movers, zosia, tymek].map((personId) => membershipOf(personId).id)
    const request0 = { fromGroupId: family.zaki, toGroupId: skrzaty, date: today, membershipIds: ids }

    // --- Refusals: nothing changes ---
    const sameGroup = await moveMany(request, coordinator, { ...request0, toGroupId: family.zaki, dryRun: true })
    expect(sameGroup.status, JSON.stringify(sameGroup.body)).toBe(422)
    expect(sameGroup.body?.code).toBe('move_same_group')
    const past = await moveMany(request, coordinator, { ...request0, date: yesterday, dryRun: true })
    expect(past.status).toBe(422)
    expect(past.body?.code).toBe('move_date_in_past')
    const tooMany = Array.from({ length: 101 }, () => crypto.randomUUID())
    const many = await moveMany(request, coordinator, { ...request0, membershipIds: tooMany, dryRun: true })
    expect(many.status).toBe(422)
    expect(many.body?.code).toBe('move_too_many')
    const inactive = await moveMany(request, coordinator, { ...request0, toGroupId: closed, dryRun: true })
    expect(inactive.status).toBe(422)
    expect(inactive.body?.code).toBe('move_target_inactive')
    const coachRow = zakiRows.find((item) => item.personId === family.coach.personId)
    const withCoach = await moveMany(request, coordinator, {
      ...request0,
      membershipIds: [...ids, String(coachRow?.id)],
      dryRun: true,
    })
    expect(withCoach.status).toBe(422)
    expect(withCoach.body?.code).toBe('groups_reference_invalid')
    // The pool coordinator may not move out of Żaki; the academy coordinator may not move into the pool group.
    const foreignSource = await moveMany(request, family.poolCoordinator.token, { ...request0, dryRun: true })
    expect(foreignSource.status, JSON.stringify(foreignSource.body)).toBe(403)
    const foreignTarget = await moveMany(request, coordinator, {
      ...request0,
      toGroupId: family.poolGroup,
      dryRun: true,
    })
    expect(foreignTarget.status).toBe(403)
    expect(foreignTarget.body?.code).toBe('scope_denied')
    // TEST-L20: a guardian has no `groups.manage`; another club does not see the group.
    expect((await moveMany(request, family.guardian.token, { ...request0, dryRun: true })).status).toBe(403)
    expect((await moveMany(request, otherClub.adminToken, { ...request0, dryRun: true })).status).toBe(404)
    // An apply without a preview token is stale.
    const tokenless = await moveMany(request, coordinator, request0)
    expect(tokenless.status).toBe(409)
    expect(tokenless.body?.code).toBe('move_preview_stale')

    // --- The preview: five moves, two skips, two declarations, the fee note and the age fit ---
    const preview = await moveMany(request, coordinator, { ...request0, dryRun: true })
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    expect(preview.body).toMatchObject({ moved: 5, skipped: 2, futureDeclarations: 2 })
    const byPerson = new Map((preview.body?.items ?? []).map((item) => [item.personId, item]))
    for (const personId of movers) {
      expect(byPerson.get(personId)).toMatchObject({ outcome: 'move', feeNote: 'month_charged_once' })
    }
    expect(byPerson.get(zosia)).toMatchObject({ outcome: 'skip_already_member', feeNote: null })
    expect(byPerson.get(tymek)).toMatchObject({ outcome: 'skip_not_active', futureDeclarations: 0 })
    expect(byPerson.get(family.elder.personId)?.futureDeclarations).toBe(1)
    expect(byPerson.get(family.other.child.personId)?.futureDeclarations).toBe(1)
    expect(byPerson.get(family.younger.personId)?.fitsTarget).toBe(true)
    expect(byPerson.get(family.elder.personId)?.fitsTarget).toBe(true)
    expect(byPerson.get(family.other.child.personId)?.fitsTarget).toBe(false)
    expect(preview.body?.fitRule).toEqual({ kind: 'age', ageFrom: 14, ageTo: 16 })

    // --- AC-L16: a team with a ranged age category fits by the birth years of its season, not by its age range ---
    seedAgeCategories(club)
    const orlik = (await ageCategoryOptions(request, admin)).items.find((item) => item.value === 'orlik')
    expect(orlik, 'the seeded Orlik category').toBeTruthy()
    const season = await createSeason(request, admin, { name: '2026/27', startsOn: '2026-09-01', endsOn: '2027-08-31' })
    const orliki = await createGroup(request, admin, {
      sectionId: family.academy,
      name: 'Orliki 2026/27',
      kind: 'team',
      ageCategoryEntryId: orlik?.id,
      seasonId: season,
      ageFrom: 30,
      ageTo: 40,
    })
    const recruits = await createGroup(request, admin, {
      sectionId: family.academy,
      name: 'Nabór L21',
      kind: 'class_group',
    })
    const born = async (firstName: string, birthDate: string) => {
      const personId = await createPerson(request, admin, { firstName, lastName: 'Rocznik', birthDate })
      await addMembership(request, admin, { groupId: recruits, personId, role: 'participant', validFrom: since })
      return personId
    }
    // Born at the very end of 2017 (in the range by birth year, though younger than ten on many days), at the start
    // of 2016, and one day too early.
    const late2017 = await born('Lena', '2017-12-31')
    const early2016 = await born('Igor', '2016-01-01')
    const late2015 = await born('Maks', '2015-12-31')
    const recruitRows = (await roster(request, admin, recruits)).items
    const recruitIds = [late2017, early2016, late2015].map((personId) =>
      String(recruitRows.find((row) => row.personId === personId)?.id),
    )
    const byYear = await moveMany(request, coordinator, {
      fromGroupId: recruits,
      toGroupId: orliki,
      date: today,
      membershipIds: recruitIds,
      dryRun: true,
    })
    expect(byYear.status, JSON.stringify(byYear.body)).toBe(200)
    expect(byYear.body?.fitRule).toEqual({
      kind: 'birth_years',
      uFrom: 10,
      uTo: 11,
      referenceYear: 2026,
      from: 2016,
      to: 2017,
    })
    const fitsByPerson = new Map((byYear.body?.items ?? []).map((item) => [item.personId, item.fitsTarget]))
    expect([late2017, early2016, late2015].map((personId) => fitsByPerson.get(personId))).toEqual([true, true, false])

    // --- A membership changed after the preview: 409 `move_preview_stale`, nothing moved ---
    const olaRow = membershipOf(ola)
    const changed = await endMembership(request, admin, olaRow.id, olaRow.updatedAt, addDays(today, 200))
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    const stale = await moveMany(request, coordinator, { ...request0, previewToken: preview.body?.previewToken })
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    expect(stale.body?.code).toBe('move_preview_stale')
    expect((await roster(request, admin, skrzaty)).items.filter((row) => row.validFrom === today)).toHaveLength(0)

    // --- The fresh preview applies in one step ---
    const fresh = await moveMany(request, coordinator, { ...request0, dryRun: true })
    expect(fresh.status).toBe(200)
    expect(fresh.body?.moved).toBe(5)
    const applied = await moveMany(request, coordinator, { ...request0, previewToken: fresh.body?.previewToken })
    expect(applied.status, JSON.stringify(applied.body)).toBe(200)
    expect(applied.body).toMatchObject({ moved: 5, skipped: 2 })
    expect(applied.body?.undoToken).toBeTruthy()
    // A second apply of the same preview is stale (the memberships changed).
    const twice = await moveMany(request, coordinator, { ...request0, previewToken: fresh.body?.previewToken })
    expect(twice.status).toBe(409)

    // Both rosters: Żaki ends yesterday (Ola keeps her planned last day in Skrzaty), Skrzaty from today.
    const zakiAfter = (await roster(request, admin, family.zaki)).items
    const skrzatyAfter = (await roster(request, admin, skrzaty)).items
    for (const personId of movers) {
      const old = zakiAfter.find((row) => row.personId === personId && row.role === 'participant')
      expect(old?.validTo, `Żaki of ${personId}`).toBe(yesterday)
      const next = skrzatyAfter.find((row) => row.personId === personId && row.validFrom === today)
      expect(next, `Skrzaty of ${personId}`).toMatchObject({ role: 'participant' })
      expect(next?.validTo ?? null).toBe(personId === ola ? addDays(today, 200) : null)
    }
    expect(zakiAfter.find((row) => row.personId === zosia)?.validTo ?? null).toBeNull()
    // B-10 Groups tab (`GET /api/groups/memberships?personId=`): both groups with their dates.
    const kubaHistory = await call<{ items?: MembershipItem[] }>(
      request,
      'GET',
      `/api/groups/memberships?personId=${family.elder.personId}&pageSize=50`,
      admin,
    )
    expect((kubaHistory.body?.items ?? []).map((row) => [row.groupId, row.validFrom, row.validTo]).sort()).toEqual(
      [
        [family.zaki, since, yesterday],
        [skrzaty, today, null],
      ].sort(),
    )

    // REQ-L11: the later Żaki declarations are dropped in the move's transaction.
    expect(await liveDeclarations(club.tenant.tenantId, family.elder.personId, laterId)).toBe(0)
    expect(await liveDeclarations(club.tenant.tenantId, family.other.child.personId, laterId)).toBe(0)

    // One fee for the month: generating the month again charges no Skrzaty fee to a moved child.
    const again = await generate(request, admin, period)
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    const charges = await listCharges(request, admin, `&period=${period}`)
    for (const personId of [family.elder.personId, family.other.child.personId]) {
      expect(
        charges.filter((charge) => charge.personId === personId).map((charge) => charge.sourceId),
        `the month's charges of ${personId}`,
      ).toEqual([zakiFee])
    }

    // --- Undo: only the actor's own move; it restores both groups and the declarations together ---
    const foreignUndo = await moveMany(request, family.poolCoordinator.token, { undoToken: applied.body?.undoToken })
    expect(foreignUndo.status).toBe(422)
    const undone = await moveMany(request, coordinator, { undoToken: applied.body?.undoToken })
    expect(undone.status, JSON.stringify(undone.body)).toBe(200)
    const zakiUndone = (await roster(request, admin, family.zaki)).items
    for (const personId of movers) {
      const old = zakiUndone.find((row) => row.personId === personId && row.role === 'participant')
      expect(old?.validTo ?? null, `Żaki of ${personId} after undo`).toBe(personId === ola ? addDays(today, 200) : null)
    }
    const skrzatyUndone = (await roster(request, admin, skrzaty)).items
    expect(skrzatyUndone.filter((row) => row.validFrom === today)).toHaveLength(0)
    expect(skrzatyUndone.filter((row) => row.personId === zosia)).toHaveLength(1)
    expect(await liveDeclarations(club.tenant.tenantId, family.elder.personId, laterId)).toBe(1)
    expect(await liveDeclarations(club.tenant.tenantId, family.other.child.personId, laterId)).toBe(1)
    // The token is spent.
    expect((await moveMany(request, coordinator, { undoToken: applied.body?.undoToken })).status).toBe(422)
  } finally {
    await otherClub.cleanup()
    await club.cleanup()
  }
})
