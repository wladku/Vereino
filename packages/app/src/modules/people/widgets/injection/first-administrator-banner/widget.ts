import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import FirstAdministratorBanner from './widget.client'

/**
 * The "First administrator" banner (people life-cycle spec REQ-L13, J-L08 step 1; #305) on the platform spot
 * `backend:layout:top`: while the club has no administrator, it tells the technical administrator (platform feature
 * `auth.users.create`) and links to `/backend/people/first-administrator`.
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'people.injection.first-administrator-banner',
    title: 'First administrator banner',
    description: 'Says that the club has no administrator yet and links to the page that creates one.',
    features: ['auth.users.create'],
    priority: 100,
    enabled: true,
  },
  Widget: FirstAdministratorBanner,
}

export default widget
