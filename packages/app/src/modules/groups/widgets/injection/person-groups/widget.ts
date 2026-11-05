import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import PersonGroupsWidget, { type PersonGroupsContext } from './widget.client'

/**
 * The "Groups" tab of the person record (README B-10 "Groups (membership history)"; #84), on the spot
 * `vereino:people:person-record:groups` of `people`'s `PersonRecord`. The memberships come from
 * `GET /api/groups/memberships?personId`, whose record scope keeps a coordinator to the groups of their sections.
 */
const widget: InjectionWidgetModule<PersonGroupsContext, Record<string, unknown>> = {
  metadata: {
    id: 'groups.injection.person-groups',
    title: 'Person record: groups',
    description: "The person's group memberships with their periods, ended ones included.",
    features: ['groups.view'],
    priority: 100,
    enabled: true,
  },
  Widget: PersonGroupsWidget,
}

export default widget
