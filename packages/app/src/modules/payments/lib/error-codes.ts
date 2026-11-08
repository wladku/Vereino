// Error codes owned by `payments` (engineering standards S6.7; payments spec *API, Command, and Error Contracts* →
// `/api/payments/fees`, `/discount-rules`, `/charges/generate`, `/settings`; issue #108; the charge payments,
// cancellation and reversal of issue #109; "Accept cash" of issue #114; the order campaigns of issue #115; the guardian orders and personal links of issue #116). Thrown through
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
  { code: 'checkout_charge_forbidden', status: 403, messageKey: 'payments.errors.checkout_charge_forbidden' },
  { code: 'payer_missing', status: 422, messageKey: 'payments.errors.payer_missing' },
  { code: 'charge_not_open', status: 409, messageKey: 'payments.errors.charge_not_open' },
  { code: 'gateway_unavailable', status: 502, messageKey: 'payments.errors.gateway_unavailable' },
  { code: 'payment_not_refundable', status: 409, messageKey: 'payments.errors.payment_not_refundable' },
  { code: 'refund_exceeds_remaining', status: 422, messageKey: 'payments.errors.refund_exceeds_remaining' },
  // "Accept cash" (#114).
  { code: 'charge_already_paid', status: 409, messageKey: 'payments.errors.charge_already_paid' },
  { code: 'cash_exceeds_selected', status: 422, messageKey: 'payments.errors.cash_exceeds_selected' },
  { code: 'cash_charges_invalid', status: 422, messageKey: 'payments.errors.cash_charges_invalid' },
  // Order campaigns (#115).
  { code: 'order_closes_on_past', status: 422, messageKey: 'payments.errors.order_closes_on_past' },
  { code: 'order_payment_due_before_close', status: 422, messageKey: 'payments.errors.order_payment_due_before_close' },
  { code: 'order_section_unknown', status: 422, messageKey: 'payments.errors.order_section_unknown' },
  { code: 'order_groups_invalid', status: 422, messageKey: 'payments.errors.order_groups_invalid' },
  { code: 'order_set_too_many', status: 422, messageKey: 'payments.errors.order_set_too_many' },
  { code: 'order_set_too_small', status: 422, messageKey: 'payments.errors.order_set_too_small' },
  { code: 'order_set_component_invalid', status: 422, messageKey: 'payments.errors.order_set_component_invalid' },
  { code: 'order_adult_price_missing', status: 422, messageKey: 'payments.errors.order_adult_price_missing' },
  { code: 'order_campaign_not_editable', status: 409, messageKey: 'payments.errors.order_campaign_not_editable' },
  { code: 'order_product_in_use', status: 409, messageKey: 'payments.errors.order_product_in_use' },
  {
    code: 'order_campaign_transition_invalid',
    status: 409,
    messageKey: 'payments.errors.order_campaign_transition_invalid',
  },
  { code: 'order_campaign_not_collecting', status: 409, messageKey: 'payments.errors.order_campaign_not_collecting' },
  // Guardian orders and personal order links (#116).
  { code: 'order_campaign_not_found', status: 404, messageKey: 'payments.errors.order_campaign_not_found' },
  { code: 'campaign_closed', status: 409, messageKey: 'payments.errors.campaign_closed' },
  { code: 'order_child_not_in_campaign', status: 403, messageKey: 'payments.errors.order_child_not_in_campaign' },
  { code: 'order_exists', status: 409, messageKey: 'payments.errors.order_exists' },
  { code: 'order_not_found', status: 404, messageKey: 'payments.errors.order_not_found' },
  { code: 'order_answer_missing', status: 422, messageKey: 'payments.errors.order_answer_missing' },
  { code: 'order_answer_invalid', status: 422, messageKey: 'payments.errors.order_answer_invalid' },
  { code: 'order_set_size_missing', status: 422, messageKey: 'payments.errors.order_set_size_missing' },
  { code: 'order_empty', status: 422, messageKey: 'payments.errors.order_empty' },
  { code: 'order_print_number_taken', status: 422, messageKey: 'payments.errors.order_print_number_taken' },
  { code: 'order_below_paid', status: 409, messageKey: 'payments.errors.order_below_paid' },
  { code: 'order_cancel_paid', status: 409, messageKey: 'payments.errors.order_cancel_paid' },
  { code: 'order_link_not_found', status: 404, messageKey: 'payments.errors.order_link_not_found' },
  { code: 'order_campaign_completed', status: 410, messageKey: 'payments.errors.order_campaign_completed' },
] as const satisfies ErrorCodeTable

export type PaymentsErrorCode = (typeof errorCodes)[number]['code']
