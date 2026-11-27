import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { createClub, mercato, type Club } from '../_fixtures/club'

// Many-clubs spec TEST-M06 (spec REQ-M04, AC-M04, *Rollout*; issue #629 E22-S03): two clubs set up the old way, each with
// its per-club schedules (`set-up-club` of `activities`, `payments`, `facilities`; `people` from `bootstrap-admin`).
// - `retire-club-schedules --dry-run` changes nothing; `retire-club-schedules` leaves no per-club schedule of a
//   declared job type and one system-scope sweep schedule per job type (21 rows, whatever the number of clubs), and a
//   second run changes nothing.
// - Every job type still runs for the club: with its job state due, one sweep of every type enqueues it and the
//   module's worker finishes it without an error.
// - A club set up after the retirement gets job state and no per-club schedule.
// - `restore-club-schedules` (the rollback) brings the per-club schedules back (the dispatch sweeper for every club
//   with job state) and removes the sweep schedules; it also runs in `finally`, so the tests after this one find the
//   old setup again.
test.describe.configure({ timeout: 600_000 })

/** Every job type of the old per-club setup that a club gets from its `set-up-club` commands (life-cycle and retention sweep excluded). */
const CLUB_JOBS = [
  'activities:expire-guardian-confirmations',
  'activities:generate-occurrences',
  'activities:purge-declaration-links',
  'activities:send-declaration-reminders',
  'activities:warn-unassigned-sessions',
  'facilities:expire-requests',
  'facilities:maintenance-reminders',
  'facilities:purge-rental-links',
  'facilities:rental-lifecycle',
  'payments:close-order-campaigns',
  'payments:generate-charges',
  'payments:overdue-reminders',
  'payments:purge-order-links',
  'payments:reconcile-checkouts',
  'payments:verify-invariants',
  'people:purge-import-rows',
  'people:sync-role-expiry',
]

/**
 * Declared job types (the 17 above, `people:life-cycle`, `people:retention-sweep` and `people:medical-reminders` of
 * #682, `enrolment:expire-unconfirmed` and `enrolment:daily` of #799) plus the dispatch sweep: one sweep schedule each.
 */
const SWEEP_SCHEDULES = 23

type RetireRun = { dryRun: boolean; jobs: Array<{ job: string; clubs: number; retired: number; rowsCreated: number }> }

function scopeArgs(club: Club): string[] {
  return ['--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]
}

function setUpOldWay(club: Club) {
  for (const moduleId of ['activities', 'payments', 'facilities'])
    mercato([moduleId, 'set-up-club', ...scopeArgs(club)])
}

/**
 * The Vereino modules that schedule club jobs. Since Open Mercato 0.10 the platform modules `integrations`,
 * `communication_channels` and `payment_gateways` add per-organization schedules of their own; `retire-club-schedules`
 * does not own them (#498).
 */
const VEREINO_SCHEDULE_MODULES = ['activities', 'enrolment', 'facilities', 'foundation', 'payments', 'people']

async function perClubSchedules(club: Club): Promise<string[]> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ name: string }>(
      `select name from scheduled_jobs where organization_id = $1 and scope_type = 'organization'
         and source_type = 'module' and source_module = any($2::text[]) and deleted_at is null order by name`,
      [club.tenant.organizationId, VEREINO_SCHEDULE_MODULES],
    )
    return rows.map((row) => row.name)
  })
}

async function sweepScheduleCount(): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ count: string }>(
      `select count(*) as count from scheduled_jobs
        where scope_type = 'system' and source_module = 'foundation' and deleted_at is null`,
    )
    return Number(rows[0].count)
  })
}

type JobState = { job_key: string; lease_until: Date | null; last_finished_at: Date | null; last_error: string | null }

async function jobState(club: Club): Promise<JobState[]> {
  return withClient(async (client) => {
    const { rows } = await client.query<JobState>(
      `select job_key, lease_until, last_finished_at, last_error from foundation_club_jobs
        where organization_id = $1 order by job_key`,
      [club.tenant.organizationId],
    )
    return rows
  })
}

function retire(dryRun = false): RetireRun {
  return mercato(['foundation', 'retire-club-schedules', ...(dryRun ? ['--dry-run'] : [])]) as RetireRun
}

