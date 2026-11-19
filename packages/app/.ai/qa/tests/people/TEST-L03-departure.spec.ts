import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { addDays, safeDay } from '../_fixtures/activities'
import { declare, familyFor, weeklySeries } from '../_fixtures/attendance'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import {
  assignRole,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createSecondOrganization,
  getPerson,
  mercato,
  type Club,
} from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { actionLogEntries, createGuardianship, guardianships } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// People life-cycle spec phase L4 (#306; REQ-L03, J-L02, AC-L03): TEST-L03 — a guardian with an account and two wards
// in two groups leaves with a future last day: the preview names every membership, guardianship and account, the
// confirm ends them all on that day in one step (`valid_to` = the last day), the later undecided declarations of the
// wards are dropped after the `groups.membership.updated` events, the undo restores every `valid_to` and the next
// confirm works again, the daily job run for the day after closes the accounts; a family that leaves today is listed
// under "Former" and left out of the default list, and "Return to the club" clears the day only. TEST-L04 — 409
// `departure_blocked` naming the staying ward, 422 `departure_payer_required` (and the hand-over to the next payer),
// 422 `last_club_admin`, 409 `departure_preview_stale`, 422 `departure_date_in_past`, nothing changed on a refusal.
// TEST-L20 — the departure, preview and return routes fail closed for another organization and for users without
// `people.manage`. The Leaving tab is checked in the browser (light and dark, axe).
test.describe.configure({ timeout: 420_000 })

type PlanPerson = {
  id: string
  ends: { module: string; kind: string; recordId: string; action: string; until: string | null }[]
  blockers: { code: string; wardPersonId?: string }[]
  choicesNeeded: { wardPersonId: string; candidateGuardianPersonIds: string[] }[]
}
type Plan = { blocked: boolean; persons: PlanPerson[]; previewToken: string; code?: string }

function preview(request: APIRequestContext, token: string, personIds: string[], lastDay: string) {
  return call<Plan>(request, 'POST', '/api/people/departures/preview', token, { data: { personIds, lastDay } })
}

function depart(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<{ ended?: number; code?: string; details?: Record<string, unknown> }>(
    request,
    'POST',
    '/api/people/departures',
    token,
    { data },
  )
}

async function previewOk(request: APIRequestContext, token: string, personIds: string[], lastDay: string) {
  const result = await preview(request, token, personIds, lastDay)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body as Plan
}

async function leftOn(request: APIRequestContext, token: string, personId: string): Promise<string | null> {
  const result = await getPerson(request, token, personId)
  expect(result.status).toBe(200)
  return (result.body as { leftOn?: string | null }).leftOn ?? null
}

async function membershipEnds(club: Club, personIds: string[]): Promise<Array<string | null>> {
  return withClient(async (client) => {
    const rows = await client.query<{ valid_to: string | null }>(
      `select to_char(valid_to, 'YYYY-MM-DD') as valid_to from groups_memberships
        where tenant_id = $1 and person_id = any($2::uuid[]) and deleted_at is null order by id`,
      [club.tenant.tenantId, personIds],
    )
    return rows.rows.map((row) => row.valid_to)
  })
}

async function liveDeclarations(club: Club, personId: string, occurrenceId: string): Promise<number> {
  return withClient(async (client) => {
    const rows = await client.query<{ count: string }>(
      `select count(*)::text as count from activities_attendances
        where tenant_id = $1 and person_id = $2 and occurrence_id = $3 and deleted_at is null`,
      [club.tenant.tenantId, personId, occurrenceId],
    )
    return Number(rows.rows[0]?.count ?? 0)
  })
}

async function listIds(request: APIRequestContext, token: string, query: string): Promise<string[]> {
  const result = await call<{ items?: { id: string }[] }>(
    request,
    'GET',
    `/api/people/persons?pageSize=100${query}`,
    token,
  )
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return (result.body?.items ?? []).map((item) => item.id)
}

