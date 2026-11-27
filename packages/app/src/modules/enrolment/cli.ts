// Operator commands of `enrolment` (`yarn mercato enrolment <command>`; sign-up form spec DD-J14; #799).
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'
import type { RetentionJobResult } from './commands/applications'
import type { EraseApplicantResult } from './commands/seasons'
import { applicantApplications } from './services/applicant-data'

function readOptions(argv: string[], names: readonly string[]): Record<string, string | undefined> {
  const options = Object.fromEntries(names.map((name) => [name, { type: 'string' as const }]))
  const { values } = parseArgs({ args: argv, options, strict: false, allowPositionals: true })
  return Object.fromEntries(names.map((name) => [name, typeof values[name] === 'string' ? values[name] : undefined]))
}

/**
 * `enrolment expire-unconfirmed|daily --tenant <id> --org <id> [--now <ISO instant>]`: runs the club job now — the same
 * command `enrolment:expire-unconfirmed` (R22) or `enrolment:daily` (R22, R23, dead links) dispatches — and prints its
 * counts. `--now` moves the clock (the integration tests drive the 24-hour and 30-day rules through it).
 */
function jobCli(command: 'expire-unconfirmed' | 'daily', commandId: string): ModuleCli {
  return {
    command,
    async run(argv) {
      const { tenant, org, now } = readOptions(argv, ['tenant', 'org', 'now'])
      if (!tenant || !org) {
        process.stderr.write(
          `Usage: mercato enrolment ${command} --tenant <tenantId> --org <organizationId> [--now <ISO instant>]\n`,
        )
        throw new Error('[internal] enrolment job command: invalid options')
      }
      const container = await createRequestContainer()
      const { result } = await container
        .resolve<CommandBus>('commandBus')
        .execute<unknown, RetentionJobResult>(commandId, {
          input: now ? { now } : {},
          ctx: jobCommandContext(container, { tenantId: tenant, organizationId: org }),
        })
      process.stdout.write(`${JSON.stringify({ now: result.now, ...result.counts })}\n`)
    },
  }
}

/**
 * `enrolment applicant-data --tenant <id> --org <id> --email <address> [--erase]` (sign-up form spec *API* → applicant
 * CLI, REQ-J18; phase 3, #800): a data subject request of an applicant who is not a member. Prints the address's
 * applications in that club (found by the keyed `email_key`, decrypted) as JSON; with `--erase` runs
 * `enrolment.applications.erase_applicant` (delete the unconfirmed, withdraw the open, anonymise all, erase the
 * address's deliveries) and prints its counts.
 */
const applicantDataCli: ModuleCli = {
  command: 'applicant-data',
  async run(argv) {
    const { tenant, org, email } = readOptions(argv, ['tenant', 'org', 'email'])
    const erase = argv.includes('--erase')
    if (!tenant || !org || !email) {
      process.stderr.write(
        'Usage: mercato enrolment applicant-data --tenant <tenantId> --org <organizationId> --email <address> [--erase]\n',
      )
      throw new Error('[internal] enrolment applicant-data: invalid options')
    }
    const container = await createRequestContainer()
    const scope = { tenantId: tenant, organizationId: org }
    if (erase) {
      const { result } = await container
        .resolve<CommandBus>('commandBus')
        .execute<unknown, EraseApplicantResult>('enrolment.applications.erase_applicant', {
          input: { email },
          ctx: jobCommandContext(container, scope),
        })
      const counts = {
        deleted: result.deleted,
        withdrawn: result.withdrawn,
        anonymised: result.anonymised,
        deliveries: result.deliveries,
      }
      process.stdout.write(`${JSON.stringify(counts)}\n`)
      return
    }
    const applications = await applicantApplications(container, scope, email)
    process.stdout.write(`${JSON.stringify({ applications }, null, 2)}\n`)
  },
}

const cli: ModuleCli[] = [
  jobCli('expire-unconfirmed', 'enrolment.applications.expire_unconfirmed'),
  jobCli('daily', 'enrolment.applications.daily'),
  applicantDataCli,
]

export default cli
