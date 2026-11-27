import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { createActivity } from '../_fixtures/activities'
import {
  addParticipants,
  familyFor,
  readAttendanceList,
  saveAttendanceList,
  sessionsOf,
  type Family,
} from '../_fixtures/attendance'
import {
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  uniqueSuffix,
  type Club,
} from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { updateClubSettings } from '../_fixtures/members'
import { createGuardianship } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// Issue #820 (E27-S03; product brief Goals, D21; club spec *Overview and Success Measures*; owner decision 2026-11-26):
// the pilot's leading indicators per section next to the declaration share, for the same period. The academy
// (section A) has 20 guardians of its active participants, 15 with an active account; 10 sessions that ended in the
// period and were not cancelled — 8 lists closed within 24 h of the end (one of them found through the action log of
// a real check-off, its session changed again later), 1 closed after 30 h and 1 still open — plus a cancelled one;
// 12 membership-fee charges due in the period — 9 paid in full by the due date, 2 paid later (one partly paid by the
// due date) and 1 open — plus a rental charge paid on time, which never counts; 3 sessions that lost their coach, 2
// covered before the start. The pool section has no session without a coach ("None needed"). The report reads
// "Accounts 15 of 20 (75%)", "8 of 10", "9 of 12" and "2 of 3". The `payments`-disabled case (the indicator hidden,
// not 0) is the unit-tested `showsPaidOnTime` rule: this runtime always enables `payments`.
// Times, closings, substitutions, charges and payments are seeded in the database: the counting rules are what this
// test checks, and a list closed three days ago cannot be made through the API today.
test.describe.configure({ timeout: 900_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type Indicator = { count: number; total: number; percent: number | null }
type Indicators = {
  accounts: Indicator
  attendanceWithinDay: Indicator
  paidOnTime: Indicator | null
  coverBeforeStart: Indicator
}
type Row = { sectionId: string; indicators?: Indicators | null }
type Report = { code?: string; paymentsEnabled?: boolean; items?: Row[] }

async function report(request: APIRequestContext, token: string, query = '') {
  return call<Report>(request, 'GET', `/api/activities/reports/declaration-share${query ? `?${query}` : ''}`, token)
}

const indicatorsOf = (body: Report | null, sectionId: string): Indicators | null | undefined =>
  body?.items?.find((row) => row.sectionId === sectionId)?.indicators

/** A one-off academy session today at `hour`:00–`hour`:45; returns its session id. */
async function session(request: APIRequestContext, club: Club, family: Family, name: string, hour: number) {
  const time = `${String(hour).padStart(2, '0')}:00`
  const { id } = await createActivity(request, club.adminToken, {
    groupId: family.zaki,
    name,
    type: 'training',
    placeId: family.pitch,
    coachPersonId: family.coach.personId,
    startsOn: calendarDate(),
    startTime: time,
    endTime: `${String(hour).padStart(2, '0')}:45`,
  })
  const occurrence = (await sessionsOf(request, club, id)).at(0)
  if (!occurrence) throw new Error(`[test] ${name} has no session`)
  return occurrence.id
}

/**
 * Moves a session three days back (it ended at `now() − 3 days`; its date stays today, so it is in the period) with
 * `status`; `closedAfterHours` sets the version a closed list leaves (the end plus that many hours).
 */
async function pastSession(occurrenceId: string, status: string, closedAfterHours?: number): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `update activities_occurrences
          set start_at = now() - interval '3 days 1 hour', end_at = now() - interval '3 days', status = $2,
              updated_at = case when $3::int is null then updated_at
                                else now() - interval '3 days' + make_interval(hours => $3::int) end
        where id = $1`,
      [occurrenceId, status, closedAfterHours ?? null],
    )
  })
}

