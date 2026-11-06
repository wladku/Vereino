// Operator commands of `groups` (`yarn mercato groups <command>`).
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { seedAgeCategoryDictionary } from './services/age-categories'

/**
 * `groups seed-age-categories --tenant <id> --org <id>`: creates the club's age category dictionary with the PZPN
 * defaults — what `seedDefaults` does for a new club (#92) — for a club set up before the dictionary existed. A club
 * that already has it keeps it untouched. Prints `{ "created": true|false }`.
 */
const seedAgeCategories: ModuleCli = {
  command: 'seed-age-categories',
  async run(argv) {
    const { values } = parseArgs({
      args: argv,
      options: { tenant: { type: 'string' }, org: { type: 'string' } },
      strict: false,
      allowPositionals: true,
    })
    const tenant = typeof values.tenant === 'string' ? values.tenant : undefined
    const org = typeof values.org === 'string' ? values.org : undefined
    if (!tenant || !org) {
      process.stderr.write('Usage: mercato groups seed-age-categories --tenant <tenantId> --org <organizationId>\n')
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const created = await seedAgeCategoryDictionary(container, { tenantId: tenant, organizationId: org })
    process.stdout.write(`${JSON.stringify({ created })}\n`)
  },
}

const commands: ModuleCli[] = [seedAgeCategories]

export default commands
