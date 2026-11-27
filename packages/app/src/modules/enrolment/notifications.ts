import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

/**
 * Notification types of `enrolment` (sign-up form spec *Events, Jobs, Notifications*; #799). A confirmed application
 * tells the coordinators of its section in the app, or the club administrators when the section has none (Q-J03); the
 * stored body names the section only, never the applicant (nothing outlives the 30-day anonymisation). The applicant's
 * e-mails go to a bare address, so their declared type (`enrolment.applicant_update`) never has an in-app delivery.
 */
export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'enrolment.application_new',
    module: 'enrolment',
    channels: ['in_app'],
    titleKey: 'enrolment.notifications.applicationNew.title',
    bodyKey: 'enrolment.notifications.applicationNew.body',
    icon: 'user-plus',
    severity: 'info',
    category: 'enrolment',
    linkHref: '/club/applications',
    actions: [],
  },
  // Phase 3 (#800, DD-J15, DD-J15a): a free place in a group with a waiting list; a rollover closed a group.
  {
    type: 'enrolment.place_freed',
    module: 'enrolment',
    channels: ['in_app'],
    titleKey: 'enrolment.notifications.placeFreed.title',
    bodyKey: 'enrolment.notifications.placeFreed.body',
    icon: 'user-plus',
    severity: 'info',
    category: 'enrolment',
    linkHref: '/club/applications?tab=waiting',
    actions: [],
  },
  {
    type: 'enrolment.group_closed',
    module: 'enrolment',
    channels: ['in_app'],
    titleKey: 'enrolment.notifications.groupClosed.title',
    bodyKey: 'enrolment.notifications.groupClosed.body',
    icon: 'alert-triangle',
    severity: 'warning',
    category: 'enrolment',
    linkHref: '/club/applications',
    actions: [],
  },
  {
    type: 'enrolment.applicant_update',
    module: 'enrolment',
    channels: ['in_app'],
    titleKey: 'enrolment.notifications.applicantUpdate.title',
    bodyKey: 'enrolment.notifications.applicantUpdate.body',
    icon: 'mail',
    severity: 'info',
    category: 'enrolment',
    actions: [],
  },
]

export default notificationTypes
