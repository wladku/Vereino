import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { addDays, createActivity, listOccurrences, type OccurrenceItem } from '../_fixtures/activities'
import { familyFor, sessionsOf } from '../_fixtures/attendance'
import { prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub, getPerson, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { addMaintainer } from '../_fixtures/maintenance'
import { chargeOf, createFee, generate, listCharges, periodFromNow, type CodedBody } from '../_fixtures/payments'
import { actionLogEntries } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// People life-cycle spec phase L5 (#307; REQ-L04, J-L03, AC-L05): TEST-L06 — coach Rafał leads the Żaki training and
// the pool class (default coach of both, sessions in both groups after the last day), has a contract, maintains the
// pitch and holds cash he took from a parent. The preview shows the cash as a blocker with the amount and a link to
// B-33, the contract and the maintainer row among what ends, and both groups under "Sessions and activities"; the
// confirm is refused (409 `departure_blocked`). Once the cash is accepted on B-33: 422 `departure_handover_required`
// without a choice, 403 for a section coordinator (no `people.manage`), 422 `departure_handover_coach_invalid` for a
// target who is not a coach — nothing changes on a refusal. Handing Żaki to Marek and leaving the pool unassigned: from
// the day after the last day the sessions carry Marek or no coach, each with a substitution entry, the default coaches
// follow, the freed pool sessions are listed as "needing a coach", the contract ends on the last day and the
// maintainer row is gone. The undo before the last day restores coaches, default coaches, the contract and the
// maintainer row with correcting `coach_restored` entries (the entries are append-only), and leaves alone a session
// whose coach was changed since. The Leaving tab is checked in the browser (light and dark, axe).
test.describe.configure({ timeout: 420_000 })

type HandOverNeed = { groupId: string; groupName: string | null; sessions: number; activities: number }
type PlanPerson = {
  id: string
  ends: { module: string; kind: string; recordId: string; action: string; until: string | null }[]
  blockers: { module: string; code: string; params?: Record<string, string | number | null> }[]
  handOvers: HandOverNeed[]
}
type Plan = { blocked: boolean; persons: PlanPerson[]; previewToken: string }
type Coded = CodedBody

async function previewOk(request: APIRequestContext, token: string, personId: string, lastDay: string) {
  const result = await call<Plan>(request, 'POST', '/api/people/departures/preview', token, {
    data: { personIds: [personId], lastDay },
  })
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body as Plan
}

function depart(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<Coded>(request, 'POST', '/api/people/departures', token, { data })
}

async function leftOn(request: APIRequestContext, token: string, personId: string): Promise<string | null> {
  return ((await getPerson(request, token, personId)).body as { leftOn?: string | null }).leftOn ?? null
}

async function query<T extends Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
  return withClient(async (client) => (await client.query<T>(sql, params)).rows)
}

/** Each session of the activity: its slot day and current coach. */
async function coaches(
  club: Club,
  activityId: string,
): Promise<Array<{ id: string; day: string; coach: string | null }>> {
  return query<{ id: string; day: string; coach: string | null }>(
    `select id, to_char(occurrence_date, 'YYYY-MM-DD') as day, coach_person_id as coach from activities_occurrences
      where tenant_id = $1 and activity_id = $2 and deleted_at is null and status = 'planned' order by start_at`,
    [club.tenant.tenantId, activityId],
  )
}

async function defaultCoach(club: Club, activityId: string): Promise<string | null> {
  const rows = await query<{ coach: string | null }>(
    'select default_coach_person_id as coach from activities_activities where tenant_id = $1 and id = $2',
    [club.tenant.tenantId, activityId],
  )
  return rows[0]?.coach ?? null
}

async function entries(club: Club, sessionIds: string[]) {
  return query<{ occurrence_id: string; kind: string; new_coach_person_id: string | null }>(
    `select occurrence_id, kind, new_coach_person_id from activities_substitution_entries
      where tenant_id = $1 and occurrence_id = any($2::uuid[]) order by created_at, id`,
    [club.tenant.tenantId, sessionIds],
  )
}

async function contractEnd(club: Club, id: string): Promise<string | null> {
  const rows = await query<{ valid_to: string | null }>(
    `select to_char(valid_to, 'YYYY-MM-DD') as valid_to from club_core_contracts where tenant_id = $1 and id = $2`,
    [club.tenant.tenantId, id],
  )
  return rows[0]?.valid_to ?? null
}

