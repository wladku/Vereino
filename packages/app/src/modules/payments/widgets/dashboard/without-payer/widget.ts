// Dashboard widget "Charges without a payer" (README B-01; payments spec REQ-011; issue #111 E07-S04): the open
// charges nobody can pay until the club assigns a payer, linking to the B-21 "Without payer" perspective. Offered with
// `payments.view`.
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const WithoutPayerWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'payments.dashboard.withoutPayer',
    title: 'Charges without a payer',
    description: 'Open charges without a payer, which nobody can pay until the club assigns one.',
    features: ['dashboards.view', 'payments.view'],
    defaultSize: 'sm',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: WithoutPayerWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
