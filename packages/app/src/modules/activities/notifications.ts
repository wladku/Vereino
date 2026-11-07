import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

/**
 * Notification types of `activities` (club spec *Events, Jobs, Notifications*, stable ids; foundation II DD-G12). Phase 2
 * sends the cancellation and the two declaration notices in the app only; the e-mail joins with `communication`
 * (phase 3); the coach-needed and substitution notices (E06-S13 #95) are in the app only too.
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
  // REQ-017: the in-app type of the `activities.declaration_link` e-mail template (P-31, DD-M07). The link goes by
  // e-mail only — a dispatch of it has no in-app deliveries.
  {
    type: 'activities.declaration_link',
    module: 'activities',
    channels: ['in_app'],
    titleKey: 'activities.notifications.declarationLink.title',
    bodyKey: 'activities.notifications.declarationLink.body',
    icon: 'link',
    severity: 'info',
    category: 'activities',
    actions: [],
  },
  // E06-S13 #95: the assigned coach reported an absence — the coordinators of the session's section (the club
  // administrators when the section has none) open it on B-15 to assign a substitute.
  {
    type: 'activities.coach_needed',
    module: 'activities',
    channels: ['in_app'],
    titleKey: 'activities.notifications.coachNeeded.title',
    bodyKey: 'activities.notifications.coachNeeded.body',
    icon: 'user-x',
    severity: 'warning',
    category: 'activities',
    actions: [],
  },
  // E06-S13 #95 (club spec *Events* row `activities.occurrence.coach_changed`): the coach assigned to a session.
  {
    type: 'activities.substitution_assigned',
    module: 'activities',
    channels: ['in_app'],
    titleKey: 'activities.notifications.substitutionAssigned.title',
    bodyKey: 'activities.notifications.substitutionAssigned.body',
    icon: 'user-check',
    severity: 'info',
    category: 'activities',
    actions: [],
  },
]

export default notificationTypes
