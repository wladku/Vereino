import { expect, test } from '@playwright/test'
import { apiRequest } from '@open-mercato/core/helpers/integration/api'
import { Client } from 'pg'
import {
  calendarItems,
  declare,
  entryOf,
  familyFor,
  hoursAfter,
  oneOff,
  personOf,
  runExpiryAsync,
  type AttendanceResult,
  type CalendarDeclaration,
} from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, createClub, type Club } from '../_fixtures/club'

// Issue #589, foundation II spec TEST-G03 (declaration part) and AC-G02: the job-driven command
// `activities.attendance.expire` races a guardian's decision on the same declaration. The race is made deterministic
// with a row lock the test holds in PostgreSQL (no production hook): the guardian's decision queues first on the
// declaration's row lock (`SELECT … FOR UPDATE`); the expiry job then reads the declaration as `pending_guardian` and
// queues its conditional UPDATE behind the decision. Released, the decision commits first, so the job's UPDATE finds the
// row no longer `pending_guardian` and changes nothing: the job reports the row as `skipped`, leaves it out of
// `changedIds` (it emits `activities.attendance.guardian_decided` only for the ids it won — the row's only event is the
// decision's), and the lock token is the decision's. A second declaration nobody touches is moved by the same run.
test.describe.configure({ timeout: 300_000 })

const WAIT_MS = 120_000

/** The backends waiting (wait event `Lock`) behind any of `blockers`, other than the blockers themselves. */
async function waitersBehind(db: Client, blockers: number[]): Promise<number[]> {
  const { rows } = await db.query<{ pid: number }>(
    `select pid from pg_stat_activity
      where wait_event_type = 'Lock' and pg_blocking_pids(pid) && $1::int[] and not (pid = any($1::int[]))`,
    [blockers],
  )
  return rows.map((row) => row.pid)
}

/** The other busy backends, for the failure message when an expected waiter never shows up. */
async function busyBackends(db: Client): Promise<string> {
  const { rows } = await db.query(
    `select pid, state, wait_event_type, wait_event, pg_blocking_pids(pid) as blocked_by, left(query, 160) as query
       from pg_stat_activity where pid <> pg_backend_pid() and state <> 'idle' and backend_type = 'client backend'`,
  )
  return JSON.stringify(rows)
}

async function waitForWaiter(
  db: Client,
  blockers: number[],
  what: string,
  settled: () => string | null = () => null,
): Promise<number> {
  let found: number[] = []
  try {
    await expect
      .poll(
        async () => {
          const early = settled()
          if (early) throw new Error(`${what} finished before it queued: ${early}`)
          found = await waitersBehind(db, blockers)
          return found.length
        },
        { message: `${what} queues on the declaration's row lock`, timeout: WAIT_MS, intervals: [100, 250, 500] },
      )
      .toBeGreaterThan(0)
  } catch (error) {
    throw new Error(`${String(error)}\nbusy backends: ${await busyBackends(db)}`)
  }
  return found[0]
}

/**
 * The guardian's decision, waiting as long as the race needs: it stays queued on the row lock while the job's CLI boots,
 * longer than the fixtures' 30-second request timeout, and a transport retry would send it twice.
 */
async function guardianDecideQueued(
  request: Parameters<typeof calendarItems>[0],
  token: string,
  attendanceId: string,
  lockToken: string,
): Promise<{ status: number; body: AttendanceResult }> {
  const response = await apiRequest(request, 'POST', `/api/activities/attendance/${attendanceId}/guardian-decision`, {
    token,
    data: { approve: true },
    headers: { [OPTIMISTIC_LOCK_HEADER]: lockToken },
    timeout: 3 * WAIT_MS,
    retryTransport: false,
  })
  return { status: response.status(), body: (await response.json()) as AttendanceResult }
}

async function declarationOf(
  request: Parameters<typeof calendarItems>[0],
  token: string,
  session: { date: string; session: { id: string } },
  personId: string,
): Promise<CalendarDeclaration> {
  const entry = entryOf(
    await calendarItems(request, token, `from=${session.date}&to=${session.date}&as=guardian`),
    session.session.id,
  )
  const declaration = personOf(entry, personId).declaration
  if (!declaration) throw new Error('[internal] no declaration for ' + personId)
  return declaration
}

