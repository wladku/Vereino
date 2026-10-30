import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

/**
 * Notification types of `activities` (club spec *Events, Jobs, Notifications*, stable ids; foundation II DD-G12). Phase 2
 * sends the cancellation and the two declaration notices in the app only; the e-mail joins with `communication`
 * (phase 3). The coach-needed and substitution types arrive with their stories.
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
  // #32: a minor declared for themself under `immediate` — the guardians are told (club spec *Events* row).
  {
    type: 'activities.ward_declared',
    module: 'activities',
    channels: ['in_app'],
    titleKey: 'activities.notifications.wardDeclared.title',
    bodyKey: 'activities.notifications.wardDeclared.body',
    icon: 'calendar-check',
    severity: 'info',
    category: 'activities',
    actions: [],
  },
  // #32: a minor declared under `guardian_confirm` — the guardians decide on `/club/occurrences/[id]`.
  {
    type: 'activities.guardian_confirmation_needed',
    module: 'activities',
    channels: ['in_app'],
    titleKey: 'activities.notifications.guardianConfirmationNeeded.title',
    bodyKey: 'activities.notifications.guardianConfirmationNeeded.body',
    icon: 'calendar-clock',
    severity: 'warning',
    category: 'activities',
    actions: [],
  },
]

export default notificationTypes
