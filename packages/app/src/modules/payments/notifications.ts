import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

/**
 * Notification types of `payments` (payments parity spec *Events, Jobs, Notifications*; DD-C09, #301). The daily
 * overdue reminder tells a payer with an account, in the app, that payments are overdue and links to their payments
 * page; the e-mail `payments.charge_reminder` of the same dispatch lists the charges. Delivered by the foundation
 * dispatch (ids and generic keys only, DD-M07), so it is also registered in `di.ts` for the worker runtime.
 */
export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'payments.charge_overdue',
    module: 'payments',
    channels: ['in_app'],
    titleKey: 'payments.notifications.chargeOverdue.title',
    bodyKey: 'payments.notifications.chargeOverdue.body',
    icon: 'wallet',
    severity: 'warning',
    category: 'payments',
    linkHref: '/club/payments',
    actions: [],
  },
]

export default notificationTypes
