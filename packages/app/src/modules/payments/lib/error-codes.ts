// Error codes owned by `payments` (engineering standards S6.7; payments spec *API, Command, and Error Contracts* →
// `/api/payments/fees`, `/discount-rules`, `/charges/generate`, `/settings`; issue #108; the charge payments,
// cancellation and reversal of issue #109; "Accept cash" of issue #114). Thrown through
// `api/errors.ts`. An inverted validity answers the foundation's `validity_inverted`; a stale lock token the
// platform's `optimistic_lock_conflict`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'fee_target_invalid', status: 422, messageKey: 'payments.errors.fee_target_invalid' },
  { code: 'fee_target_unknown', status: 422, messageKey: 'payments.errors.fee_target_unknown' },
  { code: 'fee_period_locked', status: 422, messageKey: 'payments.errors.fee_period_locked' },
  { code: 'discount_value_invalid', status: 422, messageKey: 'payments.errors.discount_value_invalid' },
  { code: 'discount_conditions_invalid', status: 422, messageKey: 'payments.errors.discount_conditions_invalid' },
  { code: 'period_out_of_range', status: 422, messageKey: 'payments.errors.period_out_of_range' },
  { code: 'charge_amount_over_limit', status: 422, messageKey: 'payments.errors.charge_amount_over_limit' },
  { code: 'generation_in_progress', status: 409, messageKey: 'payments.errors.generation_in_progress' },
  { code: 'generation_already_undone', status: 409, messageKey: 'payments.errors.generation_already_undone' },
  { code: 'charge_not_payable', status: 409, messageKey: 'payments.errors.charge_not_payable' },
  { code: 'payment_exceeds_remaining', status: 422, messageKey: 'payments.errors.payment_exceeds_remaining' },
  { code: 'payment_date_in_future', status: 422, messageKey: 'payments.errors.payment_date_in_future' },
  { code: 'charge_has_payments', status: 409, messageKey: 'payments.errors.charge_has_payments' },
  { code: 'charge_not_cancellable', status: 409, messageKey: 'payments.errors.charge_not_cancellable' },
  { code: 'payment_not_reversible', status: 409, messageKey: 'payments.errors.payment_not_reversible' },
  { code: 'payment_already_reversed', status: 409, messageKey: 'payments.errors.payment_already_reversed' },
  // "Accept cash" (#114).
  { code: 'charge_already_paid', status: 409, messageKey: 'payments.errors.charge_already_paid' },
  { code: 'cash_exceeds_selected', status: 422, messageKey: 'payments.errors.cash_exceeds_selected' },
  { code: 'cash_charges_invalid', status: 422, messageKey: 'payments.errors.cash_charges_invalid' },
] as const satisfies ErrorCodeTable

export type PaymentsErrorCode = (typeof errorCodes)[number]['code']
