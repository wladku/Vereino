// Operator and deploy commands of `foundation` (`yarn mercato foundation <command>`).
//
// Operator commands of the club job sweep (many-clubs spec *API, Command, and Error Contracts*, *Rollout*; #629).
// Shell only; each prints one JSON line.
// - `foundation club-jobs status [--job <key>]`: per job type, whether its sweep runs, the per-club schedules left,
//   and the clubs, due, leased and failing counts of its job state.
// - `foundation club-jobs sweep [--job <key>] [--now <ISO instant>]`: one sweep of a job type (every declared type
//   without `--job`) now — what its schedule does every 5 minutes; `--now` moves the clock (the integration tests).
// - `foundation retire-club-schedules [--job <key>] [--dry-run]`: moves a job type (every type without `--job`) from
//   its per-club schedules onto its sweep; idempotent.
// - `foundation restore-club-schedules [--job <key>]`: the rollback of a job type (every type without `--job`).
//
// `foundation licence-status [--now <ISO instant>]` (enterprise package spec DD-E05, *Users, Permissions, and Scope*;
// #649): read-only; prints one JSON line with this instance's id, per valid licence key its `lid`, tenant, features,
// their state and the expiry, and the rejected keys by `lid` (or position) and reason — never a key. Without keys it
// prints `"message":"no licence keys installed"`.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { getCliModules } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { ModuleConfigService } from '@open-mercato/core/modules/configs/lib/module-config-service'
import {
  decideRoleAclSync,
  parseSyncRoleAclsArgs,
  roleAclDefaultsHash,
  storedRoleAclHash,
} from './lib/role-acl-defaults'
import { readInstanceModuleConfigValue } from './data/queries'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { ResetSecondFactorResult } from './commands/second-factor'
import { endRequiredUsersSessions, findClubUserByEmail } from './services/second-factor/operator'
import { jobCommandContext } from './services/authorize-scoped'
import { buildLicenceRegistry, licenceStatusReport } from './lib/licence-verify'
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

const USAGE = {
  'club-jobs': 'Usage: mercato foundation club-jobs <status [--job <key>] | sweep [--job <key>] [--now <ISO instant>]>',
  'retire-club-schedules':
    'Usage: mercato foundation retire-club-schedules [--job <key>] [--dry-run] [--now <ISO instant>]',
  'restore-club-schedules': 'Usage: mercato foundation restore-club-schedules [--job <key>]',
  'licence-status': 'Usage: mercato foundation licence-status [--now <ISO instant>]',
} as const

/**
 * A usage error: prints the message and throws, because the `mercato` runner exits 1 only on a thrown error and drops
 * `process.exitCode` (#642, lesson `module-cli-exit-code-needs-a-thrown-error`).
 */
function fail(command: keyof typeof USAGE, message: string): never {
  process.stderr.write(`${message}\n${USAGE[command]}\n`)
  throw new Error('[internal] foundation command: invalid options')
}

/**
 * The job types a command runs for: `--job` alone, or `all` without it; fails when `--job` names no job type the
 * command accepts.
 */
function jobsToRun(command: keyof typeof USAGE, job: string | undefined, all: string[]): string[] {
  if (job === undefined) return all
  if (all.includes(job)) return [job]
  return fail(command, `Unknown job ${job}; known: ${all.join(', ')}`)
}

const clubJobs: ModuleCli = {
  command: 'club-jobs',
  async run(argv) {
    const { positionals, job, now, badNow } = readOptions(argv)
    const action = positionals[0]
    if (badNow) fail('club-jobs', '--now must be an ISO instant')
    // Created before the job check: the declarations come from the modules' DI registrars.
    const container = await createRequestContainer()
    if (action === 'status') {
      jobsToRun('club-jobs', job, retirableJobKeys())
      process.stdout.write(`${JSON.stringify({ jobs: await clubJobsStatus(container, { job, now }) })}\n`)
      return
    }
    if (action === 'sweep') {
      const keys = jobsToRun(
        'club-jobs',
        job,
        clubJobDeclarations().map((declaration) => declaration.key),
      )
      const sweeps = []
      for (const key of keys) sweeps.push(await sweepClubJobType(container, key, now))
      process.stdout.write(`${JSON.stringify({ sweeps })}\n`)
      return
    }
    fail('club-jobs', action === undefined ? 'Missing action' : `Unknown action ${action}`)
  },
}

