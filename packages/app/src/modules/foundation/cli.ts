// Operator commands of the club job sweep (many-clubs spec *API, Command, and Error Contracts*, *Rollout*; #629).
// Shell only; each prints one JSON line.
// - `foundation club-jobs status [--job <key>]`: per job type, whether its sweep runs, the per-club schedules left,
//   and the clubs, due, leased and failing counts of its job state.
// - `foundation club-jobs sweep [--job <key>] [--now <ISO instant>]`: one sweep of a job type (every declared type
//   without `--job`) now — what its schedule does every 5 minutes; `--now` moves the clock (the integration tests).
// - `foundation retire-club-schedules [--job <key>] [--dry-run]`: moves a job type (every type without `--job`) from
//   its per-club schedules onto its sweep; idempotent.
// - `foundation restore-club-schedules [--job <key>]`: the rollback of a job type (every type without `--job`).
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  clubJobDeclarations,
  clubJobsStatus,
  restoreClubSchedules,
  retirableJobKeys,
  retireClubSchedules,
  sweepClubJobType,
} from './services/club-jobs'

function readOptions(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { job: { type: 'string' }, now: { type: 'string' }, 'dry-run': { type: 'boolean' } },
    strict: false,
    allowPositionals: true,
  })
  const now = typeof values.now === 'string' ? new Date(values.now) : undefined
  return {
    positionals,
    job: typeof values.job === 'string' ? values.job : undefined,
    now,
    badNow: now !== undefined && Number.isNaN(now.getTime()),
    dryRun: values['dry-run'] === true,
  }
}

function fail(message: string): void {
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}

/**
 * The job types a command runs for: `--job` alone, or `all` without it; null (and an error printed) when `--job`
 * names no job type the command accepts.
 */
function jobsToRun(job: string | undefined, all: string[]): string[] | null {
  if (job === undefined) return all
  if (all.includes(job)) return [job]
  fail(`Unknown job ${job}; known: ${all.join(', ')}`)
  return null
}

const clubJobs: ModuleCli = {
  command: 'club-jobs',
  async run(argv) {
    const { positionals, job, now, badNow } = readOptions(argv)
    const action = positionals[0]
    if (badNow) {
      fail('--now must be an ISO instant')
      return
    }
    // Created before the job check: the declarations come from the modules' DI registrars.
    const container = await createRequestContainer()
    if (action === 'status') {
      const keys = jobsToRun(job, retirableJobKeys())
      if (!keys) return
      process.stdout.write(`${JSON.stringify({ jobs: await clubJobsStatus(container, { job, now }) })}\n`)
      return
    }
    if (action === 'sweep') {
      const keys = jobsToRun(
        job,
        clubJobDeclarations().map((declaration) => declaration.key),
      )
      if (!keys) return
      const sweeps = []
      for (const key of keys) sweeps.push(await sweepClubJobType(container, key, now))
      process.stdout.write(`${JSON.stringify({ sweeps })}\n`)
      return
    }
    fail('Usage: mercato foundation club-jobs <status [--job <key>] | sweep [--job <key>] [--now <ISO instant>]>')
  },
}

const retire: ModuleCli = {
  command: 'retire-club-schedules',
  async run(argv) {
    const { job, dryRun, now, badNow } = readOptions(argv)
    if (badNow) {
      fail('--now must be an ISO instant')
      return
    }
    const container = await createRequestContainer()
    const keys = jobsToRun(job, retirableJobKeys())
    if (!keys) return
    const results = []
    for (const key of keys) results.push(await retireClubSchedules(container, key, { dryRun, now }))
    process.stdout.write(`${JSON.stringify({ dryRun, jobs: results })}\n`)
  },
}

const restore: ModuleCli = {
  command: 'restore-club-schedules',
  async run(argv) {
    const { job } = readOptions(argv)
    const container = await createRequestContainer()
    const keys = jobsToRun(job, retirableJobKeys())
    if (!keys) return
    const results = []
    for (const key of keys) results.push(await restoreClubSchedules(container, key))
    process.stdout.write(`${JSON.stringify({ jobs: results })}\n`)
  },
}

const commands: ModuleCli[] = [clubJobs, retire, restore]

export default commands
