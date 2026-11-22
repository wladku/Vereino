// Operator commands of `people` (`yarn mercato people <command>`). The job commands dispatch with a session-less job
// context for one organization, so they run exactly what the scheduler and the worker run; `check-own-payments` runs
// the R10 gate the phase 4 payments routes will call.
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'
import { registerLifeCycleSchedule, registerRetentionSweepSchedule, setUpClubPeople } from './services/club-setup'
import { PEOPLE_PAYMENTS_GATE, type PaymentsGate } from './services/payments-gate'

function readOptions(argv: string[], names: readonly string[]): Record<string, string | undefined> {
  const options = Object.fromEntries(names.map((name) => [name, { type: 'string' as const }]))
  const { values } = parseArgs({ args: argv, options, strict: false, allowPositionals: true })
  return Object.fromEntries(names.map((name) => [name, typeof values[name] === 'string' ? values[name] : undefined]))
}

async function runJobCommand(commandId: string, scope: { tenantId: string; organizationId: string }, input: unknown) {
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  const { result } = await commandBus.execute(commandId, { input, ctx: jobCommandContext(container, scope) })
  // Machine-readable result for operators and the integration tests.
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

/** `people sync-role-expiry --tenant <id> --org <id> [--today YYYY-MM-DD]`: one run of the daily role sync. */
const syncRoleExpiry: ModuleCli = {
  command: 'sync-role-expiry',
  async run(argv) {
    const { tenant, org, today } = readOptions(argv, ['tenant', 'org', 'today'])
    if (!tenant || !org) {
      process.stderr.write(
        'Usage: mercato people sync-role-expiry --tenant <tenantId> --org <organizationId> [--today YYYY-MM-DD]\n',
      )
      process.exitCode = 1
      return
    }
    await runJobCommand('people.persons.sync_roles', { tenantId: tenant, organizationId: org }, today ? { today } : {})
  },
}

/**
 * `people bootstrap-admin --tenant <id> --org <id> --user <userId> --first-name <n> --last-name <n> [--email <e>]`:
 * sets up the club's `vereino_*` roles (with their features) and role-expiry schedule, then makes an existing user
 * of the organization its first club administrator. Idempotent.
 */
const bootstrapAdmin: ModuleCli = {
  command: 'bootstrap-admin',
  async run(argv) {
    const options = readOptions(argv, ['tenant', 'org', 'user', 'first-name', 'last-name', 'email'])
    const { tenant, org, user } = options
    const firstName = options['first-name']
    const lastName = options['last-name']
    if (!tenant || !org || !user || !firstName || !lastName) {
      process.stderr.write(
        'Usage: mercato people bootstrap-admin --tenant <tenantId> --org <organizationId> --user <userId> --first-name <name> --last-name <name> [--email <email>]\n',
      )
      process.exitCode = 1
      return
    }
    const scope = { tenantId: tenant, organizationId: org }
    const container = await createRequestContainer()
    // The life-cycle schedule waits for the confirmed first run on a club that may already hold data (#310).
    await setUpClubPeople(container, scope, { withRoleAcls: true, lifeCycleSchedule: false })
    await runJobCommand('people.persons.bootstrap_admin', scope, {
      userId: user,
      firstName,
      lastName,
      ...(options.email ? { email: options.email } : {}),
    })
  },
}

/**
 * `people check-own-payments --tenant <id> --org <id> --user <userId>`: runs the R10 gate (`people.paymentsGate.assert`)
 * every route of a person's own payments applies in phase 4 and prints `{ allowed, status?, code? }` — for operators
 * checking why a member does not see payments, and for the integration tests until the payments routes exist.
 */
const checkOwnPayments: ModuleCli = {
  command: 'check-own-payments',
  async run(argv) {
    const { tenant, org, user } = readOptions(argv, ['tenant', 'org', 'user'])
    if (!tenant || !org || !user) {
      process.stderr.write(
        'Usage: mercato people check-own-payments --tenant <tenantId> --org <organizationId> --user <userId>\n',
      )
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const gate = container.resolve<PaymentsGate>(PEOPLE_PAYMENTS_GATE)
    try {
      await gate.assert({ tenantId: tenant, organizationId: org, userId: user })
      process.stdout.write(`${JSON.stringify({ allowed: true })}\n`)
    } catch (error: unknown) {
      if (!isCrudHttpError(error)) throw error
      const code = typeof error.body.code === 'string' ? error.body.code : null
      process.stdout.write(`${JSON.stringify({ allowed: false, status: error.status, code })}\n`)
    }
  },
}

/**
 * `people purge-import-rows --tenant <id> --org <id> [--now <ISO instant>]`: one run of the daily import purge (#28);
 * `--now` lets operators and the integration tests run it as of another instant.
 */
const purgeImportRows: ModuleCli = {
  command: 'purge-import-rows',
  async run(argv) {
    const { tenant, org, now } = readOptions(argv, ['tenant', 'org', 'now'])
    if (!tenant || !org) {
      process.stderr.write(
        'Usage: mercato people purge-import-rows --tenant <tenantId> --org <organizationId> [--now <ISO instant>]\n',
      )
      process.exitCode = 1
      return
    }
    await runJobCommand('people.imports.purge', { tenantId: tenant, organizationId: org }, now ? { now } : {})
  },
}

/**
 * `people life-cycle --tenant <id> --org <id> [--today YYYY-MM-DD] [--dry-run] [--register-schedule]`: one run of the
 * daily life-cycle job (people life-cycle spec REQ-L06, REQ-L07; #310). `--dry-run` prints the counts and changes
 * nothing (the run leaves only its audit entry); `--register-schedule` registers the daily `people:life-cycle`
 * schedule after a real run — the confirmed first run on an existing club (*Rollout*, item 11). Prints the job's result
 * as JSON.
 */
const lifeCycle: ModuleCli = {
  command: 'life-cycle',
  async run(argv) {
    const { values } = parseArgs({
      args: argv,
      options: {
        tenant: { type: 'string' },
        org: { type: 'string' },
        today: { type: 'string' },
        'dry-run': { type: 'boolean' },
        'register-schedule': { type: 'boolean' },
      },
      strict: false,
      allowPositionals: true,
    })
    const tenant = typeof values.tenant === 'string' ? values.tenant : undefined
    const org = typeof values.org === 'string' ? values.org : undefined
    const today = typeof values.today === 'string' ? values.today : undefined
    const dryRun = values['dry-run'] === true
    const register = values['register-schedule'] === true
    if (!tenant || !org || (dryRun && register)) {
      process.stderr.write(
        'Usage: mercato people life-cycle --tenant <tenantId> --org <organizationId> [--today YYYY-MM-DD] [--dry-run | --register-schedule]\n',
      )
      process.exitCode = 1
      return
    }
    const scope = { tenantId: tenant, organizationId: org }
    await runJobCommand('people.persons.life_cycle', scope, {
      ...(today ? { today } : {}),
      ...(dryRun ? { dryRun } : {}),
    })
    if (register) {
      const registered = await registerLifeCycleSchedule(await createRequestContainer(), scope)
      process.stdout.write(`${JSON.stringify({ scheduleRegistered: registered })}\n`)
      if (!registered) process.exitCode = 1
    }
  },
}

/**
 * `people retention-sweep --tenant <id> --org <id> [--dry-run [--today YYYY-MM-DD]] [--register-schedule]`: one run of
 * the daily former participants' retention sweep (club spec REQ-041; #471). `--dry-run` prints the counts and changes
 * nothing (the run leaves only its audit entry); `--today` previews another day and only with `--dry-run` (#564); `--register-schedule` registers the daily `people:retention-sweep`
 * schedule after a real run — the confirmed first run on an existing club (`docs/ops/deploy.md`). Prints the job's
 * result as JSON (counts only).
 */
const retentionSweep: ModuleCli = {
  command: 'retention-sweep',
  async run(argv) {
    const { values } = parseArgs({
      args: argv,
      options: {
        tenant: { type: 'string' },
        org: { type: 'string' },
        today: { type: 'string' },
        'dry-run': { type: 'boolean' },
        'register-schedule': { type: 'boolean' },
      },
      strict: false,
      allowPositionals: true,
    })
    const tenant = typeof values.tenant === 'string' ? values.tenant : undefined
    const org = typeof values.org === 'string' ? values.org : undefined
    const today = typeof values.today === 'string' ? values.today : undefined
    const dryRun = values['dry-run'] === true
    const register = values['register-schedule'] === true
    // A thrown error is what makes `mercato` exit 1: it ends with `process.exit(0)` after a command that returns, so a
    // `process.exitCode` set here is lost (lesson `mercato-module-cli-exit-code`, #564).
    if (!tenant || !org || (dryRun && register) || (today && !dryRun)) {
      process.stderr.write(
        'Usage: mercato people retention-sweep --tenant <tenantId> --org <organizationId> [--dry-run [--today YYYY-MM-DD] | --register-schedule]\n',
      )
      throw new Error('[internal] people retention-sweep: invalid options')
    }
    const scope = { tenantId: tenant, organizationId: org }
    await runJobCommand('people.persons.retention_sweep', scope, {
      ...(today ? { today } : {}),
      ...(dryRun ? { dryRun } : {}),
    })
    if (register) {
      const registered = await registerRetentionSweepSchedule(await createRequestContainer(), scope)
      process.stdout.write(`${JSON.stringify({ scheduleRegistered: registered })}\n`)
      if (!registered) throw new Error('[internal] people:retention-sweep schedule not registered')
    }
  },
}

const commands: ModuleCli[] = [
  syncRoleExpiry,
  bootstrapAdmin,
  checkOwnPayments,
  purgeImportRows,
  lifeCycle,
  retentionSweep,
]

export default commands
