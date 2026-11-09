import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

/**
 * Notification types of `facilities` (facilities spec *Events, Jobs, Notifications*; #125). A confirmed online request
 * tells everyone holding `facilities.rentals.approve` in the app; the request e-mails go to a bare address, so their
 * declared in-app type (`facilities.rental_request_update`, P-31) never has an in-app delivery.
 */
export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'facilities.rental_request_pending',
    module: 'facilities',
    channels: ['in_app'],
    titleKey: 'facilities.notifications.requestPending.title',
    bodyKey: 'facilities.notifications.requestPending.body',
    icon: 'calendar-clock',
    severity: 'info',
    category: 'facilities',
    linkHref: '/backend/facilities/requests',
    actions: [],
  },
  {
    type: 'facilities.rental_request_update',
    module: 'facilities',
    channels: ['in_app'],
    titleKey: 'facilities.notifications.requestUpdate.title',
    bodyKey: 'facilities.notifications.requestUpdate.body',
    icon: 'mail',
    severity: 'info',
    category: 'facilities',
    actions: [],
  },
]

export default notificationTypes
