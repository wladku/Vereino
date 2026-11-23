// Operator commands of the club job sweep (many-clubs spec *API, Command, and Error Contracts*, *Rollout*; #629).
// Shell only; each prints one JSON line.
// - `foundation club-jobs status [--job <key>]`: per job type, whether its sweep runs, the per-club schedules left,
//   and the clubs, due, leased and failing counts of its job state.
// - `foundation club-jobs sweep --job <key> [--now <ISO instant>]`: one sweep of a job type now (what its schedule
//   does every 5 minutes); `--now` moves the clock (the integration tests).
// - `foundation retire-club-schedules [--job <key>] [--dry-run]`: moves a job type (every type without `--job`) from
//   its per-club schedules onto its sweep; idempotent.
// - `foundation restore-club-schedules --job <key>`: the rollback of one job type.
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
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

function knownJob(job: string | undefined): job is string {
  return job !== undefined && retirableJobKeys().includes(job)
}

const clubJobs: ModuleCli = {
  command: 'club-jobs',
  async run(argv) {
    const { positionals, job, now, badNow } = readOptions(argv)
    const action = positionals[0]
    const container = await createRequestContainer()
    if (badNow) return fail('--now must be an ISO instant')
    if (action === 'status') {
      if (job !== undefined && !knownJob(job)) return fail(`Unknown job ${job}; known: ${retirableJobKeys().join(', ')}`)
      process.stdout.write(`${JSON.stringify({ jobs: await clubJobsStatus(container, { job, now }) })}\n`)
      return
    }
    if (action === 'sweep') {
      if (!knownJob(job)) return fail(`Usage: mercato foundation club-jobs sweep --job <key> [--now <ISO instant>]`)
      process.stdout.write(`${JSON.stringify(await sweepClubJobType(container, job, now))}\n`)
      return
    }
    fail('Usage: mercato foundation club-jobs <status [--job <key>] | sweep --job <key> [--now <ISO instant>]>')
  },
}

const retire: ModuleCli = {
  command: 'retire-club-schedules',
  async run(argv) {
    const { job, dryRun, now, badNow } = readOptions(argv)
    if (badNow) return fail('--now must be an ISO instant')
    // Created before the check: the declarations come from the modules' DI registrars.
    const container = await createRequestContainer()
    if (job !== undefined && !knownJob(job)) return fail(`Unknown job ${job}; known: ${retirableJobKeys().join(', ')}`)
    const results = []
    for (const key of job ? [job] : retirableJobKeys()) {
      results.push(await retireClubSchedules(container, key, { dryRun, now }))
    }
    process.stdout.write(`${JSON.stringify({ dryRun, jobs: results })}\n`)
  },
}

const restore: ModuleCli = {
  command: 'restore-club-schedules',
  async run(argv) {
    const { job } = readOptions(argv)
    // Created before the check: the declarations come from the modules' DI registrars.
    const container = await createRequestContainer()
    if (!knownJob(job)) return fail(`Usage: mercato foundation restore-club-schedules --job <${retirableJobKeys().join('|')}>`)
    process.stdout.write(`${JSON.stringify(await restoreClubSchedules(container, job))}\n`)
  },
}

const commands: ModuleCli[] = [clubJobs, retire, restore]

export default commands
