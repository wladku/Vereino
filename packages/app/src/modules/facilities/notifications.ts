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
  {
    // #128: the date and usage reminders of a maintenance task, through the foundation `dispatch` (in-app only).
    type: 'facilities.maintenance_due',
    module: 'facilities',
    channels: ['in_app'],
    titleKey: 'facilities.notifications.maintenanceDue.title',
    bodyKey: 'facilities.notifications.maintenanceDue.body',
    icon: 'wrench',
    severity: 'warning',
    category: 'facilities',
    linkHref: '/backend/facilities/maintenance',
    actions: [],
  },
  {
    // #283 (REQ-R15, J-R07): the same reminder for a place maintainer, linking to their phone page; same keys.
    type: 'facilities.maintenance_due_planner',
    module: 'facilities',
    channels: ['in_app'],
    titleKey: 'facilities.notifications.maintenanceDue.title',
    bodyKey: 'facilities.notifications.maintenanceDue.body',
    icon: 'wrench',
    severity: 'warning',
    category: 'facilities',
    linkHref: '/club/places/maintenance',
    actions: [],
  },
  {
    // #282 (DD-R12, J-R08): an incident asks for an entry ban; the club administrators decide on the Incidents tab.
    type: 'facilities.entry_ban_requested',
    module: 'facilities',
    channels: ['in_app'],
    titleKey: 'facilities.notifications.banRequest.title',
    bodyKey: 'facilities.notifications.banRequest.body',
    icon: 'shield-alert',
    severity: 'warning',
    category: 'facilities',
    linkHref: '/backend/facilities/incidents',
    actions: [],
  },
  {
    // #287 (REQ-R18, DD-R14, J-R05): a closure or maintenance window flagged a coordinator's, coach's or booker's
    // entries to be moved. The in-app link is per type (DD-M07), so it opens the club's places on the phone; the
    // e-mail's button opens the place's day filtered "Do przeniesienia".
    type: 'facilities.reschedule_needed',
    module: 'facilities',
    channels: ['in_app'],
    titleKey: 'facilities.notifications.reschedule.title',
    bodyKey: 'facilities.notifications.reschedule.body',
    icon: 'calendar-x',
    severity: 'warning',
    category: 'facilities',
    linkHref: '/club/places',
    actions: [],
  },
  {
    // #287: the administrators' copy when a rental is among the entries; B-24 "Do przeniesienia". Same keys.
    type: 'facilities.reschedule_needed_rentals',
    module: 'facilities',
    channels: ['in_app'],
    titleKey: 'facilities.notifications.reschedule.title',
    bodyKey: 'facilities.notifications.reschedule.body',
    icon: 'calendar-x',
    severity: 'warning',
    category: 'facilities',
    linkHref: '/backend/facilities/rentals?view=to_move',
    actions: [],
  },
]

export default notificationTypes
