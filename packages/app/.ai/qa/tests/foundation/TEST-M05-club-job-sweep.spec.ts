import { expect, test, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { OPTIMISTIC_LOCK_HEADER, call, createClub, mercato, type Club } from '../_fixtures/club'

// TEST-M05 (many-clubs spec REQ-M04, DD-M04…DD-M06, BR-M2, BR-M3; issue #629 E22-S03): one sweep per job type.
// - Three clubs: A and C in Europe/Warsaw, B moved to America/New_York after its setup. Each club's 06:00 charge
//   generation is due at 06:00–06:20 local time (a stable offset per club); B's time-of-day jobs follow its new zone,
//   `people` jobs included (`foundation:reschedule-club-jobs`).
// - The sweep, driven with a fixed clock (`--now`), enqueues a club only when its run is due: nothing a second before
//   the earlier club's due time, that club alone at it, nothing again while its lease holds, the other club at its own
//   due time. C, whose next run lies a month ahead (no work), is never enqueued.
// - Each enqueued run is executed by the module's worker: the lease is cleared and the next run is the next local day
//   at the same local time and offset. A run whose lease expired without finishing (a crashed worker) is claimed again.
// The daily-saving dates are covered by the unit tests of `foundation/lib/club-job-due.ts`.
test.describe.configure({ timeout: 420_000 })

const JOB = 'payments:generate-charges'
const WARSAW = 'Europe/Warsaw'
const NEW_YORK = 'America/New_York'

type JobRow = {
  next_due_at: Date | null
  lease_until: Date | null
  last_started_at: Date | null
  last_finished_at: Date | null
  last_error: string | null
}
type Sweep = { job: string; claimed: number; enqueued: Array<{ organizationId: string; dueAt: string }> }

function scopeArgs(club: Club): string[] {
  return ['--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]
}

async function jobRow(club: Club, jobKey: string): Promise<JobRow | null> {
  return withClient(async (client) => {
    const { rows } = await client.query<JobRow>(
      `select next_due_at, lease_until, last_started_at, last_finished_at, last_error from foundation_club_jobs
        where organization_id = $1 and job_key = $2`,
      [club.tenant.organizationId, jobKey],
    )
    return rows[0] ?? null
  })
}

async function setJobRow(club: Club, jobKey: string, values: { nextDueAt: Date; leaseUntil?: Date | null }) {
  await withClient(async (client) => {
    await client.query(
      `update foundation_club_jobs set next_due_at = $3, lease_until = $4 where organization_id = $1 and job_key = $2`,
      [club.tenant.organizationId, jobKey, values.nextDueAt, values.leaseUntil ?? null],
    )
  })
}

/** Removes the test clubs' job state, so later sweeps do not visit deleted clubs. */
async function dropJobState(clubs: Club[]) {
  await withClient(async (client) => {
    await client.query('delete from foundation_club_jobs where organization_id = any($1::uuid[])', [
      clubs.map((club) => club.tenant.organizationId),
    ])
  })
}

/** The wall time `HH:mm` of an instant in a zone. */
function localTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    instant,
  )
}

/** Due at `HH:00`–`HH:19` local time. */
function expectLocalWindow(instant: Date | null | undefined, timeZone: string, hour: string) {
  expect(instant).toBeTruthy()
  const time = localTime(instant as Date, timeZone)
  expect(time.slice(0, 2), `${time} in ${timeZone}`).toBe(hour)
  expect(Number(time.slice(3)), `${time} in ${timeZone}`).toBeLessThan(20)
}

function sweep(now?: Date): Sweep {
  const result = mercato([
    'foundation',
    'club-jobs',
    'sweep',
    '--job',
    JOB,
    ...(now ? ['--now', now.toISOString()] : []),
  ]) as { sweeps: Sweep[] } | null
  if (!result) throw new Error('[internal] foundation club-jobs sweep printed no result')
  const first = result.sweeps.at(0)
  if (!first) throw new Error('[internal] foundation club-jobs sweep printed no sweep')
  return first
}

/** The clubs of this test a sweep enqueued (other tests' clubs share the database). */
function enqueuedOf(result: Sweep, clubs: Club[]): string[] {
  const ours = new Set(clubs.map((club) => club.tenant.organizationId))
  return result.enqueued.filter((row) => ours.has(row.organizationId)).map((row) => row.organizationId)
}

async function moveZone(request: APIRequestContext, club: Club, timezone: string) {
  const current = await call<{ updatedAt?: string }>(request, 'GET', '/api/club_core/settings', club.adminToken)
  const moved = await call(request, 'PUT', '/api/club_core/settings', club.adminToken, {
    data: { timezone },
    headers: current.body?.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: current.body.updatedAt } : {},
  })
  expect(moved.status, JSON.stringify(moved.body)).toBe(200)
}

