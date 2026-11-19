// Dashboard widget "Today at the facility" (README B-01; facilities parity spec REQ-R20, widget 8 of the navigation
// spec's role table; #290): today's entries on the club's places in the reader's scope — the administrator and the
// coordinator the club's places, the attendant the assigned places, as `GET /api/facilities/calendar` narrows them —
// by start, at most eight and "and N more", each linking to B-23 on its place and today. Offered with
// `facilities.view`; on by default, so it stands beside "Requests awaiting approval" on every dashboard that has it.
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const TodayAtFacilityWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'facilities.dashboard.todayAtFacility',
    title: 'Today at the facility',
    description: "Today's sessions, rentals, requests, bookings, closures and maintenance on the club's places.",
    features: ['dashboards.view', 'facilities.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: TodayAtFacilityWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
