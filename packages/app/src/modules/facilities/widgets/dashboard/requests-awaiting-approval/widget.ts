// Dashboard widget "Requests awaiting approval" (README B-01; facilities spec J-007 step 4, REQ-024; E08-S05 #125): the
// count and the first confirmed online booking requests whose 48-hour hold is still running, the soonest expiry first,
// each with its place, slot and time to expiry, linking to B-25 `/backend/facilities/requests`. Offered with
// `facilities.rentals.approve`.
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const RequestsAwaitingApprovalWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'facilities.dashboard.requestsAwaitingApproval',
    title: 'Requests awaiting approval',
    description: 'Online facility booking requests waiting for a decision, the soonest expiry first.',
    features: ['dashboards.view', 'facilities.view', 'facilities.rentals.approve'],
    defaultSize: 'md',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: RequestsAwaitingApprovalWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