/** Waits until the worker finished the claimed run: lease cleared, a finish time, no error. */
async function finishedRun(club: Club): Promise<JobRow> {
  await expect
    .poll(
      async () => {
        const row = await jobRow(club, JOB)
        return row?.last_finished_at != null && row.lease_until == null
      },
      { timeout: 90_000 },
    )
    .toBe(true)
  const row = (await jobRow(club, JOB)) as JobRow
  expect(row.last_error).toBeNull()
  return row
}

test('TEST-M05 the sweep runs each club at its local time and only when its run is due', async ({ request }) => {
  const clubs: Club[] = []
  try {
    const a = await createClub(request, 'test-m05-a')
    clubs.push(a)
    const b = await createClub(request, 'test-m05-b')
    clubs.push(b)
    const c = await createClub(request, 'test-m05-c')
    clubs.push(c)
    for (const club of clubs) mercato(['payments', 'set-up-club', ...scopeArgs(club)])

    // --- Each club's job state: 06:00 + offset in the club zone ---
    for (const club of clubs) {
      expectLocalWindow((await jobRow(club, JOB))?.next_due_at, WARSAW, '06')
      expectLocalWindow((await jobRow(club, 'payments:verify-invariants'))?.next_due_at, WARSAW, '03')
      expectLocalWindow((await jobRow(club, 'people:sync-role-expiry'))?.next_due_at, WARSAW, '02')
    }

    // --- B moves to New York: every time-of-day job follows, `people` included ---
    await moveZone(request, b, NEW_YORK)
    await expect
      .poll(async () => localTime((await jobRow(b, JOB))?.next_due_at as Date, NEW_YORK).slice(0, 2), {
        timeout: 60_000,
      })
      .toBe('06')
    expectLocalWindow((await jobRow(b, JOB))?.next_due_at, NEW_YORK, '06')
    expectLocalWindow((await jobRow(b, 'payments:verify-invariants'))?.next_due_at, NEW_YORK, '03')
    expectLocalWindow((await jobRow(b, 'people:sync-role-expiry'))?.next_due_at, NEW_YORK, '02')
    expectLocalWindow((await jobRow(a, JOB))?.next_due_at, WARSAW, '06')

    // --- C has no work for a month; A and B are due at their own local 06:00 ---
    await setJobRow(c, JOB, { nextDueAt: new Date(Date.now() + 30 * 24 * 3_600_000) })
    const dueOf = async (club: Club) => (await jobRow(club, JOB))?.next_due_at as Date
    const [first, second] = [
      { club: a, due: await dueOf(a), zone: WARSAW },
      { club: b, due: await dueOf(b), zone: NEW_YORK },
    ].sort((x, y) => x.due.getTime() - y.due.getTime())

    expect(enqueuedOf(sweep(new Date(first.due.getTime() - 1_000)), clubs)).toEqual([])
    expect(enqueuedOf(sweep(first.due), clubs)).toEqual([first.club.tenant.organizationId])
    // A second sweep while the claim's lease holds (or after the run moved the due time) enqueues nothing new.
    expect(enqueuedOf(sweep(first.due), clubs)).toEqual([])

    // The worker ran it: the next run is the next local day, same local time and offset.
    const firstAfter = await finishedRun(first.club)
    expect(firstAfter.next_due_at?.getTime()).toBeGreaterThan(first.due.getTime())
    expect(localTime(firstAfter.next_due_at as Date, first.zone)).toBe(localTime(first.due, first.zone))

    expect(enqueuedOf(sweep(second.due), clubs)).toEqual([second.club.tenant.organizationId])
    const secondAfter = await finishedRun(second.club)
    expect(localTime(secondAfter.next_due_at as Date, second.zone)).toBe(localTime(second.due, second.zone))

    // C was never enqueued.
    expect((await jobRow(c, JOB))?.last_started_at).toBeNull()

    // --- A crashed run (its lease ran out without a finish) is claimed again ---
    const crashedAt = new Date(Date.now() - 60 * 60_000)
    await setJobRow(a, JOB, { nextDueAt: crashedAt, leaseUntil: new Date(crashedAt.getTime() + 30 * 60_000) })
    const startedBefore = (await jobRow(a, JOB))?.last_started_at as Date
    expect(enqueuedOf(sweep(), clubs)).toEqual([a.tenant.organizationId])
    await expect
      .poll(async () => (await jobRow(a, JOB))?.last_started_at?.getTime() ?? 0, { timeout: 90_000 })
      .toBeGreaterThan(startedBefore.getTime())
    const retried = await finishedRun(a)
    expect(retried.next_due_at?.getTime()).toBeGreaterThan(Date.now())
  } finally {
    await dropJobState(clubs)
    for (const club of clubs) await club.cleanup()
  }
})