test('TEST-L03 a family leaves on a future day in one previewed step; undo, job, Former and return', async ({
  page,
  request,
}, testInfo: TestInfo) => {
  const club = await createClub(request, 'test-l03')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const today = calendarDate()
    const lastDay = addDays(today, 10)
    const leaving = [family.guardian.personId, family.younger.personId, family.elder.personId]

    // A later session of Żaki with the younger ward's declaration: it is dropped once her membership ends.
    const training = await weeklySeries(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening L03',
      type: 'training',
      weekday: 'WE',
      start: '17:00',
      end: '18:00',
    })
    const later = training.sessions.find((session) => (session.occurrenceDate ?? '') > lastDay)
    // Two or more days ahead (`safeDay`): on a Wednesday today's 17:00 session closes its declarations at its start
    // (409 `declaration_closed`), so a run late in the day would fail (#390). A Wednesday between then and the last day
    // always exists.
    const firstSafe = safeDay()
    const before = training.sessions.find(
      (session) => (session.occurrenceDate ?? '') >= firstSafe && (session.occurrenceDate ?? '') <= lastDay,
    )
    expect(later, 'a session after the last day').toBeTruthy()
    const declared = await declare(request, family.guardian.token, {
      occurrenceId: String(later?.id),
      personId: family.younger.personId,
      declared: 'no',
    })
    expect([200, 201], JSON.stringify(declared.body)).toContain(declared.status)
    if (before) {
      const kept = await declare(request, family.guardian.token, {
        occurrenceId: before.id,
        personId: family.younger.personId,
        declared: 'no',
      })
      expect([200, 201], JSON.stringify(kept.body)).toContain(kept.status)
    }

    // The preview: the memberships (2 + 1), the guardianships seen from both sides, the two accounts; no blocker.
    const plan = await previewOk(request, admin, leaving, lastDay)
    expect(plan.blocked).toBe(false)
    const ends = plan.persons.flatMap((person) => person.ends)
    expect(ends.filter((item) => item.kind === 'membership')).toHaveLength(3)
    expect(ends.filter((item) => item.kind === 'guardianship')).toHaveLength(4)
    expect(ends.filter((item) => item.kind === 'account')).toHaveLength(2)
    expect(ends.filter((item) => item.kind !== 'account').every((item) => item.until === lastDay)).toBe(true)

    // Confirm: everything ends on the last day; the persons carry it; the later declaration is dropped.
    const confirmed = await depart(request, admin, { personIds: leaving, lastDay, previewToken: plan.previewToken })
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
    expect(await membershipEnds(club, leaving)).toEqual([lastDay, lastDay, lastDay])
    const guardianRows = await guardianships(request, admin, `guardianPersonId=${family.guardian.personId}`)
    expect(guardianRows.items.map((row) => row.validTo)).toEqual([lastDay, lastDay])
    for (const personId of leaving) expect(await leftOn(request, admin, personId)).toBe(lastDay)
    await expect.poll(() => liveDeclarations(club, family.younger.personId, String(later?.id))).toBe(0)
    if (before) expect(await liveDeclarations(club, family.younger.personId, before.id)).toBe(1)
    // A second departure of the same persons is blocked: they are already leaving.
    const again = await previewOk(request, admin, leaving, lastDay)
    expect(again.persons.flatMap((person) => person.blockers.map((blocker) => blocker.code))).toContain('already_left')

    // The undo (until the last day) restores every `valid_to` and the day; the next confirm works again.
    const resourceId = [...leaving].sort()[0]
    const log = (await actionLogEntries(request, admin, resourceId)).find(
      (entry) => entry.commandId === 'people.persons.depart',
    )
    expect(log?.undoToken).toBeTruthy()
    const undone = await undoByToken(request, admin, String(log?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    expect(await membershipEnds(club, leaving)).toEqual([null, null, null])
    for (const personId of leaving) expect(await leftOn(request, admin, personId)).toBeNull()
    const replan = await previewOk(request, admin, leaving, lastDay)
    const reconfirmed = await depart(request, admin, { personIds: leaving, lastDay, previewToken: replan.previewToken })
    expect(reconfirmed.status, JSON.stringify(reconfirmed.body)).toBe(200)

    // The daily job of the day after the last day closes both accounts (Q-L09).
    mercato([
      'people',
      'sync-role-expiry',
      '--tenant',
      club.tenant.tenantId,
      '--org',
      club.tenant.organizationId,
      '--today',
      addDays(lastDay, 1),
    ])
    for (const personId of [family.guardian.personId, family.elder.personId]) {
      const person = (await getPerson(request, admin, personId)).body as {
        userId?: string | null
        account?: { state: string }
      }
      expect(person.userId ?? null).toBeNull()
      expect(person.account?.state).toBe('none')
    }

    // The other family leaves today: "Former" lists them, the default list and its views do not; a name search of
    // the plain list still finds them.
    const others = [family.other.guardian.personId, family.other.child.personId]
    const todayPlan = await previewOk(request, admin, others, today)
    const leftToday = await depart(request, admin, {
      personIds: others,
      lastDay: today,
      previewToken: todayPlan.previewToken,
    })
    expect(leftToday.status, JSON.stringify(leftToday.body)).toBe(200)
    expect(await listIds(request, admin, '&view=former')).toEqual(expect.arrayContaining(others))
    expect(await listIds(request, admin, '')).not.toContain(family.other.child.personId)
    expect(await listIds(request, admin, '&view=children')).not.toContain(family.other.child.personId)
    expect(await listIds(request, admin, '&view=former')).not.toContain(family.younger.personId)
    expect(await listIds(request, admin, `&search=${family.other.child.lastName}`)).toContain(
      family.other.child.personId,
    )

    // "Return to the club" clears the day only; a person who has not left answers 409.
    const returned = await call(request, 'POST', `/api/people/persons/${family.other.child.personId}/return`, admin)
    expect(returned.status, JSON.stringify(returned.body)).toBe(200)
    expect(await leftOn(request, admin, family.other.child.personId)).toBeNull()
    expect(await listIds(request, admin, '')).toContain(family.other.child.personId)
    expect(await membershipEnds(club, [family.other.child.personId])).toEqual([today])
    const notLeft = await call<{ code?: string }>(
      request,
      'POST',
      `/api/people/persons/${family.coach.personId}/return`,
      admin,
    )
    expect(notLeft.status).toBe(409)
    expect(notLeft.body?.code).toBe('person_not_left')

    // The Leaving tab in the browser: the last day of the family, then a fresh preview for the coach.
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await prepareForAccessibilityScan(page)
    await page.goto(`/backend/people/persons/${family.guardian.personId}?tab=leaving`)
    await expect(page.getByTestId('people-leaving-left')).toBeVisible()
    await page.goto(`/backend/people/persons/${family.coach.personId}?tab=leaving`)
    const form = page.getByTestId('people-leaving-form')
    await expect(form).toBeVisible()
    await expect(page.getByTestId('people-leaving-preview')).toBeVisible()
    await expect(page.getByTestId('people-leaving-preview')).toContainText(uiText('people.leaving.preview.willEnd'))
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'B-10 ?tab=leaving',
      async () => {
        await expect(page.getByTestId('people-leaving-preview')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})

test('TEST-L04 blockers, the payer hand-over, the last administrator, a stale preview and a past day change nothing', async ({
  request,
}) => {
  const club = await createClub(request, 'test-l04')
  try {
    const admin = club.adminToken
    const today = calendarDate()
    const lastDay = addDays(today, 5)

    // The only guardian of a staying minor: 409 `departure_blocked` naming the ward.
    const mother = await createPerson(request, admin, {
      firstName: 'Ewa',
      lastName: 'Sama L04',
      birthDate: birthDateTurning(40),
    })
    const child = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Sama L04',
      birthDate: birthDateTurning(9),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: mother,
      wardPersonId: child,
      isPrimaryPayer: true,
      validFrom: addDays(today, -60),
    })
    const blockedPlan = await previewOk(request, admin, [mother], lastDay)
    expect(blockedPlan.blocked).toBe(true)
    expect(blockedPlan.persons[0]?.blockers).toEqual([
      expect.objectContaining({ code: 'ward_without_guardian', wardPersonId: child }),
    ])
    const blocked = await depart(request, admin, {
      personIds: [mother],
      lastDay,
      previewToken: blockedPlan.previewToken,
    })
    expect(blocked.status).toBe(409)
    expect(blocked.body?.code).toBe('departure_blocked')
    expect(JSON.stringify(blocked.body)).toContain(child)
    expect(await leftOn(request, admin, mother)).toBeNull()

    // The primary payer of a ward who keeps another guardian: 422 without the next payer; with it, the other
    // guardian's row ends on the last day and a primary-payer copy starts the next day.
    const father = await createPerson(request, admin, {
      firstName: 'Jan',
      lastName: 'Sama L04',
      birthDate: birthDateTurning(42),
    })
    const fatherRow = await createGuardianship(request, admin, {
      guardianPersonId: father,
      wardPersonId: child,
      isPrimaryPayer: false,
      validFrom: addDays(today, -60),
    })
    const payerPlan = await previewOk(request, admin, [mother], lastDay)
    expect(payerPlan.blocked).toBe(false)
    expect(payerPlan.persons[0]?.choicesNeeded).toEqual([
      expect.objectContaining({ wardPersonId: child, candidateGuardianPersonIds: [father] }),
    ])
    const noPayer = await depart(request, admin, { personIds: [mother], lastDay, previewToken: payerPlan.previewToken })
    expect(noPayer.status).toBe(422)
    expect(noPayer.body?.code).toBe('departure_payer_required')
    expect(await leftOn(request, admin, mother)).toBeNull()
    const handedOver = await depart(request, admin, {
      personIds: [mother],
      lastDay,
      previewToken: payerPlan.previewToken,
      nextPayer: [{ wardPersonId: child, guardianPersonId: father }],
    })
    expect(handedOver.status, JSON.stringify(handedOver.body)).toBe(200)
    const fatherRows = (await guardianships(request, admin, `guardianPersonId=${father}`)).items
    expect(fatherRows.find((row) => row.id === fatherRow)?.validTo).toBe(lastDay)
    expect(fatherRows.find((row) => row.id !== fatherRow)).toMatchObject({
      isPrimaryPayer: true,
      validFrom: addDays(lastDay, 1),
      validTo: null,
    })

    // The club's only administrator: 422 `last_club_admin`.
    const adminPlan = await previewOk(request, admin, [club.adminPersonId], lastDay)
    expect(adminPlan.persons[0]?.blockers.map((blocker) => blocker.code)).toContain('last_club_admin')
    const lastAdmin = await depart(request, admin, {
      personIds: [club.adminPersonId],
      lastDay,
      previewToken: adminPlan.previewToken,
    })
    expect(lastAdmin.status).toBe(422)
    expect(lastAdmin.body?.code).toBe('last_club_admin')

    // Data changed after the preview: 409 `departure_preview_stale`; a forged token too.
    const coach = await createPerson(request, admin, {
      firstName: 'Adam',
      lastName: 'Trener L04',
      birthDate: birthDateTurning(30),
    })
    const stalePlan = await previewOk(request, admin, [coach], lastDay)
    await assignRole(request, admin, { personId: coach, role: 'coach', validFrom: today })
    const stale = await depart(request, admin, { personIds: [coach], lastDay, previewToken: stalePlan.previewToken })
    expect(stale.status).toBe(409)
    expect(stale.body?.code).toBe('departure_preview_stale')
    const forged = await depart(request, admin, { personIds: [coach], lastDay, previewToken: '1.abc' })
    expect(forged.status).toBe(409)
    expect(await leftOn(request, admin, coach)).toBeNull()

    // A past last day: 422 on the preview and on the confirm.
    const past = await preview(request, admin, [coach], addDays(today, -1))
    expect(past.status).toBe(422)
    expect(past.body?.code).toBe('departure_date_in_past')
    const pastConfirm = await depart(request, admin, {
      personIds: [coach],
      lastDay: addDays(today, -1),
      previewToken: stalePlan.previewToken,
    })
    expect(pastConfirm.status).toBe(422)
    expect(await leftOn(request, admin, coach)).toBeNull()
  } finally {
    await club.cleanup()
  }
})

test('TEST-L20 the departure, preview and return routes fail closed (#306)', async ({ request }) => {
  const club = await createClub(request, 'test-l20-departure')
  try {
    const admin = club.adminToken
    const lastDay = addDays(calendarDate(), 3)
    const person = await createPerson(request, admin, {
      firstName: 'Zofia',
      lastName: 'Obca L20',
      birthDate: birthDateTurning(30),
    })

    // Another organization's administrator: the person is outside the caller's organization (403 or 404); nothing
    // changes.
    const second = await createSecondOrganization(request, club)
    const foreign = await preview(request, second.adminToken, [person], lastDay)
    expect([403, 404]).toContain(foreign.status)
    const foreignDepart = await depart(request, second.adminToken, {
      personIds: [person],
      lastDay,
      previewToken: '1.x',
    })
    expect([403, 404]).toContain(foreignDepart.status)
    const foreignReturn = await call(request, 'POST', `/api/people/persons/${person}/return`, second.adminToken)
    expect([403, 404]).toContain(foreignReturn.status)

    // A member without `people.manage` (a coach): 403 on every route.
    const family = await familyFor(request, club)
    const coachPreview = await preview(request, family.coach.token, [person], lastDay)
    expect(coachPreview.status).toBe(403)
    const coachDepart = await depart(request, family.coach.token, { personIds: [person], lastDay, previewToken: '1.x' })
    expect(coachDepart.status).toBe(403)
    const coachReturn = await call(request, 'POST', `/api/people/persons/${person}/return`, family.coach.token)
    expect(coachReturn.status).toBe(403)
    const coordinator = await preview(request, family.academyCoordinator.token, [person], lastDay)
    expect(coordinator.status).toBe(403)
    expect(await leftOn(request, admin, person)).toBeNull()
  } finally {
    await club.cleanup()
  }
})
