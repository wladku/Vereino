import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

/**
 * In-app notification types of `communication` (foundation III *Events, Jobs, Notifications*, DD-M07, DD-M08): declared
 * `channels: ['in_app']` (the foundation `dispatch` sends the e-mail, so the platform's notification e-mail never
 * sends a Vereino message) and carrying generic keys only — never the subject or the text (the notifications tables
 * are not encrypted). Both lead to the member inbox. The session cancellation has no type here: its in-app notice stays
 * `activities.occurrence_cancelled` (REQ-M07).
 */
export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'communication.announcement',
    module: 'communication',
    channels: ['in_app'],
    nonOptOut: true,
    titleKey: 'communication.notifications.announcement.title',
    bodyKey: 'communication.notifications.announcement.body',
    icon: 'megaphone',
    severity: 'info',
    category: 'communication',
    linkHref: '/club/messages',
    actions: [],
  },
  {
    type: 'communication.reply',
    module: 'communication',
    channels: ['in_app'],
    nonOptOut: true,
    titleKey: 'communication.notifications.reply.title',
    bodyKey: 'communication.notifications.reply.body',
    icon: 'message-circle',
    severity: 'info',
    category: 'communication',
    linkHref: '/club/messages',
    actions: [],
  },
]

export default notificationTypes
