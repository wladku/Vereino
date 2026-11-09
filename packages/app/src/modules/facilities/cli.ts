// Operator commands of `facilities` (`yarn mercato facilities <command>`).
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'
import type { ExpireRequestsJobResult } from './commands/requests'
import type { MaintenanceRemindersJobResult } from './commands/maintenance'
import type { LifecycleJobResult } from './commands/rentals'

function readOptions(argv: string[], names: readonly string[]): Record<string, string | undefined> {
  const options = Object.fromEntries(names.map((name) => [name, { type: 'string' as const }]))
  const { values } = parseArgs({ args: argv, options, strict: false, allowPositionals: true })
  return Object.fromEntries(names.map((name) => [name, typeof values[name] === 'string' ? values[name] : undefined]))
}

/**
 * `facilities rental-lifecycle --tenant <id> --org <id> [--now <ISO instant>]` (facilities spec DD-46): runs the
 * 15-minute rental lifecycle now — the same command the `facilities:rental-lifecycle` job dispatches — and prints its
 * counts. `--now` evaluates the ends as of another instant (an operator catching up; the integration tests' clock).
 */
const rentalLifecycle: ModuleCli = {
  command: 'rental-lifecycle',
  async run(argv) {
    const { tenant, org, now } = readOptions(argv, ['tenant', 'org', 'now'])
    if (!tenant || !org) {
      process.stderr.write(
        'Usage: mercato facilities rental-lifecycle --tenant <tenantId> --org <organizationId> [--now <ISO instant>]\n',
      )
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, LifecycleJobResult>('facilities.rentals.advance_lifecycle', {
      input: now ? { now } : {},
      ctx: jobCommandContext(container, { tenantId: tenant, organizationId: org }),
    })
    process.stdout.write(`${JSON.stringify({ now: result.now, ...result.counts, changedIds: result.changedIds })}\n`)
  },
}

/**
 * `facilities expire-requests --tenant <id> --org <id> [--now <ISO instant>]` (facilities spec DD-46; #125): runs the
 * 15-minute request expiry now — the same command the `facilities:expire-requests` job dispatches — and prints its
 * counts. `--now` moves the clock (the integration tests drive the 1-hour link and the 48-hour hold through it).
 */
const expireRequests: ModuleCli = {
  command: 'expire-requests',
  async run(argv) {
    const { tenant, org, now } = readOptions(argv, ['tenant', 'org', 'now'])
    if (!tenant || !org) {
      process.stderr.write(
        'Usage: mercato facilities expire-requests --tenant <tenantId> --org <organizationId> [--now <ISO instant>]\n',
      )
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ExpireRequestsJobResult>(
      'facilities.rentals.expire_requests',
      {
        input: now ? { now } : {},
        ctx: jobCommandContext(container, { tenantId: tenant, organizationId: org }),
      },
    )
    process.stdout.write(`${JSON.stringify({ now: result.now, ...result.counts, expiredIds: result.expiredIds })}\n`)
  },
}

/**
 * `facilities maintenance-reminders --tenant <id> --org <id> [--now <ISO instant>]` (facilities spec DD-46; #128): runs the
 * daily maintenance reminders now — the command the `facilities:maintenance-reminders` job dispatches — and prints
 * the counts. `--now` moves the clock (the integration tests drive the 14-day, 1-day and usage reminders through it).
 */
const maintenanceReminders: ModuleCli = {
  command: 'maintenance-reminders',
  async run(argv) {
    const { tenant, org, now } = readOptions(argv, ['tenant', 'org', 'now'])
    if (!tenant || !org) {
      process.stderr.write(
        'Usage: mercato facilities maintenance-reminders --tenant <tenantId> --org <organizationId> [--now <ISO instant>]\n',
      )
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, MaintenanceRemindersJobResult>(
      'facilities.maintenance.send_reminders',
      {
        input: now ? { now } : {},
        ctx: jobCommandContext(container, { tenantId: tenant, organizationId: org }),
      },
    )
    process.stdout.write(`${JSON.stringify({ now: result.now, ...result.counts })}\n`)
  },
}

const commands: ModuleCli[] = [rentalLifecycle, expireRequests, maintenanceReminders]

export default commands