test('many-clubs TEST-M06 retire-club-schedules moves every club onto one sweep per job type', async ({ request }) => {
  const clubs: Club[] = []
  let retired = false
  try {
    const a = await createClub(request, 'test-m06-a')
    clubs.push(a)
    const b = await createClub(request, 'test-m06-b')
    clubs.push(b)
    for (const club of clubs) setUpOldWay(club)
    for (const club of clubs) expect(await perClubSchedules(club)).toEqual(CLUB_JOBS)
    const sweepsBefore = await sweepScheduleCount()

    // --- A dry run only counts ---
    const dry = retire(true)
    expect(dry.dryRun).toBe(true)
    expect(dry.jobs.every((job) => job.retired === 0 && job.rowsCreated === 0)).toBe(true)
    expect(dry.jobs.find((job) => job.job === 'payments:generate-charges')?.clubs).toBeGreaterThanOrEqual(2)
    for (const club of clubs) expect(await perClubSchedules(club)).toEqual(CLUB_JOBS)
    expect(await sweepScheduleCount()).toBe(sweepsBefore)

    // --- The retirement: no per-club schedule left, one sweep schedule per job type ---
    retired = true
    const run = retire()
    expect(run.jobs.map((job) => job.job)).toContain('foundation:dispatch-sweep')
    expect(run.jobs.find((job) => job.job === 'payments:generate-charges')?.retired).toBeGreaterThanOrEqual(2)
    for (const club of clubs) expect(await perClubSchedules(club)).toEqual([])
    expect(await sweepScheduleCount()).toBe(SWEEP_SCHEDULES)
    for (const club of clubs) expect((await jobState(club)).map((row) => row.job_key)).toEqual(CLUB_JOBS)

    // A second run changes nothing.
    const again = retire()
    expect(again.jobs.every((job) => job.retired === 0 && job.rowsCreated === 0)).toBe(true)
    expect(await sweepScheduleCount()).toBe(SWEEP_SCHEDULES)

    // --- Every job type still runs for the club ---
    await withClient(async (client) => {
      await client.query(
        `update foundation_club_jobs set next_due_at = now() - interval '1 minute', lease_until = null
          where organization_id = $1`,
        [a.tenant.organizationId],
      )
    })
    const sweeps = mercato(['foundation', 'club-jobs', 'sweep']) as {
      sweeps: Array<{ job: string; enqueued: Array<{ organizationId: string }> }>
    }
    const enqueuedForA = sweeps.sweeps
      .filter((sweep) => sweep.enqueued.some((row) => row.organizationId === a.tenant.organizationId))
      .map((sweep) => sweep.job)
      .sort()
    expect(enqueuedForA).toEqual(CLUB_JOBS)
    await expect
      .poll(
        async () => (await jobState(a)).filter((row) => row.last_finished_at == null || row.lease_until != null).length,
        { timeout: 180_000 },
      )
      .toBe(0)
    expect((await jobState(a)).filter((row) => row.last_error != null)).toEqual([])

    // --- A club set up after the retirement: job state, no per-club schedule ---
    const c = await createClub(request, 'test-m06-c')
    clubs.push(c)
    setUpOldWay(c)
    expect(await perClubSchedules(c)).toEqual([])
    expect((await jobState(c)).map((row) => row.job_key)).toEqual(CLUB_JOBS)

    // --- The status shows every job type on its sweep, no per-club schedule left for these clubs ---
    const status = mercato(['foundation', 'club-jobs', 'status']) as {
      jobs: Array<{ job: string; sweep: boolean; clubs: number }>
    }
    expect(status.jobs).toHaveLength(SWEEP_SCHEDULES)
    expect(status.jobs.every((job) => job.sweep)).toBe(true)

    // --- The rollback ---
    retired = false
    mercato(['foundation', 'restore-club-schedules'])
    expect(await sweepScheduleCount()).toBe(0)
    // Every club with job state gets the dispatch sweeper back too, as `seedDefaults` gives each club.
    const restored = [...CLUB_JOBS, 'foundation:dispatch-sweep'].sort()
    for (const club of clubs) expect(await perClubSchedules(club)).toEqual(restored)

    // --- The dispatch sweep alone, for a club set up before the job state existed (no row) ---
    await withClient(async (client) => {
      await client.query('delete from foundation_club_jobs where organization_id = $1', [a.tenant.organizationId])
    })
    retired = true
    mercato(['foundation', 'retire-club-schedules', '--job', 'foundation:dispatch-sweep'])
    expect(await perClubSchedules(a)).toEqual(CLUB_JOBS)
    expect((await jobState(a)).map((row) => row.job_key)).toEqual(CLUB_JOBS)
    mercato(['foundation', 'restore-club-schedules', '--job', 'foundation:dispatch-sweep'])
    retired = false
    expect(await perClubSchedules(a)).toEqual(restored)
  } finally {
    if (retired) mercato(['foundation', 'restore-club-schedules'])
    await withClient(async (client) => {
      await client.query('delete from foundation_club_jobs where organization_id = any($1::uuid[])', [
        clubs.map((club) => club.tenant.organizationId),
      ])
    })
    for (const club of clubs) await club.cleanup()
  }
})