test('E27-S03 the administrator sees the pilot leading indicators next to the declaration share', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e27-s03')
  const { tenantId, organizationId } = club.tenant
  try {
    const family = await familyFor(request, club)

    // --- Accounts: Anna and Piotr (family, active) + 18 guardians: 13 active, 2 invited, 3 without an account ---
    const wards = await addParticipants(request, club, family.zaki, 18)
    const activeUserIds: string[] = []
    for (const [index, wardId] of wards.entries()) {
      const guardianId = await createPerson(request, club.adminToken, {
        firstName: `Opiekun${String(index + 1).padStart(2, '0')}`,
        lastName: 'Testowy',
        birthDate: birthDateTurning(40),
      })
      await createGuardianship(request, club.adminToken, {
        guardianPersonId: guardianId,
        wardPersonId: wardId,
        isPrimaryPayer: true,
        consents: { regulations: true },
        validFrom: calendarDate(-30),
      })
      if (index >= 15) continue
      const account = await createAccount(
        request,
        club.adminToken,
        guardianId,
        `opiekun${String(index + 1)}-${uniqueSuffix()}@example.org`,
      )
      expect(account.status, JSON.stringify(account.body)).toBe(201)
      const userId = String(account.body?.userId)
      club.extraUserIds.push(userId)
      if (index < 13) activeUserIds.push(userId)
    }
    // An invited guardian becomes active with the first sign-in.
    await withClient(async (client) => {
      await client.query(`update users set last_login_at = now() - interval '1 day' where id = any($1::uuid[])`, [
        activeUserIds,
      ])
    })

    // --- Attendance: 10 ended sessions (8 closed within 24 h, 1 after 30 h, 1 open) and a cancelled one ---
    const sessions: string[] = []
    for (let index = 0; index < 11; index += 1) {
      sessions.push(await session(request, club, family, `Trening ${String(index + 1)}`, 6 + index))
    }
    for (const id of sessions.slice(0, 7)) await pastSession(id, 'done', 2)
    await pastSession(sessions[8], 'done', 30)
    await pastSession(sessions[9], 'planned')
    await pastSession(sessions[10], 'cancelled', 2)
    // The eighth list is closed through the check-off; the action log keeps when (moved to an hour after the end),
    // and the session's version moves past the deadline (a later change), so only the log tells it was on time.
    await pastSession(sessions[7], 'planned')
    const list = await readAttendanceList(request, club.adminToken, sessions[7])
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    const closed = await saveAttendanceList(
      request,
      club.adminToken,
      sessions[7],
      {
        entries: (list.body?.rows ?? [])
          .filter((row) => row.onRoster)
          .map((row) => ({ personId: row.personId, actual: 'present' as const })),
        complete: true,
      },
      list.body?.occurrence?.updatedAt,
    )
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    await withClient(async (client) => {
      await client.query(
        `update action_logs set created_at = now() - interval '3 days' + interval '1 hour'
          where resource_kind = 'activities.occurrence' and resource_id = $1`,
        [sessions[7]],
      )
      const version = await client.query<{ updated_at: Date; end_at: Date }>(
        'select updated_at, end_at from activities_occurrences where id = $1',
        [sessions[7]],
      )
      const row = version.rows[0]
      expect(row.updated_at.getTime() - row.end_at.getTime()).toBeGreaterThan(24 * 3_600_000)
    })

    // --- Cover: 3 sessions lost their coach before the start, 2 got a substitute before it ---
    await withClient(async (client) => {
      for (const [index, id] of sessions.slice(0, 3).entries()) {
        await client.query(
          `insert into activities_substitution_entries (organization_id, tenant_id, created_at, occurrence_id,
              previous_coach_person_id, new_coach_person_id, kind, decided_by_person_id, acting_role)
            select $1, $2, o.start_at - interval '2 days', o.id, $3, null, 'absence_reported', $3, 'coach'
              from activities_occurrences o where o.id = $4`,
          [organizationId, tenantId, family.coach.personId, id],
        )
        if (index === 2) continue
        await client.query(
          `insert into activities_substitution_entries (organization_id, tenant_id, created_at, occurrence_id,
              previous_coach_person_id, new_coach_person_id, kind, decided_by_person_id, acting_role)
            select $1, $2, o.start_at - interval '1 day', o.id, null, $3, 'substitute_assigned', $4, 'coordinator'
              from activities_occurrences o where o.id = $5`,
          [organizationId, tenantId, family.instructor.personId, family.academyCoordinator.personId, id],
        )
      }
    })

    // --- Charges: 12 fee charges due 5 days ago (9 on time, 2 late — one partly paid by then —, 1 open) + a rental ---
    const due = calendarDate(-5)
    const dayBefore = calendarDate(-6)
    const later = calendarDate(-3)
    await withClient(async (client) => {
      const fee = await client.query<{ id: string }>(
        `insert into payments_fees (organization_id, tenant_id, created_at, updated_at, name, amount, period, group_id,
            due_day, valid_from)
          values ($1, $2, now(), now(), 'Składka Żaki', 10000, 'monthly', $3, 10, $4) returning id`,
        [organizationId, tenantId, family.zaki, calendarDate(-60)],
      )
      const charge = async (
        sourceType: string,
        sourceId: string | null,
        status: string,
        payments: [number, string][],
      ) => {
        const created = await client.query<{ id: string }>(
          `insert into payments_charges (organization_id, tenant_id, created_at, updated_at, source_type, source_id,
              person_id, description, amount, due_date, status)
            values ($1, $2, now(), now(), $3, $4, $5, 'E27-S03', 10000, $6, $7) returning id`,
          [organizationId, tenantId, sourceType, sourceId, family.younger.personId, due, status],
        )
        for (const [amount, paidOn] of payments) {
          await client.query(
            `insert into payments_payments (organization_id, tenant_id, created_at, updated_at, charge_id, amount, method,
                paid_on)
              values ($1, $2, now(), now(), $3, $4, 'transfer', $5)`,
            [organizationId, tenantId, created.rows[0].id, amount, paidOn],
          )
        }
      }
      const feeId = fee.rows[0].id
      for (let index = 0; index < 9; index += 1) {
        await charge('fee', feeId, 'paid', [[10000, index === 0 ? due : dayBefore]])
      }
      await charge('fee', feeId, 'paid', [[10000, later]])
      await charge('fee', feeId, 'paid', [
        [5000, dayBefore],
        [5000, later],
      ])
      await charge('fee', feeId, 'open', [])
      await charge('rental', null, 'paid', [[10000, dayBefore]])
    })

    // --- The API ---
    const full = await report(request, club.adminToken)
    expect(full.status, JSON.stringify(full.body)).toBe(200)
    expect(full.body?.paymentsEnabled).toBe(true)
    expect(indicatorsOf(full.body, family.academy)).toEqual({
      accounts: { count: 15, total: 20, percent: 75 },
      attendanceWithinDay: { count: 8, total: 10, percent: 80 },
      paidOnTime: { count: 9, total: 12, percent: 75 },
      coverBeforeStart: { count: 2, total: 3, percent: 67 },
    })
    // The pool: Anna guards Hania (also in the pool group); no session, charge or substitution.
    expect(indicatorsOf(full.body, family.pool)).toEqual({
      accounts: { count: 1, total: 1, percent: 100 },
      attendanceWithinDay: { count: 0, total: 0, percent: null },
      paidOnTime: { count: 0, total: 0, percent: null },
      coverBeforeStart: { count: 0, total: 0, percent: null },
    })
    // A period without these sessions and charges counts none of them; accounts are counted on its last day.
    const past = await report(request, club.adminToken, `from=${calendarDate(-60)}&to=${calendarDate(-40)}`)
    expect(indicatorsOf(past.body, family.academy)).toMatchObject({
      accounts: { total: 0 },
      attendanceWithinDay: { total: 0 },
      paidOnTime: { total: 0 },
      coverBeforeStart: { total: 0 },
    })
    // The coordinator reads their section with the same numbers; a coach gets 403 and nothing.
    const academy = await report(request, family.academyCoordinator.token)
    expect(academy.body?.items?.map((row) => row.sectionId)).toEqual([family.academy])
    expect(indicatorsOf(academy.body, family.academy)?.paidOnTime).toEqual({ count: 9, total: 12, percent: 75 })
    const denied = await report(request, family.coach.token)
    expect(denied.status).toBe(403)
    expect(denied.body).not.toHaveProperty('items')

    // --- The panel page ---
    expect((await updateClubSettings(request, club.adminToken, { defaultLocale: 'en' })).status).toBe(200)
    page.setDefaultTimeout(30_000)
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)
    await page.goto('/backend/activities/reports/declaration-share')
    const value = (count: number, total: number, percent: number) =>
      uiText('activities.reports.pilotIndicators.value', { exact: true, params: { count, total, percent } })
    await expect(page.getByTestId(`pilot-indicator-accounts-${family.academy}`)).toHaveText(value(15, 20, 75))
    await expect(page.getByTestId(`pilot-indicator-attendanceWithinDay-${family.academy}`)).toHaveText(value(8, 10, 80))
    await expect(page.getByTestId(`pilot-indicator-paidOnTime-${family.academy}`)).toHaveText(value(9, 12, 75))
    await expect(page.getByTestId(`pilot-indicator-coverBeforeStart-${family.academy}`)).toHaveText(value(2, 3, 67))
    await expect(page.getByTestId(`pilot-indicator-coverBeforeStart-${family.pool}`)).toHaveText(
      uiText('activities.reports.pilotIndicators.noneNeeded', { exact: true }),
    )
    await expect(page.getByTestId(`pilot-indicator-attendanceWithinDay-${family.pool}`)).toHaveText(
      uiText('activities.reports.pilotIndicators.noEndedSessions', { exact: true }),
    )
    // Counts only: no guardian's name on the page.
    await expect(page.locator('main')).not.toContainText('Opiekun01')
  } finally {
    await club.cleanup()
  }
})
