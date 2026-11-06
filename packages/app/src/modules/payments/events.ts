import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Events of `payments` (payments spec API table: `payments.fee.*`, `payments.charge.created` batched); payloads carry
 * ids only (S4.6). A generation emits one `payments.charge.created` with the generation id and its charge ids; its
 * undo emits one `payments.charge.cancelled` with the cancelled ids, and so does a single cancellation (#109). A
 * recorded payment emits `payments.payment.recorded`, a reversing entry `payments.payment.reversed`.
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
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'payments', events })

/** Type-safe emitter for `payments` events. */
export const emitPaymentsEvent = eventsConfig.emit

export type PaymentsEventId = (typeof events)[number]['id']

export default eventsConfig
