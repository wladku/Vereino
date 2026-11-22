import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import ProfileIdentitiesWidget from './widget.client'

/** "Connected accounts" on `/club/profile` (#566), on `people`'s spot `vereino:club:profile:sign-in`. */
const widget: InjectionWidgetModule<Record<string, never>, Record<string, unknown>> = {
  metadata: {
    id: 'foundation.injection.profile-identities',
    title: 'Member profile: connected accounts',
    description: 'The sign-in identities of the signed-in user, with connect and disconnect.',
    features: ['foundation.identity.self'],
    priority: 100,
    enabled: true,
  },
  Widget: ProfileIdentitiesWidget,
}

export default widget
