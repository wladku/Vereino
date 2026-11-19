// Dashboard widget "Order campaigns" (README B-01; payments parity spec REQ-C09; issue #297 E12-S07; mockup
// `kitDashboardWidget`): each running campaign with its stage and progress, linking to its B-32 and to B-30. Offered
// with `payments.orders.manage`.
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const OrderCampaignsWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'payments.dashboard.orderCampaigns',
    title: 'Order campaigns',
    description: 'Each running order campaign with its orders, children and payments.',
    features: ['dashboards.view', 'payments.view', 'payments.orders.manage'],
    defaultSize: 'sm',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: OrderCampaignsWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
