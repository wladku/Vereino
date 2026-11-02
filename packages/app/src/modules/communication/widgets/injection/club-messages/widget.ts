import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import ClubMessagesTileWidget from './widget.client'

/**
 * The "Messages" tile of `/club` (foundation III REQ-M10, *UI and Interaction Contracts*: the unread count; a zero
 * count hides the badge, an error hides the count), on the spot `vereino:club:today:sections` of `people`'s page.
 */
const widget: InjectionWidgetModule<Record<string, unknown>, Record<string, unknown>> = {
  metadata: {
    id: 'communication.injection.club-messages',
    title: 'Today: messages',
    description: 'The number of conversations with unread messages and the way to the inbox.',
    features: ['communication.view'],
    priority: 90,
    enabled: true,
  },
  Widget: ClubMessagesTileWidget,
}

export default widget
