import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import StaffSetupGroupsWidget, { type StaffSetupGroupsContext } from './widget.client'

/**
 * The "Groups as coach" row of the person record's "Staff setup" checklist (people life-cycle spec REQ-L09, J-L07;
 * #312), on the spot `vereino:people:person-record:staff-setup` of `people`'s Roles tab. The memberships come from
 * `GET /api/groups/memberships?personId`, whose record scope keeps a coordinator to the groups of their sections.
 */
const widget: InjectionWidgetModule<StaffSetupGroupsContext, Record<string, unknown>> = {
  metadata: {
    id: 'groups.injection.staff-setup-groups',
    title: 'Person record: staff setup, groups as coach',
    description: "Whether the person coaches a group, with a link to add them to a group's roster as coach.",
    features: ['groups.view'],
    priority: 200,
    enabled: true,
  },
  Widget: StaffSetupGroupsWidget,
}

export default widget
