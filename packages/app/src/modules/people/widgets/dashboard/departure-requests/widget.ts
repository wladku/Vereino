// Dashboard widget "Departure requests" (people life-cycle spec *UI architecture → Dashboard widgets*, row 10; phase L4,
// #306): the open requests to leave, oldest first, five rows, each linking to the person's Leaving tab. Offered only
// with `people.manage` (the departure is the administrator's decision). Until spec N's dashboard frame places it, it
// shows on the platform dashboard in the default order.
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const DepartureRequestsWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'people.dashboard.departureRequests',
    title: 'Departure requests',
    description: 'Open requests to leave the club, oldest first.',
    features: ['dashboards.view', 'people.manage'],
    defaultSize: 'md',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: DepartureRequestsWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