const retire: ModuleCli = {
  command: 'retire-club-schedules',
  async run(argv) {
    const { job, dryRun, now, badNow } = readOptions(argv)
    if (badNow) fail('retire-club-schedules', '--now must be an ISO instant')
    const container = await createRequestContainer()
    const keys = jobsToRun('retire-club-schedules', job, retirableJobKeys())
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
    const keys = jobsToRun('restore-club-schedules', job, retirableJobKeys())
    const results = []
    for (const key of keys) results.push(await restoreClubSchedules(container, key))
    process.stdout.write(`${JSON.stringify({ jobs: results })}\n`)
  },
}

const licenceStatus: ModuleCli = {
  command: 'licence-status',
  run(argv) {
    const { now, badNow } = readOptions(argv)
    if (badNow) fail('licence-status', '--now must be an ISO instant')
    // Built afresh, not the process registry: the command reports what this environment holds right now.
    const registry = buildLicenceRegistry({ env: process.env, readFile: (file) => readFileSync(file, 'utf8') })
    process.stdout.write(`${JSON.stringify(licenceStatusReport(registry, now ?? new Date()))}\n`)
    return Promise.resolve()
  },
}

/** Instance-scoped module config entry holding `{ hash, coreVersion, syncedAt }` of the last successful sync. */
const ROLE_ACL_HASH_CONFIG = { moduleId: 'foundation', name: 'role_acl_defaults_hash' } as const

const SYNC_USAGE = 'Usage: mercato foundation sync-role-acls-if-changed [--force]\n'

/** The installed `@open-mercato/core` version, read from its package.json (the package exports no such path). */
function installedCoreVersion(): string {
  const requireFromApp = createRequire(path.join(process.cwd(), 'package.json'))
  const entry = requireFromApp.resolve('@open-mercato/core')
  const manifest = path.join(path.dirname(entry), '..', 'package.json')
  const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown }
  if (typeof version !== 'string' || !version) throw new Error(`[internal] no version in ${manifest}`)
  return version
}

/**
 * `foundation sync-role-acls-if-changed [--force]` (many clubs spec DD-M11, REQ-M09, AC-M09; #673): the pre-deploy step
 * (`scripts/railway-predeploy.sh`). It hashes the merged role-feature defaults of every enabled module plus the
 * installed `@open-mercato/core` version and compares the hash with the one stored after the last successful sync. Only
 * when they differ (or nothing is stored, or `--force`) does it run the platform's `auth sync-role-acls`, which visits
 * every tenant — one per club — once, and then stores the new hash. A failed sync stores nothing, so the next deploy
 * tries again. Prints one JSON line: `status` `skipped` or `synced`, the `reason` and the hash; exit 1 on a usage error
 * or a failed sync.
 */
