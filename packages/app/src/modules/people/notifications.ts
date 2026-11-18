import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

/**
 * Notification types of `people` (people life-cycle spec *Events, Jobs, Notifications*; phase L4, #306): the in-app
 * side of the departure e-mails (DD-M07) — a member asked to leave (to the club administrators), the club declined a
 * request (to the member who filed it) and the club confirmed a departure (to the persons who leave, a minor's
 * guardians for the minor). No message carries a reason, a note or a birth date.
 */
export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'people.departure_request_received',
    module: 'people',
    channels: ['in_app'],
    titleKey: 'people.notifications.departureRequestReceived.title',
    bodyKey: 'people.notifications.departureRequestReceived.body',
    icon: 'log-out',
    severity: 'info',
    category: 'people',
    actions: [],
  },
  {
    type: 'people.departure_request_declined',
    module: 'people',
    channels: ['in_app'],
    titleKey: 'people.notifications.departureRequestDeclined.title',
    bodyKey: 'people.notifications.departureRequestDeclined.body',
    icon: 'log-out',
    severity: 'warning',
    category: 'people',
    linkHref: '/club/profile/leave',
    actions: [],
  },
  {
    type: 'people.departure_confirmed',
    module: 'people',
    channels: ['in_app'],
    titleKey: 'people.notifications.departureConfirmed.title',
    bodyKey: 'people.notifications.departureConfirmed.body',
    icon: 'log-out',
    severity: 'info',
    category: 'people',
    linkHref: '/club/profile',
    actions: [],
  },
]

export default notificationTypes
