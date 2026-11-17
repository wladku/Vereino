import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import NotLinkedNotice from './widget.client'

/**
 * The "not linked to a person" notice (club spec *UI architecture* → redirect after sign-in; #27, #352) on the platform
 * spot `backend:layout:top`: the sign-in of an account linked to no person lands on `/backend?notice=person-not-linked`
 * (`people.member-landing`), and this banner says the member area is not available. It needs no feature: such an
 * account may hold none.
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'people.injection.not-linked-notice',
    title: 'Not linked to a person notice',
    description: 'Tells an account linked to no person, after sign-in, that the member area is not available.',
    priority: 110,
    enabled: true,
  },
  Widget: NotLinkedNotice,
}

export default widget
