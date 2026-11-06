import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import ClubWardGroupsWidget, { type ClubWardGroupsContext } from './widget.client'

/**
 * The groups and sections of one ward on the member pages (E06-S22 #104; README M-10), on the spot
 * `vereino:club:ward:groups` of `people`'s profile and ward pages.
 */
const widget: InjectionWidgetModule<ClubWardGroupsContext, Record<string, unknown>> = {
  metadata: {
    id: 'groups.injection.club-ward-groups',
    title: 'Member pages: groups of a ward',
    description: 'The groups and sections a ward (or the member) belongs to on the club day.',
    features: ['people.self'],
    priority: 100,
    enabled: true,
  },
  Widget: ClubWardGroupsWidget,
}

export default widget
