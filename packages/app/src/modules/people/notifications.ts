import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

/**
 * Notification types of `people` (people life-cycle spec *Events, Jobs, Notifications*; phase L4, #306): the in-app
 * side of the departure e-mails (DD-M07) — a member asked to leave (to the club administrators), the club declined a
 * request (to the member who filed it) and the club confirmed a departure (to the persons who leave, a minor's
 * guardians for the minor). No message carries a reason, a note or a birth date.
 */
function attentionList(filter: string): string {
  return `/backend/people/persons?attention=${filter}`
}

function lifeCycleType(type: string, key: string, icon: string, linkHref: string): NotificationTypeDefinition[] {
  return [
    {
      type,
      module: 'people',
      channels: ['in_app'],
      titleKey: `people.notifications.${key}.title`,
      bodyKey: `people.notifications.${key}.body`,
      icon,
      severity: 'info',
      category: 'people',
      linkHref,
      actions: [],
    },
  ]
}

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
  // Phase L8 (#310): the 18th birthday 30 days ahead and on the day, and the account age — a family version (the
  // guardians and the person) and the administrators' version linking to the "Needs attention" list.
  ...lifeCycleType('people.turns_18_soon', 'turns18Soon', 'calendar-clock', '/club/profile'),
  ...lifeCycleType('people.turns_18_soon_admin', 'turns18SoonAdmin', 'calendar-clock', attentionList('turns_18_soon')),
  ...lifeCycleType('people.came_of_age', 'cameOfAge', 'user-check', '/club/profile'),
  ...lifeCycleType('people.came_of_age_admin', 'cameOfAgeAdmin', 'user-check', '/backend/people/persons'),
  ...lifeCycleType('people.account_age_reached', 'accountAgeReached', 'user-check', '/club'),
  ...lifeCycleType(
    'people.account_age_reached_admin',
    'accountAgeReachedAdmin',
    'user-check',
    attentionList('account_age'),
  ),
  // Training outlines and medical expiry spec REQ-O03 (#682): the medical certificate a month before and on the date.
  ...lifeCycleType('people.medical_expiring', 'medicalExpiring', 'stethoscope', '/club/profile'),
  ...lifeCycleType('people.medical_expired', 'medicalExpired', 'stethoscope', '/club/profile'),
]

export default notificationTypes
