import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import GroupSignUpCodeWidget, { type GroupSignUpCodeContext } from './widget.client'

/**
 * The group sign-up QR code (E29-S02, #869; D41, D44) on the spot `vereino:club:group:actions` of `groups`' page
 * `/club/groups/[id]`: **Sign-up QR code** while the section's form offers the group, with the code, the address and
 * a printable poster. The route checks `groups.view`, which the page needs as well.
 */
const widget: InjectionWidgetModule<GroupSignUpCodeContext, Record<string, unknown>> = {
  metadata: {
    id: 'enrolment.injection.group-sign-up-code',
    title: 'Group: sign-up QR code',
    description: "The QR code of the section's sign-up form with this group chosen, to show or print.",
    features: ['groups.view'],
    priority: 100,
    enabled: true,
  },
  Widget: GroupSignUpCodeWidget,
}

export default widget
