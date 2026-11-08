import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Events of `payments` (payments spec API table: `payments.fee.*`, `payments.charge.created` batched); payloads carry
 * ids only (S4.6). A generation emits one `payments.charge.created` with the generation id and its charge ids; its
 * undo emits one `payments.charge.cancelled` with the cancelled ids, and so does a single cancellation (#109). A
 * recorded payment emits `payments.payment.recorded`, a reversing entry `payments.payment.reversed`. The online
 * checkout (#110) emits `payments.checkout.created` and, once booked, `payments.checkout.completed` with a
 * `payments.payment.recorded` per online payment; an online refund emits `payments.payment.refunded`. An order campaign (#115) emits
 * `payments.order_campaign.created|updated` and, per stage, `payments.order_campaign.status_changed` with the new status.
 */
const events = [
  { id: 'payments.fee.created', label: 'Fee schedule created', entity: 'fee', category: 'crud' },
  { id: 'payments.fee.updated', label: 'Fee schedule updated', entity: 'fee', category: 'crud' },
  { id: 'payments.fee.deleted', label: 'Fee schedule deleted', entity: 'fee', category: 'crud' },
  { id: 'payments.discount_rule.created', label: 'Discount rule created', entity: 'discount_rule', category: 'crud' },
  { id: 'payments.discount_rule.updated', label: 'Discount rule updated', entity: 'discount_rule', category: 'crud' },
  { id: 'payments.discount_rule.deleted', label: 'Discount rule deleted', entity: 'discount_rule', category: 'crud' },
  { id: 'payments.settings.updated', label: 'Payment settings updated', entity: 'settings', category: 'crud' },
  { id: 'payments.charge.created', label: 'Charges created', entity: 'charge', category: 'custom' },
  { id: 'payments.charge.cancelled', label: 'Charges cancelled', entity: 'charge', category: 'custom' },
  { id: 'payments.payment.recorded', label: 'Payment recorded', entity: 'payment', category: 'custom' },
  { id: 'payments.payment.reversed', label: 'Payment reversed', entity: 'payment', category: 'custom' },
  { id: 'payments.payment.refunded', label: 'Online payment refunded', entity: 'payment', category: 'custom' },
  { id: 'payments.checkout.created', label: 'Online payment started', entity: 'checkout', category: 'custom' },
  { id: 'payments.checkout.completed', label: 'Online payment received', entity: 'checkout', category: 'custom' },
  {
    id: 'payments.order_campaign.created',
    label: 'Order campaign created',
    entity: 'order_campaign',
    category: 'crud',
  },
  {
    id: 'payments.order_campaign.updated',
    label: 'Order campaign updated',
    entity: 'order_campaign',
    category: 'crud',
  },
  {
    id: 'payments.order_campaign.status_changed',
    label: 'Order campaign stage changed',
    entity: 'order_campaign',
    category: 'custom',
  },
  { id: 'payments.bank_import.completed', label: 'Bank statement imported', entity: 'bank_import', category: 'custom' },
  {
    id: 'payments.bank_transaction.decided',
    label: 'Statement transfer decided',
    entity: 'bank_transaction',
    category: 'custom',
  },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'payments', events })

/** Type-safe emitter for `payments` events. */
export const emitPaymentsEvent = eventsConfig.emit

export type PaymentsEventId = (typeof events)[number]['id']

export default eventsConfig
