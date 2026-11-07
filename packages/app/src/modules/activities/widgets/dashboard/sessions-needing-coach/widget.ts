// Dashboard widget "Sessions needing a coach" (README B-01, flow F-03 path A; E06-S13 #95): the planned sessions
// without a coach from today for 14 days in the caller's record scope — the coordinator's sections, the club
// administrator's club — linking to each session and to B-15 "Needing a coach". Offered with `activities.view`.
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const SessionsNeedingCoachWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'activities.dashboard.sessionsNeedingCoach',
    title: 'Sessions needing a coach',
    description: 'Planned sessions without a coach in the next 14 days.',
    features: ['dashboards.view', 'activities.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: SessionsNeedingCoachWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
