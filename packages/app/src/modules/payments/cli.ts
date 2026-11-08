// Operator commands of `payments` (`yarn mercato payments <command>`). `reconcile-checkouts` is the sweep of the
// payments spec *Events* row `payments:reconcile-checkouts` (DD-42; #110): late captures are booked, `created`
// checkouts older than 24 hours expire. The owner's default of 2026-11-06 on #110 ships it as a command run by hand or
// by cron; the scheduled job comes later, like `payments:generate-charges` (#108). `close-order-campaigns` is the
// `payments:close-order-campaigns` sweep of order campaigns (#115), shipped the same way.
import { parseArgs } from 'node:util'
import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { reconcileCheckouts } from './services/checkout'
import { closeOrderCampaigns } from './services/order-campaigns'

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

/** `payments close-order-campaigns --tenant <id> --org <id>`: closes the club's open campaigns past their deadline. */
const closeCampaigns: ModuleCli = {
  command: 'close-order-campaigns',
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
      process.stderr.write('Usage: mercato payments close-order-campaigns --tenant <tenantId> --org <organizationId>\n')
      process.exitCode = 1
      return
    }
    const container = await createRequestContainer()
    const summary = await closeOrderCampaigns(container, { tenantId, organizationId })
    // Machine-readable result for operators.
    process.stdout.write(`${JSON.stringify(summary)}\n`)
  },
}

const commands: ModuleCli[] = [reconcile, closeCampaigns]

export default commands
