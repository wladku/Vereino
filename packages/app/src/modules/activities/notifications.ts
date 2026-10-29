import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

/**
 * Notification types of `activities` (club spec *Events, Jobs, Notifications*, stable ids; foundation II DD-G12). Phase 2
 * sends the cancellation in the app only; the e-mail joins with `communication` (phase 3). The coach-needed,
 * substitution and declaration types arrive with their stories.
 */
export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'activities.occurrence_cancelled',
    module: 'activities',
    channels: ['in_app'],
    titleKey: 'activities.notifications.occurrenceCancelled.title',
    bodyKey: 'activities.notifications.occurrenceCancelled.body',
    icon: 'calendar-x',
    severity: 'warning',
    category: 'activities',
    actions: [],
  },
]

export default notificationTypes
