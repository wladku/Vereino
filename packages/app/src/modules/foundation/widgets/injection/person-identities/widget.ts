import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import PersonIdentitiesWidget, { type PersonIdentitiesContext } from './widget.client'

/** "Sign-in methods" on the person record (#566), on `people`'s spot `vereino:people:person-record:sign-in`. */
const widget: InjectionWidgetModule<PersonIdentitiesContext, Record<string, unknown>> = {
  metadata: {
    id: 'foundation.injection.person-identities',
    title: 'Person record: sign-in methods',
    description: "A person's linked sign-in identities, with unlink for the club administrator.",
    features: ['foundation.identity.manage'],
    priority: 100,
    enabled: true,
  },
  Widget: PersonIdentitiesWidget,
}

export default widget
