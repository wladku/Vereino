import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import AddExternalPlaceWidget, { type AddExternalPlaceContext } from './widget.client'

/**
 * "Add place" of the panel's club event form (club events spec REQ-T06, B-T2; #378): a missing venue added as an
 * external place, selected in the form's place picker. Needs `club_core.places.add_external` (coordinators and the
 * club administrator), as the route does.
 */
const widget: InjectionWidgetModule<AddExternalPlaceContext, Record<string, unknown>> = {
  metadata: {
    id: 'club_core.injection.add-external-place',
    title: 'Club event form: add an external place',
    description: 'The "Add place" dialog the club event form opens from its place picker.',
    features: ['club_core.places.add_external'],
    priority: 100,
    enabled: true,
  },
  Widget: AddExternalPlaceWidget,
}

export default widget
