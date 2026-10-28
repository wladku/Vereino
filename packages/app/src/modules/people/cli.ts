// Operator commands of `people` (`yarn mercato people <command>`). Both dispatch a job command with a session-less
// job context for one organization, so they run exactly what the scheduler and the worker run.
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'
import { setUpClubPeople } from './services/club-setup'

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
    await setUpClubPeople(container, scope, { withRoleAcls: true })
    await runJobCommand('people.persons.bootstrap_admin', scope, {
      userId: user,
      firstName,
      lastName,
      ...(options.email ? { email: options.email } : {}),
    })
  },
}

const commands: ModuleCli[] = [syncRoleExpiry, bootstrapAdmin]

export default commands
