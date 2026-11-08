// Dashboard widget "Overdue" (README B-01; payments spec REQ-011; issue #111 E07-S04): what remains on charges past
// their due date and how many families owe it, linking to the B-21 "Overdue" perspective. Offered with
// `payments.view`.
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const OverdueWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'payments.dashboard.overdue',
    title: 'Overdue',
    description: 'What remains on charges past their due date, and how many families owe it.',
    features: ['dashboards.view', 'payments.view'],
    defaultSize: 'sm',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: OverdueWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
