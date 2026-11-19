// Dashboard widget "People needing attention" (people life-cycle spec *UI architecture → Dashboard widgets*, row 11;
// phase L8, #310): one count per B-09 "Needs attention" filter — may get an account, turns 18 within 30 days, adult
// without contact, missing consents — each linking to the people list with that filter. Offered only with
// `people.manage`. Until spec N's dashboard frame places it, it shows on the platform dashboard in the default order.
import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const PeopleNeedingAttentionWidget = lazyDashboardWidget<Record<string, never>>(() => import('./widget.client'))

const widget: DashboardWidgetModule<Record<string, never>> = {
  metadata: {
    id: 'people.dashboard.peopleNeedingAttention',
    title: 'People needing attention',
    description:
      'Children who may get an account, 18th birthdays within 30 days, adults without contact, missing consents.',
    features: ['dashboards.view', 'people.manage'],
    defaultSize: 'md',
    defaultEnabled: true,
    supportsRefresh: true,
  },
  Widget: PeopleNeedingAttentionWidget,
  hydrateSettings: () => ({}),
  dehydrateSettings: () => ({}),
}

export default widget
