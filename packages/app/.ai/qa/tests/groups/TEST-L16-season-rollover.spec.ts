import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { addDays, createActivity, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import {
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createSecondOrganization,
  type Club,
} from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { phoneRental, postRental, rentalPitch } from '../_fixtures/facilities'
import { addMembership, createGroup, createSeason, getGroup, signedInStaff, updateGroup } from '../_fixtures/groups'
import { createFee } from '../_fixtures/payments'
import { uiText } from '../_fixtures/ui-text'

// People life-cycle spec phase L9 (#311; REQ-L08, J-L06, AC-L09). TEST-L16 — a season with four groups in two sections:
// the club administrator previews and applies a plan with continue, rename (new name), close and copy; the recurring
// activity and the fee of the continued group end on the old season's last day and are copied (the fee with the new
// amount), those of the closed group end, its memberships end (a later one is removed); a copy moved onto a rental
// answers 409 `rollover_conflicts` and changes nothing; a group changed between preview and apply answers 409
// `rollover_plan_stale`; the same plan applied twice changes nothing the second time; "Announce in the group threads"
// posts exactly one announcement per continued group. A coordinator of one section lists only their groups, a group of
// the other section in the plan answers 403, and their rollover leaves the other section untouched. TEST-L20 — both
// routes fail closed for another organization (404) and for a coach without `groups.manage` (403). The wizard opens
// from the Seasons tab and lists the groups (light and dark, axe).
test.describe.configure({ timeout: 420_000 })

type Preview = {
  groups: { groupId: string; name: string }[]
  candidates: { module: string; recordId: string; groupId: string }[]
  items: { module: string; kind: string; recordId: string | null; action: string }[]
  conflicts: { recordId: string; conflicts: unknown[] }[]
  notices: { code: string }[]
  previewToken: string
  code?: string
}

type Summary = {
  seasonId?: string
  seasonCreated?: boolean
  groups?: { continued: number; renamed: number; closed: number; copied: number }
  membershipsEnded?: number
  announced?: number
  code?: string
}

function preview(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<Preview>(request, 'POST', '/api/groups/seasons/rollover/preview', token, { data })
}

async function previewOk(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const result = await preview(request, token, data)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body as Preview
}

function apply(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<Summary>(request, 'POST', '/api/groups/seasons/rollover', token, { data })
}

type Snapshot = {
  groups: Array<{ id: string; name: string; season_id: string | null; is_active: boolean; section_id: string }>
  memberships: Array<{ id: string; valid_to: string | null; deleted: boolean }>
  activities: Array<{ id: string; group_id: string; ends_on: string | null; starts_on: string; start: string }>
  fees: Array<{ id: string; amount: number; valid_from: string; valid_to: string | null; group_id: string | null }>
  seasons: number
}

/** Everything the rollover may touch in the club, ordered, so two snapshots compare as "nothing changed". */
async function snapshot(club: Club): Promise<Snapshot> {
  return withClient(async (client) => {
    const tenant = club.tenant.tenantId
    const groups = await client.query<Snapshot['groups'][number]>(
      `select id, name, season_id, is_active, section_id from groups_groups
        where tenant_id = $1 and deleted_at is null order by name, id`,
      [tenant],
    )
    const memberships = await client.query<Snapshot['memberships'][number]>(
      `select id, to_char(valid_to, 'YYYY-MM-DD') as valid_to, deleted_at is not null as deleted
         from groups_memberships where tenant_id = $1 order by id`,
      [tenant],
    )
    const activities = await client.query<Snapshot['activities'][number]>(
      `select id, group_id, to_char(ends_on, 'YYYY-MM-DD') as ends_on, to_char(starts_on, 'YYYY-MM-DD') as starts_on,
              to_char(default_start_time, 'HH24:MI') as start
         from activities_activities where tenant_id = $1 and deleted_at is null order by starts_on, id`,
      [tenant],
    )
    const fees = await client.query<Snapshot['fees'][number]>(
      `select id, amount, to_char(valid_from, 'YYYY-MM-DD') as valid_from, to_char(valid_to, 'YYYY-MM-DD') as valid_to,
              group_id from payments_fees where tenant_id = $1 and deleted_at is null order by valid_from, id`,
      [tenant],
    )
    const seasons = await client.query<{ count: string }>(
      `select count(*)::text as count from groups_seasons where tenant_id = $1 and deleted_at is null`,
      [tenant],
    )
    return {
      groups: groups.rows,
      memberships: memberships.rows,
      activities: activities.rows,
      fees: fees.rows,
      seasons: Number(seasons.rows[0]?.count ?? 0),
    }
  })
}

async function groupThreads(club: Club, groupIds: string[]): Promise<Record<string, number>> {
  return withClient(async (client) => {
    const rows = await client.query<{ group_id: string; count: string }>(
      `select group_id, count(*)::text as count from communication_threads
        where tenant_id = $1 and group_id = any($2::uuid[]) and scope_type = 'group' and deleted_at is null
        group by group_id`,
      [club.tenant.tenantId, groupIds],
    )
    return Object.fromEntries(rows.rows.map((row) => [row.group_id, Number(row.count)]))
  })
}

async function person(request: APIRequestContext, club: Club, firstName: string): Promise<string> {
  return createPerson(request, club.adminToken, { firstName, lastName: 'Sezonowy', birthDate: birthDateTurning(9) })
}

test('TEST-L16 the club moves to a new season in one previewed step; conflicts, stale plans, scope, announcement', async ({
  request,
}) => {
  const club = await createClub(request, 'test-l16')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const lastDay = addDays(today, 13)
    const newStart = addDays(today, 14)
    const newEnd = addDays(today, 379)
    const setup = await rentalPitch(request, club)
    const volley = await createStructure(request, admin, 'sections', { name: 'Sekcja siatkówki' })
    const oldSeason = await createSeason(request, admin, {
      name: `Sezon stary ${today}`,
      startsOn: addDays(today, -60),
      endsOn: lastDay,
    })
    const team = (sectionId: string, name: string) =>
      createGroup(request, admin, { sectionId, name, kind: 'team', seasonId: oldSeason })
    const zaki = await team(setup.academy, 'Żaki 2017')
    const skrzaty = await team(setup.academy, 'Skrzaty 2020')
    const tuesday = await team(volley, 'Siatka wtorek')
    const thursday = await team(volley, 'Siatka czwartek')

    const ola = await person(request, club, 'Ola')
    const ewa = await person(request, club, 'Ewa')
    const ida = await person(request, club, 'Ida')
    await addMembership(request, admin, {
      groupId: skrzaty,
      personId: ola,
      role: 'participant',
      validFrom: addDays(today, -30),
    })
    const ended = await addMembership(request, admin, {
      groupId: tuesday,
      personId: ewa,
      role: 'participant',
      validFrom: addDays(today, -30),
    })
    const later = await addMembership(request, admin, {
      groupId: tuesday,
      personId: ida,
      role: 'participant',
      validFrom: addDays(today, 20),
    })

    // Recurring activities: Skrzaty on Tuesdays 17:00 (open-ended), Siatka wtorek on Thursdays 17:00.
    const training = await createActivity(request, admin, {
      groupId: skrzaty,
      name: 'Trening Skrzatów',
      type: 'training',
      placeId: setup.pitch,
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    })
    const volleyTraining = await createActivity(request, admin, {
      groupId: tuesday,
      name: 'Trening siatki',
      type: 'training',
      placeId: setup.pitch,
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TH',
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    })
    const fee = await createFee(request, admin, {
      name: 'Składka Skrzatów',
      amount: 12_000,
      period: 'monthly',
      groupId: skrzaty,
      dueDay: 10,
      validFrom: addDays(today, -60),
    })
    const volleyFee = await createFee(request, admin, {
      name: 'Składka siatki',
      amount: 10_000,
      period: 'monthly',
      groupId: tuesday,
      dueDay: 10,
      validFrom: addDays(today, -60),
    })
    // A rental on the first Tuesday of the new season at 19:30: a copy of the training moved there collides.
    const rentalDay = nextWeekday(newStart, 'TU')
    const rental = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(rentalDay, '19:30')),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)

    const season = { name: `Sezon nowy ${today}`, startsOn: newStart, endsOn: newEnd }
    const groups = [
      { groupId: zaki, action: 'rename', name: 'Orliki 2017' },
      { groupId: skrzaty, action: 'continue' },
      { groupId: skrzaty, action: 'copy', name: 'Skrzaty 2021' },
      { groupId: tuesday, action: 'close' },
      { groupId: thursday, action: 'continue' },
    ]

    // The groups and the candidates of an empty plan.
    const listed = await previewOk(request, admin, { fromSeasonId: oldSeason, season, groups: [], records: [] })
    expect(listed.groups.map((group) => group.groupId).sort()).toEqual([zaki, skrzaty, tuesday, thursday].sort())
    expect(listed.candidates.map((candidate) => candidate.recordId).sort()).toEqual(
      [training.id, volleyTraining.id, fee, volleyFee].sort(),
    )

    // Negative: the copy moved onto the rental — the preview lists the conflict and the apply refuses it, all of it.
    const clashing = {
      fromSeasonId: oldSeason,
      season,
      groups,
      records: [
        { recordId: training.id, action: 'end_and_copy', copy: { startTime: '19:30', endTime: '21:00' } },
        { recordId: fee, action: 'end_and_copy', copy: { amount: 13_000 } },
      ],
    }
    const clash = await previewOk(request, admin, clashing)
    expect(clash.conflicts.map((conflict) => conflict.recordId)).toEqual([training.id])
    const before = await snapshot(club)
    const refused = await apply(request, admin, { ...clashing, previewToken: clash.previewToken })
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body?.code).toBe('rollover_conflicts')
    expect(await snapshot(club)).toEqual(before)

    // Negative: a group changed between the preview and the apply makes the plan stale.
    const plan = {
      fromSeasonId: oldSeason,
      season,
      groups,
      records: [
        { recordId: training.id, action: 'end_and_copy' },
        { recordId: fee, action: 'end_and_copy', copy: { amount: 13_000 } },
      ],
    }
    const stalePreview = await previewOk(request, admin, plan)
    expect(stalePreview.conflicts).toEqual([])
    const thursdayGroup = await getGroup(request, admin, thursday)
    const renamed = await updateGroup(
      request,
      admin,
      { id: thursday, description: 'Zmiana w trakcie' },
      thursdayGroup.body?.updatedAt,
    )
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)
    const stale = await apply(request, admin, { ...plan, previewToken: stalePreview.previewToken })
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    expect(stale.body?.code).toBe('rollover_plan_stale')

    // TEST-L20: another organization and a coach.
    const other = await createSecondOrganization(request, club)
    expect((await preview(request, other.adminToken, plan)).status).toBe(404)
    expect((await apply(request, other.adminToken, { ...plan, previewToken: stalePreview.previewToken })).status).toBe(
      404,
    )
    const coach = await signedInStaff(request, club, { firstName: 'Cezary', lastName: 'Trener', role: 'coach' })
    expect((await preview(request, coach.token, plan)).status).toBe(403)
    expect((await apply(request, coach.token, { ...plan, previewToken: stalePreview.previewToken })).status).toBe(403)

    // The plan applied, with the announcement.
    const fresh = await previewOk(request, admin, plan)
    expect(fresh.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: 'groups', kind: 'season', action: 'create' }),
        expect.objectContaining({ module: 'groups', kind: 'memberships', recordId: tuesday, action: 'end' }),
        expect.objectContaining({ module: 'activities', recordId: training.id, action: 'end' }),
        expect.objectContaining({ module: 'activities', recordId: volleyTraining.id, action: 'end' }),
        expect.objectContaining({ module: 'payments', recordId: fee, action: 'end' }),
        expect.objectContaining({ module: 'payments', recordId: volleyFee, action: 'end' }),
      ]),
    )
    const applied = await apply(request, admin, { ...plan, previewToken: fresh.previewToken, announce: true })
    expect(applied.status, JSON.stringify(applied.body)).toBe(200)
    const summary = applied.body as Summary
    expect(summary.seasonCreated).toBe(true)
    expect(summary.groups).toEqual({ continued: 2, renamed: 1, closed: 1, copied: 1 })
    expect(summary.membershipsEnded).toBe(2)
    expect(summary.announced).toBe(3)
    const newSeason = String(summary.seasonId)

    const after = await snapshot(club)
    const groupRow = (id: string) => after.groups.find((row) => row.id === id)
    expect(groupRow(zaki)).toEqual(
      expect.objectContaining({ name: 'Orliki 2017', season_id: newSeason, is_active: true }),
    )
    expect(groupRow(skrzaty)).toEqual(expect.objectContaining({ season_id: newSeason, is_active: true }))
    expect(groupRow(thursday)).toEqual(expect.objectContaining({ season_id: newSeason, is_active: true }))
    expect(groupRow(tuesday)).toEqual(expect.objectContaining({ season_id: oldSeason, is_active: false }))
    const copy = after.groups.find((row) => row.name === 'Skrzaty 2021')
    expect(copy).toEqual(expect.objectContaining({ season_id: newSeason, is_active: true, section_id: setup.academy }))
    expect(after.memberships.find((row) => row.id === ended)).toEqual(
      expect.objectContaining({ valid_to: lastDay, deleted: false }),
    )
    expect(after.memberships.find((row) => row.id === later)).toEqual(expect.objectContaining({ deleted: true }))
    expect(after.activities.find((row) => row.id === training.id)?.ends_on).toBe(lastDay)
    expect(after.activities.find((row) => row.id === volleyTraining.id)?.ends_on).toBe(lastDay)
    const trainingCopy = after.activities.find((row) => row.group_id === skrzaty && row.id !== training.id)
    expect(trainingCopy).toEqual(expect.objectContaining({ starts_on: newStart, ends_on: null, start: '17:00' }))
    expect(after.fees.find((row) => row.id === fee)?.valid_to).toBe(lastDay)
    expect(after.fees.find((row) => row.id === volleyFee)?.valid_to).toBe(lastDay)
    const feeCopy = after.fees.find((row) => row.group_id === skrzaty && row.id !== fee)
    expect(feeCopy).toEqual(expect.objectContaining({ amount: 13_000, valid_from: newStart, valid_to: null }))
    const memberships = await withClient((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count from groups_memberships where tenant_id = $1 and group_id = $2`,
        [club.tenant.tenantId, copy?.id],
      ),
    )
    expect(Number(memberships.rows[0]?.count)).toBe(0)
    // Exactly one announcement per continued (or renamed) group, none for the closed one or the copy.
    await expect
      .poll(() => groupThreads(club, [zaki, skrzaty, thursday, tuesday, String(copy?.id)]), { timeout: 20_000 })
      .toEqual({ [zaki]: 1, [skrzaty]: 1, [thursday]: 1 })

    // The same plan applied a second time changes nothing.
    const again = await apply(request, admin, { ...plan, previewToken: fresh.previewToken, announce: true })
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body?.code).toBe('rollover_plan_stale')
    expect(await snapshot(club)).toEqual(after)
    expect(await groupThreads(club, [zaki, skrzaty, thursday])).toEqual({ [zaki]: 1, [skrzaty]: 1, [thursday]: 1 })

    // A coordinator of the academy, on a second season with one group per section.
    const trial = await createSeason(request, admin, {
      name: `Sezon próbny ${today}`,
      startsOn: addDays(today, -40),
      endsOn: addDays(today, 5),
    })
    const academyTrial = await createGroup(request, admin, {
      sectionId: setup.academy,
      name: 'Próbna akademia',
      kind: 'team',
      seasonId: trial,
    })
    const volleyTrial = await createGroup(request, admin, {
      sectionId: volley,
      name: 'Próbna siatka',
      kind: 'team',
      seasonId: trial,
    })
    const coordinatorSeason = { id: newSeason }
    const own = await previewOk(request, setup.coordinator, {
      fromSeasonId: trial,
      season: coordinatorSeason,
      groups: [],
      records: [],
    })
    expect(own.groups.map((group) => group.groupId)).toEqual([academyTrial])
    const foreign = await preview(request, setup.coordinator, {
      fromSeasonId: trial,
      season: coordinatorSeason,
      groups: [{ groupId: volleyTrial, action: 'close' }],
      records: [],
    })
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)
    const ownPlan = {
      fromSeasonId: trial,
      season: coordinatorSeason,
      groups: [{ groupId: academyTrial, action: 'continue' }],
      records: [],
    }
    const ownPreview = await previewOk(request, setup.coordinator, ownPlan)
    expect(ownPreview.notices.map((notice) => notice.code)).toEqual(['fees_unchanged'])
    const coordinatorApplied = await apply(request, setup.coordinator, {
      ...ownPlan,
      previewToken: ownPreview.previewToken,
    })
    expect(coordinatorApplied.status, JSON.stringify(coordinatorApplied.body)).toBe(200)
    const trialAfter = await snapshot(club)
    expect(trialAfter.groups.find((row) => row.id === academyTrial)?.season_id).toBe(newSeason)
    expect(trialAfter.groups.find((row) => row.id === volleyTrial)).toEqual(
      expect.objectContaining({ season_id: trial, is_active: true }),
    )
  } finally {
    await club.cleanup()
  }
})

test("TEST-L16 the wizard opens from the Seasons tab and lists the groups in the actor's scope", async ({
  page,
  request,
}, testInfo: TestInfo) => {
  const club = await createClub(request, 'test-l16-ui')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const oldSeason = await createSeason(request, admin, {
      name: `Sezon stary ${today}`,
      startsOn: addDays(today, -60),
      endsOn: addDays(today, 13),
    })
    await createSeason(request, admin, {
      name: `Sezon nowy ${today}`,
      startsOn: addDays(today, 14),
      endsOn: addDays(today, 379),
    })
    await createGroup(request, admin, { sectionId: academy, name: 'Żaki 2017', kind: 'team', seasonId: oldSeason })

    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await prepareForAccessibilityScan(page)
    await page.goto('/backend/groups/seasons')
    await page.getByRole('link', { name: uiText('groups.rollover.title', { exact: true }) }).click()
    await expect(page.getByTestId('groups-rollover')).toBeVisible()
    await page.locator('#groups-rollover-from').click()
    await page.getByRole('option', { name: `Sezon stary ${today}` }).click()
    await page.getByRole('button', { name: uiText('groups.rollover.seasonMode.existing', { exact: true }) }).click()
    await page.locator('#groups-rollover-to').click()
    await page.getByRole('option', { name: `Sezon nowy ${today}` }).click()
    await page.getByTestId('groups-rollover-next-1').click()
    await expect(page.getByTestId('groups-rollover-group')).toHaveCount(1)
    await expect(page.getByTestId('groups-rollover-group')).toContainText('Żaki 2017')
    await page.getByTestId('groups-rollover-next-2').click()
    await page.getByTestId('groups-rollover-next-3').click()
    await expect(page.getByTestId('groups-rollover-preview')).toBeVisible()
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'B-11 season rollover',
      async () => {
        await expect(page.getByTestId('groups-rollover-preview')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
