// Dashboard widget "Applications past the answer time" (sign-up form spec B-J1, REQ-J17, J-J07; #799): the number of
// the club's applications older than the answer time with no decision, linking to the back-office list filtered to
// overdue. Offered with `enrolment.manage` (the club administrators, who decide for sections without a coordinator).
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const OverdueApplicationsWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'enrolment.dashboard.overdueApplications',
    title: 'Applications past the answer time',
    description: 'The applications that wait for a decision longer than the club answers.',
    features: ['dashboards.view', 'enrolment.manage'],
    defaultSize: 'sm',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: OverdueApplicationsWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
