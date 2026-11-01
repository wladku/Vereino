// Operator commands of `activities` (`yarn mercato activities <command>`).
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'
import type { ExpireJobResult } from './commands/attendance'
import type { GenerateJobResult } from './commands/jobs'
import { checkAppendOnly, listContactAccessLog } from './services/contact-access-log'

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

/**
 * `activities contact-access-log --tenant <id> --org <id> [--occurrence <id>]`: prints the newest 100 reads of guardian
 * contacts (REQ-037, DD-39; #34) as one JSON document `{ rows }`, newest first — who, in which role, which session,
 * which person ids, why — for a club's data-protection request. The rows hold ids only; the contacts are never logged.
 */
const contactAccessLogCli: ModuleCli = {
  command: 'contact-access-log',
  async run(argv) {
    const { tenant, org, occurrence } = readOptions(argv, ['tenant', 'org', 'occurrence'])
    if (!tenant || !org) {
      process.stderr.write(
        'Usage: mercato activities contact-access-log --tenant <tenantId> --org <organizationId> [--occurrence <id>]\n',
      )
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const rows = await listContactAccessLog(container, { tenantId: tenant, organizationId: org }, occurrence)
    process.stdout.write(`${JSON.stringify({ rows })}\n`)
  },
}

/**
 * `activities check-append-only --tenant <id> --org <id>`: a deployment self-check of the foundation's `append_only`
 * guard (foundation II P-28, TEST-G05) on the newest contacts-log row: tries to change it and to delete it inside a
 * transaction that is always rolled back, and prints the refusal codes (`append_only` twice when the guard is active).
 */
const checkAppendOnlyCli: ModuleCli = {
  command: 'check-append-only',
  async run(argv) {
    const { tenant, org } = readOptions(argv, ['tenant', 'org'])
    if (!tenant || !org) {
      process.stderr.write('Usage: mercato activities check-append-only --tenant <tenantId> --org <organizationId>\n')
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const result = await checkAppendOnly(container, { tenantId: tenant, organizationId: org })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  },
}

const commands: ModuleCli[] = [
  generateOccurrences,
  expireGuardianConfirmations,
  contactAccessLogCli,
  checkAppendOnlyCli,
]

export default commands