async function maintainerRows(club: Club, personId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    'select id from facilities_place_maintainers where tenant_id = $1 and person_id = $2',
    [club.tenant.tenantId, personId],
  )
  return rows.map((row) => row.id)
}

test('TEST-L06 a leaving coach: cash blocks, sessions handed over or freed, contract and maintainer end; undo', async ({
  page,
  request,
}, testInfo: TestInfo) => {
  const club = await createClub(request, 'test-l06')
  try {
    const family = await familyFor(request, club)
    let admin = club.adminToken
    const today = calendarDate()
    const since = addDays(today, -30)
    const lastDay = addDays(today, 10)

    // Rafał coaches both groups and is the default coach of both series.
    const rafal = await signedInStaff(request, club, { firstName: 'Rafał', lastName: 'Odchodzi', role: 'coach' })
    for (const groupId of [family.zaki, family.poolGroup]) {
      await addMembership(request, admin, { groupId, personId: rafal.personId, role: 'coach', validFrom: since })
    }
    const until = `${String(Number(today.slice(0, 4)) + 1)}0630`
    const zakiTraining = await createActivity(request, admin, {
      groupId: family.zaki,
      name: 'Trening L06',
      type: 'training',
      placeId: family.pitch,
      coachPersonId: rafal.personId,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${until}`,
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    })
    const poolClass = await createActivity(request, admin, {
      groupId: family.poolGroup,
      name: 'Basen L06',
      type: 'training',
      placeId: family.poolPlace,
      coachPersonId: rafal.personId,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TH;UNTIL=${until}`,
      startsOn: today,
      startTime: '18:00',
      endTime: '19:00',
    })
    const zakiAfter = (await coaches(club, zakiTraining.id)).filter((row) => row.day > lastDay)
    const poolAfter = (await coaches(club, poolClass.id)).filter((row) => row.day > lastDay)
    const zakiBefore = (await coaches(club, zakiTraining.id)).filter((row) => row.day <= lastDay)
    expect(zakiAfter.length).toBeGreaterThan(0)
    expect(poolAfter.length).toBeGreaterThan(0)
    expect([...zakiAfter, ...poolAfter, ...zakiBefore].every((row) => row.coach === rafal.personId)).toBe(true)

    // A contract and a place maintainer row.
    const contract = await call<{ id?: string }>(request, 'POST', '/api/club_core/contracts', admin, {
      data: { partyType: 'person', partyId: rafal.personId, kind: 'other', validFrom: since },
    })
    expect(contract.status, JSON.stringify(contract.body)).toBe(201)
    const contractId = String(contract.body?.id)
    const maintainer = await addMaintainer(request, admin, { placeId: family.pitch, personId: rafal.personId })
    expect(maintainer.status, JSON.stringify(maintainer.body)).toBe(201)
    const maintainerId = String(maintainer.body?.id)

    // Rafał takes PLN 150 in cash for Kuba's Żaki fee: cash he holds.
    const fee = await createFee(request, admin, {
      name: 'Żaki L06',
      groupId: family.zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 28,
      validFrom: since,
    })
    const period = periodFromNow(0)
    expect((await generate(request, admin, period)).status).toBe(200)
    const kubaFee = chargeOf(await listCharges(request, admin, `&period=${period}`), family.elder.personId, fee)
    const taken = await call<CodedBody>(request, 'POST', '/api/payments/group-charges/cash', rafal.token, {
      data: {
        groupId: family.zaki,
        participantPersonId: family.elder.personId,
        chargeIds: [kubaFee.id],
        amount: 15000,
        paidOn: today,
      },
    })
    expect(taken.status, JSON.stringify(taken.body)).toBe(201)

    // The preview: the cash blocker with the amount; the contract and the maintainer row; both groups to hand over.
    const blockedPlan = await previewOk(request, admin, rafal.personId, lastDay)
    expect(blockedPlan.blocked).toBe(true)
    const person = blockedPlan.persons[0]
    expect(person.blockers).toEqual([
      expect.objectContaining({
        module: 'payments',
        code: 'cash_held',
        params: expect.objectContaining({ amount: 15000 }),
      }),
    ])
    expect(person.ends).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'contract', recordId: contractId, action: 'end', until: lastDay }),
        expect.objectContaining({ kind: 'place_maintainer', recordId: maintainerId, action: 'remove' }),
      ]),
    )
    const needs = new Map(person.handOvers.map((need) => [need.groupId, need]))
    expect(needs.get(family.zaki)).toMatchObject({ sessions: zakiAfter.length, activities: 1 })
    expect(needs.get(family.poolGroup)).toMatchObject({ sessions: poolAfter.length, activities: 1 })
    const handOver = [
      { groupId: family.zaki, toPersonId: family.coach.personId },
      { groupId: family.poolGroup, toPersonId: null },
    ]
    const blocked = await depart(request, admin, {
      personIds: [rafal.personId],
      lastDay,
      previewToken: blockedPlan.previewToken,
      handOver,
    })
    expect(blocked.status).toBe(409)
    expect(blocked.body?.code).toBe('departure_blocked')
    expect(await leftOn(request, admin, rafal.personId)).toBeNull()

    // The Leaving tab shows the same refusal (AC-L05, #598): the cash blocker names the amount, "Confirm leaving" stays
    // disabled, and the link opens B-33 "Cash to settle" with Rafał's cash on it. `signInBrowser` ends the admin's API
    // token, so a fresh one is taken from the returned password.
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    admin = await getAuthToken(request, club.tenant.email, adminPassword)
    club.adminToken = admin
    await page.goto(`/backend/people/persons/${rafal.personId}?tab=leaving`)
    const blockers = page.getByTestId('people-leaving-blockers')
    await expect(blockers).toBeVisible()
    await expect(blockers).toContainText(uiText('people.leaving.preview.blocks'))
    await expect(blockers).toContainText('Odchodzi')
    await expect(blockers).toContainText(/150[.,]00/)
    await expect(page.getByTestId('people-leaving-confirm')).toBeDisabled()
    const cashLink = page.getByTestId('people-leaving-cash-link')
    await expect(cashLink).toHaveText(uiText('people.leaving.blocker.cashLink', { exact: true }))
    await expect(cashLink).toHaveAttribute('href', '/backend/payments/cash-custody')
    await cashLink.click()
    await expect(page).toHaveURL(/\/backend\/payments\/cash-custody$/)
    await expect(page.getByTestId('custody-person')).toContainText('Odchodzi')

    // The administrator accepts the cash on B-33; the blocker is gone.
    const custody = await call<{ items?: { collectorPersonId: string; payments: { paymentId: string }[] }[] }>(
      request,
      'GET',
      '/api/payments/cash-custody',
      admin,
    )
    const held = custody.body?.items?.find((item) => item.collectorPersonId === rafal.personId)
    const settled = await call<CodedBody>(request, 'POST', '/api/payments/cash-handovers', admin, {
      data: { collectorPersonId: rafal.personId, paymentIds: held?.payments.map((payment) => payment.paymentId) },
    })
    expect(settled.status, JSON.stringify(settled.body)).toBe(201)
    const plan = await previewOk(request, admin, rafal.personId, lastDay)
    expect(plan.blocked).toBe(false)

    // No choice: 422 naming both groups. A coordinator: 403. A target who is not a coach: 422. Nothing changes.
    const noChoice = await depart(request, admin, {
      personIds: [rafal.personId],
      lastDay,
      previewToken: plan.previewToken,
    })
    expect(noChoice.status).toBe(422)
    expect(noChoice.body?.code).toBe('departure_handover_required')
    expect(JSON.stringify(noChoice.body)).toContain(family.zaki)
    expect(JSON.stringify(noChoice.body)).toContain(family.poolGroup)
    const coordinator = await depart(request, family.poolCoordinator.token, {
      personIds: [rafal.personId],
      lastDay,
      previewToken: plan.previewToken,
      handOver: [
        { groupId: family.zaki, toPersonId: family.instructor.personId },
        { groupId: family.poolGroup, toPersonId: null },
      ],
    })
    expect(coordinator.status).toBe(403)
    const notCoach = await depart(request, admin, {
      personIds: [rafal.personId],
      lastDay,
      previewToken: plan.previewToken,
      handOver: [
        { groupId: family.zaki, toPersonId: family.younger.personId },
        { groupId: family.poolGroup, toPersonId: null },
      ],
    })
    expect(notCoach.status).toBe(422)
    expect(notCoach.body?.code).toBe('departure_handover_coach_invalid')
    expect(await leftOn(request, admin, rafal.personId)).toBeNull()
    expect(await contractEnd(club, contractId)).toBeNull()
    expect(await maintainerRows(club, rafal.personId)).toEqual([maintainerId])
    expect((await coaches(club, zakiTraining.id)).every((row) => row.coach === rafal.personId)).toBe(true)

    // Żaki to Marek, the pool left unassigned.
    const confirmed = await depart(request, admin, {
      personIds: [rafal.personId],
      lastDay,
      previewToken: plan.previewToken,
      handOver,
    })
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
    const zakiNow = await coaches(club, zakiTraining.id)
    const poolNow = await coaches(club, poolClass.id)
    for (const row of zakiNow) {
      expect(row.coach).toBe(row.day > lastDay ? family.coach.personId : rafal.personId)
    }
    for (const row of poolNow) expect(row.coach).toBe(row.day > lastDay ? null : rafal.personId)
    const handed = [...zakiAfter, ...poolAfter].map((row) => row.id)
    const written = await entries(club, handed)
    expect(written).toHaveLength(handed.length)
    expect(written.filter((entry) => entry.kind === 'substitute_assigned')).toHaveLength(zakiAfter.length)
    expect(written.filter((entry) => entry.kind === 'absence_reported')).toHaveLength(poolAfter.length)
    expect(await defaultCoach(club, zakiTraining.id)).toBe(family.coach.personId)
    expect(await defaultCoach(club, poolClass.id)).toBeNull()
    expect(await contractEnd(club, contractId)).toBe(lastDay)
    expect(await maintainerRows(club, rafal.personId)).toEqual([])
    expect(await leftOn(request, admin, rafal.personId)).toBe(lastDay)
    const needing = await listOccurrences(request, family.poolCoordinator.token, '&unassigned=1')
    expect(needing.items.map((item: OccurrenceItem) => item.id)).toEqual(
      expect.arrayContaining(poolAfter.map((row) => row.id)),
    )

    // The pool coordinator gives one freed session to Irena: the undo leaves that session alone.
    const firstPool = (await sessionsOf(request, club, poolClass.id)).find((item) => item.id === poolAfter[0]?.id)
    const assigned = await call<CodedBody>(
      request,
      'POST',
      `/api/activities/occurrences/${String(firstPool?.id)}/coach`,
      admin,
      {
        data: { coachPersonId: family.instructor.personId },
        headers: firstPool?.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: firstPool.updatedAt } : {},
      },
    )
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200)

    // The undo restores the coaches, the default coaches, the contract and the maintainer row; the entries stay and
    // each restored session gets a `coach_restored` entry.
    const log = (await actionLogEntries(request, admin, rafal.personId)).find(
      (entry) => entry.commandId === 'people.persons.depart',
    )
    expect(log?.undoToken).toBeTruthy()
    const undone = await undoByToken(request, admin, String(log?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    for (const row of await coaches(club, zakiTraining.id)) expect(row.coach).toBe(rafal.personId)
    for (const row of await coaches(club, poolClass.id)) {
      expect(row.coach).toBe(row.id === firstPool?.id ? family.instructor.personId : rafal.personId)
    }
    expect(await defaultCoach(club, zakiTraining.id)).toBe(rafal.personId)
    expect(await defaultCoach(club, poolClass.id)).toBe(rafal.personId)
    expect(await contractEnd(club, contractId)).toBeNull()
    expect(await maintainerRows(club, rafal.personId)).toEqual([maintainerId])
    expect(await leftOn(request, admin, rafal.personId)).toBeNull()
    const restored = (await entries(club, handed)).filter((entry) => entry.kind === 'coach_restored')
    expect(restored).toHaveLength(handed.length - 1)
    expect(restored.every((entry) => entry.new_coach_person_id === rafal.personId)).toBe(true)

    // The Leaving tab: both groups under "Sessions and activities"; "Confirm leaving" waits for both choices.
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await prepareForAccessibilityScan(page)
    await page.goto(`/backend/people/persons/${rafal.personId}?tab=leaving`)
    const table = page.getByTestId('people-leaving-handover')
    await expect(table).toBeVisible()
    await expect(table).toContainText(uiText('people.leaving.handOver.title'))
    const selects = page.getByTestId('people-leaving-handover-choice')
    await expect(selects).toHaveCount(2)
    const confirm = page.getByTestId('people-leaving-confirm')
    await expect(confirm).toBeDisabled()
    for (const index of [0, 1]) {
      await selects.nth(index).click()
      await page.getByRole('option', { name: uiText('people.leaving.handOver.unassigned', { exact: true }) }).click()
    }
    await expect(confirm).toBeEnabled()
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      'B-10 ?tab=leaving (coach)',
      async () => {
        await expect(page.getByTestId('people-leaving-handover')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
