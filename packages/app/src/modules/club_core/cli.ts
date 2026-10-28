// Operator commands of `club_core` (`yarn mercato club_core <command>`).
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { ClubCorePlacesService } from './services/places'
import { CLUB_CORE_PLACES_SERVICE } from './di'

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

const commands: ModuleCli[] = [checkBookablePlace]

export default commands
