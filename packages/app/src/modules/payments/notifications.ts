import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

/**
 * Notification types of `payments` (payments parity spec *Events, Jobs, Notifications*; DD-C09, #301). The daily
 * overdue reminder tells a payer with an account, in the app, that payments are overdue and links to their payments
 * page; the e-mail `payments.charge_reminder` of the same dispatch lists the charges. Delivered by the foundation
 * dispatch (ids and generic keys only, DD-M07), so it is also registered in `di.ts` for the worker runtime. The cash
 * handover notices (D-042, #791) go the same way, in the app and by e-mail.
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
  // The two-sided cash handover (D-042, REQ-033a, #791): the confirmers are told a handover waits for them, the
  // collector is told its outcome. Generic keys only (DD-M07); the e-mail of the same dispatch names the number, the
  // amount and a rejection's reason.
  {
    type: 'payments.cash_handover_sent',
    module: 'payments',
    channels: ['in_app'],
    titleKey: 'payments.notifications.cashHandoverSent.title',
    bodyKey: 'payments.notifications.cashHandoverSent.body',
    icon: 'wallet',
    severity: 'info',
    category: 'payments',
    linkHref: '/club/cash-handovers',
    actions: [],
  },
  {
    type: 'payments.cash_handover_confirmed',
    module: 'payments',
    channels: ['in_app'],
    titleKey: 'payments.notifications.cashHandoverConfirmed.title',
    bodyKey: 'payments.notifications.cashHandoverConfirmed.body',
    icon: 'wallet',
    severity: 'success',
    category: 'payments',
    linkHref: '/club/coach/payments',
    actions: [],
  },
  {
    type: 'payments.cash_handover_rejected',
    module: 'payments',
    channels: ['in_app'],
    titleKey: 'payments.notifications.cashHandoverRejected.title',
    bodyKey: 'payments.notifications.cashHandoverRejected.body',
    icon: 'wallet',
    severity: 'warning',
    category: 'payments',
    linkHref: '/club/coach/payments',
    actions: [],
  },
  {
    type: 'payments.cash_handover_settled',
    module: 'payments',
    channels: ['in_app'],
    titleKey: 'payments.notifications.cashHandoverSettled.title',
    bodyKey: 'payments.notifications.cashHandoverSettled.body',
    icon: 'wallet',
    severity: 'info',
    category: 'payments',
    linkHref: '/club/coach/payments',
    actions: [],
  },
]

export default notificationTypes
