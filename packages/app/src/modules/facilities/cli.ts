// Operator commands of `facilities` (`yarn mercato facilities <command>`).
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'
import type { ExpireRequestsJobResult } from './commands/requests'
import type { MaintenanceRemindersJobResult } from './commands/maintenance'
import type { LifecycleJobResult, PurgeRentalLinksJobResult } from './commands/rentals'
import { setUpClubFacilities } from './services/club-setup'

function readOptions(argv: string[], names: readonly string[]): Record<string, string | undefined> {
  const options = Object.fromEntries(names.map((name) => [name, { type: 'string' as const }]))
  const { values } = parseArgs({ args: argv, options, strict: false, allowPositionals: true })
  return Object.fromEntries(names.map((name) => [name, typeof values[name] === 'string' ? values[name] : undefined]))
}

/**
 * `facilities rental-lifecycle --tenant <id> --org <id> [--now <ISO instant>]` (facilities spec DD-46): runs the
 * 15-minute rental lifecycle now — the same command the `facilities:rental-lifecycle` job dispatches — and prints its
 * counts (`done`, `expired`) and the changed ids. `--now` evaluates the ends and the payment deadlines as of another
 * instant (an operator catching up; the integration tests' clock).
 */
const rentalLifecycle: ModuleCli = {
  command: 'rental-lifecycle',
  async run(argv) {
    const { tenant, org, now } = readOptions(argv, ['tenant', 'org', 'now'])
    if (!tenant || !org) {
      process.stderr.write(
        'Usage: mercato facilities rental-lifecycle --tenant <tenantId> --org <organizationId> [--now <ISO instant>]\n',
      )
      throw new Error('[internal] facilities rental-lifecycle: invalid options')
    }
    const container = await createRequestContainer()
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, LifecycleJobResult>('facilities.rentals.advance_lifecycle', {
      input: now ? { now } : {},
      ctx: jobCommandContext(container, { tenantId: tenant, organizationId: org }),
    })
    const { now: at, counts, changedIds, expiredIds } = result
    process.stdout.write(`${JSON.stringify({ now: at, ...counts, changedIds, expiredIds })}\n`)
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
      throw new Error('[internal] facilities expire-requests: invalid options')
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
      throw new Error('[internal] facilities maintenance-reminders: invalid options')
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

/**
 * `facilities purge-rental-links --tenant <id> --org <id> [--now <ISO instant>]`: runs the daily purge of dead rental
 * links now (engineering standards S9.5; #525) — the command the `facilities:purge-rental-links` job dispatches — and
 * prints how many rows it deleted. `--now` moves the clock (an operator; the integration tests).
 */
const purgeRentalLinks: ModuleCli = {
  command: 'purge-rental-links',
  async run(argv) {
    const { tenant, org, now } = readOptions(argv, ['tenant', 'org', 'now'])
    if (!tenant || !org) {
      process.stderr.write(
        'Usage: mercato facilities purge-rental-links --tenant <tenantId> --org <organizationId> [--now <ISO instant>]\n',
      )
      throw new Error('[internal] facilities purge-rental-links: invalid options')
    }
    const container = await createRequestContainer()
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, PurgeRentalLinksJobResult>(
      'facilities.rental_links.purge_dead',
      {
        input: now ? { now } : {},
        ctx: jobCommandContext(container, { tenantId: tenant, organizationId: org }),
      },
    )
    process.stdout.write(`${JSON.stringify({ now: result.now, deleted: result.deleted })}\n`)
  },
}

/**
 * `facilities set-up-club --tenant <id> --org <id>`: re-runs the club's `facilities` setup — the rental lifecycle,
 * request expiry, maintenance reminder and rental-link purge schedules — and prints what it registered; exit code 1 when a schedule was
 * refused. Idempotent (an upsert of each schedule); the backfill for a club set up before a schedule existed (#221 L4,
 * `docs/ops/deploy.md`).
 */
const setUpClub: ModuleCli = {
  command: 'set-up-club',
  async run(argv) {
    const { tenant, org } = readOptions(argv, ['tenant', 'org'])
    if (!tenant || !org) {
      process.stderr.write('Usage: mercato facilities set-up-club --tenant <tenantId> --org <organizationId>\n')
      throw new Error('[internal] facilities set-up-club: invalid options')
    }
    const container = await createRequestContainer()
    const result = await setUpClubFacilities(container, { tenantId: tenant, organizationId: org })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (!Object.values(result.schedules).every(Boolean))
      throw new Error('[internal] facilities set-up-club: a schedule was not registered')
  },
}

const commands: ModuleCli[] = [rentalLifecycle, expireRequests, maintenanceReminders, purgeRentalLinks, setUpClub]

export default commands
