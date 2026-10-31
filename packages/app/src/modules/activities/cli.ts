// Operator commands of `activities` (`yarn mercato activities <command>`).
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'
import type { ExpireJobResult } from './commands/attendance'
import type { GenerateJobResult } from './commands/jobs'

function readOptions(argv: string[], names: readonly string[]): Record<string, string | undefined> {
  const options = Object.fromEntries(names.map((name) => [name, { type: 'string' as const }]))
  const { values } = parseArgs({ args: argv, options, strict: false, allowPositionals: true })
  return Object.fromEntries(names.map((name) => [name, typeof values[name] === 'string' ? values[name] : undefined]))
}

/**
 * `activities generate-occurrences --tenant <id> --org <id> [--today YYYY-MM-DD]`: runs the daily generator now — the
 * same command the `activities:generate-occurrences` job dispatches — and prints its counts. `--today` replays the run
 * of another day (an operator catching up after an outage; the integration tests' horizon moves).
 */
const generateOccurrences: ModuleCli = {
  command: 'generate-occurrences',
  async run(argv) {
    const { tenant, org, today } = readOptions(argv, ['tenant', 'org', 'today'])
    if (!tenant || !org) {
      process.stderr.write(
        'Usage: mercato activities generate-occurrences --tenant <tenantId> --org <organizationId> [--today YYYY-MM-DD]\n',
      )
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, GenerateJobResult>('activities.occurrences.generate', {
      input: today ? { today } : {},
      ctx: jobCommandContext(container, { tenantId: tenant, organizationId: org }),
    })
    process.stdout.write(`${JSON.stringify({ today: result.today, ...result.counts })}\n`)
  },
}

/**
 * `activities expire-guardian-confirmations --tenant <id> --org <id> [--now <ISO instant>]`: runs the 15-minute expiry
 * of pending guardian confirmations now — the same command the `activities:expire-guardian-confirmations` job
 * dispatches — and prints its counts. `--now` evaluates the limits as of another instant (an operator catching up; the
 * integration tests' clock).
 */
const expireGuardianConfirmations: ModuleCli = {
  command: 'expire-guardian-confirmations',
  async run(argv) {
    const { tenant, org, now } = readOptions(argv, ['tenant', 'org', 'now'])
    if (!tenant || !org) {
      process.stderr.write(
        'Usage: mercato activities expire-guardian-confirmations --tenant <tenantId> --org <organizationId> [--now <ISO instant>]\n',
      )
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ExpireJobResult>('activities.attendance.expire', {
      input: now ? { now } : {},
      ctx: jobCommandContext(container, { tenantId: tenant, organizationId: org }),
    })
    process.stdout.write(`${JSON.stringify({ now: result.now, ...result.counts, changedIds: result.changedIds })}\n`)
  },
}

const commands: ModuleCli[] = [generateOccurrences, expireGuardianConfirmations]

export default commands
