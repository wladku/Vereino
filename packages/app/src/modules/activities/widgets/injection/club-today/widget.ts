import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import ClubTodayTilesWidget, { type ClubTodayContext } from './widget.client'

/**
 * The "Calendar" and "Attendance" tiles of `/club` (club spec `/club` — Today: tiles show today and tomorrow for all
 * wards; the attendance tile names the declarations waiting for the guardian; #32), on the spot
 * `vereino:club:today:sections` of `people`'s Today page.
 */
const widget: InjectionWidgetModule<ClubTodayContext, Record<string, unknown>> = {
  metadata: {
    id: 'activities.injection.club-today',
    title: 'Today: calendar and attendance',
    description: 'The sessions of today and tomorrow and the declarations waiting for the guardian.',
    features: ['people.self'],
    priority: 100,
    enabled: true,
  },
  Widget: ClubTodayTilesWidget,
}

export default widget
