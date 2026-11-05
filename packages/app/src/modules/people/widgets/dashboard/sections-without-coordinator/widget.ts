// Dashboard widget "Sections without a coordinator" (README B-01, note 4; issue #88): the club administrator's count of
// the active sections without an active coordinator and the first five of them. Offered only with `club_core.manage`
// (the coordinator assignment is the administrator's task) and `people.view` (the coordinators enrichment).
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const SectionsWithoutCoordinatorWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'people.dashboard.sectionsWithoutCoordinator',
    title: 'Sections without a coordinator',
    description: 'Active sections that have no active coordinator today.',
    features: ['dashboards.view', 'club_core.manage', 'people.view'],
    defaultSize: 'md',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: SectionsWithoutCoordinatorWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
