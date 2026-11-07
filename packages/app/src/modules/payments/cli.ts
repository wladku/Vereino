// Operator commands of `payments` (`yarn mercato payments <command>`). `reconcile-checkouts` is the sweep of the
// payments spec *Events* row `payments:reconcile-checkouts` (DD-42; #110): late captures are booked, `created`
// checkouts older than 24 hours expire. The owner's default of 2026-11-06 on #110 ships it as a command run by hand or
// by cron; the scheduled job comes later, like `payments:generate-charges` (#108).
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { reconcileCheckouts } from './services/checkout'

/** `payments reconcile-checkouts --tenant <id> --org <id>`: one run of the sweep for one club. */
const reconcile: ModuleCli = {
  command: 'reconcile-checkouts',
  async run(argv) {
    const { values } = parseArgs({
      args: argv,
      options: { tenant: { type: 'string' }, org: { type: 'string' } },
      strict: false,
      allowPositionals: true,
    })
    const tenantId = typeof values.tenant === 'string' ? values.tenant : undefined
    const organizationId = typeof values.org === 'string' ? values.org : undefined
    if (!tenantId || !organizationId) {
      process.stderr.write('Usage: mercato payments reconcile-checkouts --tenant <tenantId> --org <organizationId>\n')
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const summary = await reconcileCheckouts(container, { tenantId, organizationId })
    // Machine-readable result for operators.
    process.stdout.write(`${JSON.stringify(summary)}\n`)
  },
}

const commands: ModuleCli[] = [reconcile]

export default commands