const syncRoleAclsIfChanged: ModuleCli = {
  command: 'sync-role-acls-if-changed',
  async run(argv) {
    const parsed = parseSyncRoleAclsArgs(argv)
    if ('error' in parsed) {
      process.stderr.write(`${parsed.error}\n${SYNC_USAGE}`)
      throw new Error('[internal] foundation sync-role-acls-if-changed: invalid options')
    }
    const modules = getCliModules()
    const authSync = modules
      .find((entry) => entry.id === 'auth')
      ?.cli?.find((command) => command.command === 'sync-role-acls')
    if (!authSync)
      throw new Error('[internal] foundation sync-role-acls-if-changed: auth sync-role-acls is not registered')

    const coreVersion = installedCoreVersion()
    const hash = roleAclDefaultsHash(modules, coreVersion)
    const container = await createRequestContainer()
    const configs = container.resolve<ModuleConfigService>('moduleConfigService')
    // The row, not `configs.getValue`: the cache may hold a hash the database no longer has and skip a due sync.
    const storedHash = storedRoleAclHash(
      await readInstanceModuleConfigValue(
        container.resolve<Parameters<typeof readInstanceModuleConfigValue>[0]>('em'),
        ROLE_ACL_HASH_CONFIG,
      ),
    )
    const decision = decideRoleAclSync({ storedHash, currentHash: hash, force: parsed.force })
    if (!decision.sync) {
      process.stdout.write(`${JSON.stringify({ status: 'skipped', reason: decision.reason, hash, coreVersion })}\n`)
      return
    }
    await authSync.run([])
    await configs.setValue(ROLE_ACL_HASH_CONFIG.moduleId, ROLE_ACL_HASH_CONFIG.name, {
      hash,
      coreVersion,
      syncedAt: new Date().toISOString(),
    })
    process.stdout.write(
      `${JSON.stringify({ status: 'synced', reason: decision.reason, hash, previousHash: storedHash, coreVersion })}\n`,
    )
  },
}

const SECOND_FACTOR_USAGE =
  'Usage: mercato foundation second-factor <reset --tenant <id> --org <id> --email <e-mail> --note <text> | end-sessions --tenant <id> --org <id>>\n'

/**
 * `foundation second-factor reset|end-sessions` (staff second factor spec *API, Command, and Error Contracts*,
 * *Rollout*; DD-2F07, Q-2F05; #736). Shell only.
 * - `reset --tenant --org --email --note`: the operator's reset, for the last administrator of a club or the platform
 *   super-admin: the command `foundation.second_factor.reset` with a system actor in the named club. Prints the counts;
 *   exit 1 when the user is not found.
 * - `end-sessions --tenant --org`: ends the sessions of every user of the club holding the requirement (the release
 *   step right after the ACL sync).
 */
const secondFactor: ModuleCli = {
  command: 'second-factor',
  async run(argv) {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        tenant: { type: 'string' },
        org: { type: 'string' },
        email: { type: 'string' },
        note: { type: 'string' },
      },
      strict: false,
      allowPositionals: true,
    })
    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)
    const tenantId = text(values.tenant)
    const organizationId = text(values.org)
    const action = positionals[0]
    const usage = (message: string): never => {
      process.stderr.write(`${message}\n${SECOND_FACTOR_USAGE}`)
      throw new Error('[internal] foundation second-factor: invalid options')
    }
    if (!tenantId || !organizationId) return usage('--tenant and --org are required')
    const scope = { tenantId, organizationId }
    if (action === 'end-sessions') {
      const container = await createRequestContainer()
      process.stdout.write(`${JSON.stringify(await endRequiredUsersSessions(container, scope))}\n`)
      return
    }
    if (action !== 'reset') return usage(action === undefined ? 'Missing action' : `Unknown action ${action}`)
    const email = text(values.email)
    const note = text(values.note)
    if (!email || !note) return usage('--email and --note are required')
    const container = await createRequestContainer()
    const user = await findClubUserByEmail(container, scope, email)
    if (!user) {
      process.stderr.write('not found\n')
      throw new Error('[internal] foundation second-factor reset: user not found')
    }
    const { result } = await container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ResetSecondFactorResult>('foundation.second_factor.reset', {
        input: { userId: user.id, note },
        ctx: jobCommandContext(container, scope),
      })
    process.stdout.write(
      `${JSON.stringify({ userId: result.userId, unlinked: result.unlinked, sessionsEnded: true })}\n`,
    )
  },
}

const commands: ModuleCli[] = [syncRoleAclsIfChanged, clubJobs, retire, restore, licenceStatus, secondFactor]

export default commands