test('TEST-G03 the expiry job reports skipped for a declaration the guardian decided first, emits nothing for it and moves the rest', async ({
  request,
}) => {
  const club: Club = await createClub(request, 'test-g03')
  // `db` holds the row lock in a transaction; `monitor` watches the waiters outside it (`pg_stat_activity` is a
  // snapshot taken once per transaction, so a poll inside the locking transaction would never see a new waiter).
  const db = new Client({ connectionString: process.env.DATABASE_URL })
  const monitor = new Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  await monitor.connect()
  let inTransaction = false
  try {
    const family = await familyFor(request, club)
    const coordinator = family.academyCoordinator.token

    // Two matches; the 16-year-old's own `yes` waits for the guardian on both (`guardian_confirm`, 24 hours).
    const raced = await oneOff(request, club, coordinator, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Mecz — wyścig',
      type: 'match',
      weekday: 'SA',
      fromDaysAhead: 9,
      start: '11:00',
      end: '12:30',
    })
    const untouched = await oneOff(request, club, coordinator, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Mecz — bez decyzji',
      type: 'match',
      weekday: 'SU',
      fromDaysAhead: 9,
      start: '11:00',
      end: '12:30',
    })
    const racedYes = await declare(request, family.elder.token, {
      occurrenceId: raced.session.id,
      personId: family.elder.personId,
      declared: 'yes',
    })
    expect(racedYes.status, JSON.stringify(racedYes.body)).toBe(201)
    expect(racedYes.body?.declarationStatus).toBe('pending_guardian')
    const untouchedYes = await declare(request, family.elder.token, {
      occurrenceId: untouched.session.id,
      personId: family.elder.personId,
      declared: 'yes',
    })
    expect(untouchedYes.status, JSON.stringify(untouchedYes.body)).toBe(201)
    expect(untouchedYes.body?.declarationStatus).toBe('pending_guardian')
    const racedId = String(racedYes.body?.id)
    const untouchedId = String(untouchedYes.body?.id)
    const tokenBefore = String(racedYes.body?.updatedAt)
    // Both limits have passed for the job's clock; the guardian decides with the real clock.
    const jobNow = hoursAfter(String(untouchedYes.body?.declaredAt), 25)

    // The test holds the raced declaration's row lock.
    await db.query('begin')
    inTransaction = true
    const locked = await db.query(
      'select id from activities_attendances where id = $1 and tenant_id = $2 and organization_id = $3 for update',
      [racedId, club.tenant.tenantId, club.tenant.organizationId],
    )
    expect(locked.rowCount).toBe(1)
    const { rows: ownRows } = await db.query<{ pid: number }>('select pg_backend_pid() as pid')
    const testPid = ownRows[0].pid

    // The guardian's decision queues first; then the job reads the row (`pending_guardian`) and queues behind it.
    const decision = guardianDecideQueued(request, family.guardian.token, racedId, tokenBefore)
    const decisionPid = await waitForWaiter(monitor, [testPid], "the guardian's decision")
    let jobSettled: string | null = null
    const job = runExpiryAsync(club, jobNow)
    job.then(
      (value) => (jobSettled = JSON.stringify(value)),
      (error: unknown) => (jobSettled = String(error)),
    )
    await waitForWaiter(monitor, [testPid, decisionPid], 'the expiry job', () => jobSettled)

    await db.query('rollback')
    inTransaction = false

    const decided = await decision
    expect(decided.status, JSON.stringify(decided.body)).toBe(200)
    expect(decided.body.declarationStatus).toBe('final')
    const result = await job

    // The job counted the raced row as due, lost it and reports it skipped; it moved only the untouched one.
    expect(result, JSON.stringify(result)).toMatchObject({ processed: 1, skipped: 1, failed: 0 })
    expect(result.changedIds).toEqual([untouchedId])
    expect(result.changedIds).not.toContain(racedId)

    // The raced row carries the guardian's decision and its lock token, not the job's write (`updatedAt = now`).
    const racedAfter = await declarationOf(request, family.guardian.token, raced, family.elder.personId)
    expect(racedAfter).toMatchObject({ attendanceId: racedId, declarationStatus: 'final', pendingUntil: null })
    expect(racedAfter.updatedAt).not.toBe(tokenBefore)
    expect(racedAfter.updatedAt).toBe(decided.body.updatedAt)
    expect(Date.parse(racedAfter.updatedAt)).not.toBe(Date.parse(jobNow))
    expect(racedAfter.guardianDecidedAt).toBe(decided.body.guardianDecidedAt)

    // The untouched row took the policy's default through the job, with the job's clock as its lock token.
    const untouchedAfter = await declarationOf(request, family.guardian.token, untouched, family.elder.personId)
    expect(untouchedAfter).toMatchObject({
      attendanceId: untouchedId,
      declared: 'yes',
      declarationStatus: 'final',
      pendingUntil: null,
    })
    expect(Date.parse(untouchedAfter.updatedAt)).toBe(Date.parse(jobNow))
    expect(untouchedAfter.updatedAt).not.toBe(String(untouchedYes.body?.updatedAt))

    // A retry finds nothing due and re-emits nothing.
    const again = await runExpiryAsync(club, hoursAfter(jobNow, 1))
    expect(again).toMatchObject({ processed: 0, skipped: 0, failed: 0, changedIds: [] })
  } finally {
    if (inTransaction) await db.query('rollback').catch(() => undefined)
    await db.end()
    await monitor.end()
    await club.cleanup()
  }
})
