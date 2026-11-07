// Dashboard widget "Unsettled sessions" (README B-01; club spec *Events* row "Unsettled" list predicate; E06-S13 #95):
// the planned sessions that ended 24 hours ago or more without a closed attendance list, in the caller's record scope
// — the coordinator's sections, the club administrator's club — linking to each session and to B-15 "Unsettled".
// Offered with `activities.view`.
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const UnsettledSessionsWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'activities.dashboard.unsettledSessions',
    title: 'Unsettled sessions',
    description: 'Sessions that ended over 24 hours ago without a closed attendance list.',
    features: ['dashboards.view', 'activities.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: UnsettledSessionsWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
