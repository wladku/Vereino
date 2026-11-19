// Dashboard widget "Bank statements and cash" (README B-01; payments parity spec REQ-C09, REQ-C02; issue #297
// E12-S07): the statement transfers waiting for a decision, the charges to refund, "Import statement" and "Accept
// cash" (the shared dialog), linking to B-29. Offered with `payments.bank.import` and `payments.cash.record`, the two
// actions it carries.
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const BankWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'payments.dashboard.bank',
    title: 'Bank statements and cash',
    description: 'Statement transfers waiting for a decision, charges to refund, and the statement import and cash.',
    features: ['dashboards.view', 'payments.view', 'payments.bank.import', 'payments.cash.record'],
    defaultSize: 'sm',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: BankWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
