import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import ClubApplicationsTileWidget from './widget.client'

/**
 * The "Applications" tile of `/club` (sign-up form spec M-J1, REQ-J10, J-J03; #799) on the spot
 * `vereino:club:today:sections` of `people`'s Today page: the new applications and how many are past the answer time,
 * linking to `/club/applications`; hidden while nothing is open.
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'enrolment.injection.club-today',
    title: 'Today: applications',
    description: 'The new applications to the sections the user decides and how many are past the answer time.',
    features: ['enrolment.applications.view'],
    priority: 95,
    enabled: true,
  },
  Widget: ClubApplicationsTileWidget,
}

export default widget
