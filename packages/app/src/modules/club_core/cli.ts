// Operator commands of `club_core` (`yarn mercato club_core <command>`).
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { ClubCorePlacesService } from './services/places'
import { CLUB_CORE_PLACES_SERVICE } from './di'
import { parseCreateClubOptions } from './lib/club-onboarding'
import { createClub, CreateClubIncompleteError } from './services/club-onboarding'

function readOptions(argv: string[], names: readonly string[]): Record<string, string | undefined> {
  const options = Object.fromEntries(names.map((name) => [name, { type: 'string' as const }]))
  const { values } = parseArgs({ args: argv, options, strict: false, allowPositionals: true })
  return Object.fromEntries(names.map((name) => [name, typeof values[name] === 'string' ? values[name] : undefined]))
}

/**
 * `club_core check-bookable-place --tenant <id> --org <id> --place <id>`: runs the leaf rule the session and booking
 * commands apply (`clubCorePlaces.assertBookableLeaf`) and prints `{ bookable, status?, code? }` — for operators
 * checking a place tree before sessions are planned, and for the integration tests until a consumer exists.
 */
const checkBookablePlace: ModuleCli = {
  command: 'check-bookable-place',
  async run(argv) {
    const { tenant, org, place } = readOptions(argv, ['tenant', 'org', 'place'])
    if (!tenant || !org || !place) {
      process.stderr.write(
        'Usage: mercato club_core check-bookable-place --tenant <tenantId> --org <organizationId> --place <placeId>\n',
      )
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const places = container.resolve<ClubCorePlacesService>(CLUB_CORE_PLACES_SERVICE)
    try {
      await places.assertBookableLeaf({ tenantId: tenant, organizationId: org }, place)
      process.stdout.write(`${JSON.stringify({ bookable: true })}\n`)
    } catch (error: unknown) {
      if (!isCrudHttpError(error)) throw error
      const code = typeof error.body.code === 'string' ? error.body.code : null
      process.stdout.write(`${JSON.stringify({ bookable: false, status: error.status, code })}\n`)
    }
  },
}

const CREATE_CLUB_USAGE =
  'Usage: mercato club_core create-club --slug <slug> --name <club name> --admin-email <email> ' +
  '--admin-first-name <name> --admin-last-name <name> [--timezone Europe/Warsaw] [--locale pl] [--dry-run] ' +
  '[--tenant <tenantId> --org <organizationId>]\n'

/**
 * `club_core create-club` (many clubs spec phase 2, REQ-M05; #630): creates a club on the shared instance — its tenant
 * and organization, address, settings, roles, dictionaries, schedules and first administrator — and e-mails the
 * administrator an invitation (never a password on the command line). Prints one JSON line: `status` `created` with the
 * ids, roles, schedules and address; `exists` (exit 0, nothing changed) when a club holds the slug; `dry-run` with the
 * problems a real run would meet; `refused` or `invalid` (exit 1) before anything is written. A failure after the
 * tenant exists prints `incomplete` with the ids and the failed step (exit 1); the same command with `--tenant` and
 * `--org` then runs the remaining idempotent steps for that organization and prints `completed` (`docs/ops/clubs.md`).
 */
const createClubCommand: ModuleCli = {
  command: 'create-club',
  async run(argv) {
    const { values } = parseArgs({
      args: argv,
      options: {
        slug: { type: 'string' },
        name: { type: 'string' },
        'admin-email': { type: 'string' },
        'admin-first-name': { type: 'string' },
        'admin-last-name': { type: 'string' },
        timezone: { type: 'string' },
        locale: { type: 'string' },
        'dry-run': { type: 'boolean' },
        tenant: { type: 'string' },
        org: { type: 'string' },
      },
      strict: false,
      allowPositionals: true,
    })
    const parsed = parseCreateClubOptions(
      Object.fromEntries(
        Object.entries(values).filter(([, value]) => typeof value === 'string' || typeof value === 'boolean'),
      ),
    )
    if (!parsed.ok) {
      process.stderr.write(CREATE_CLUB_USAGE)
      process.stdout.write(`${JSON.stringify({ status: 'invalid', problems: parsed.problems })}\n`)
      throw new Error('[internal] create-club: invalid options, nothing was written')
    }
    const container = await createRequestContainer()
    let outcome: Awaited<ReturnType<typeof createClub>>
    try {
      outcome = await createClub(container, parsed.options, process.env)
    } catch (error: unknown) {
      if (!(error instanceof CreateClubIncompleteError)) throw error
      process.stdout.write(`${JSON.stringify({ status: 'incomplete', step: error.step, ...error.scope })}\n`)
      throw new Error(`[internal] create-club: ${error.message}: ${String(error.failure)}`)
    }
    process.stdout.write(`${JSON.stringify(outcome)}\n`)
    // The platform CLI exits 1 only on a thrown error (`process.exitCode` is not passed on).
    if (outcome.status === 'refused')
      throw new Error(`[internal] create-club refused, nothing was written: ${outcome.reason}`)
  },
}

const commands: ModuleCli[] = [checkBookablePlace, createClubCommand]

export default commands
