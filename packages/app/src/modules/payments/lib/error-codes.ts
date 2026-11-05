// Error codes owned by `payments` (engineering standards S6.7; payments spec *API, Command, and Error Contracts* →
// `/api/payments/fees`, `/discount-rules`, `/charges/generate`, `/settings`; issue #108). Thrown through
// `api/errors.ts`. An inverted validity answers the foundation's `validity_inverted`; a stale lock token the
// platform's `optimistic_lock_conflict`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'fee_target_invalid', status: 422, messageKey: 'payments.errors.fee_target_invalid' },
  { code: 'fee_target_unknown', status: 422, messageKey: 'payments.errors.fee_target_unknown' },
  { code: 'discount_value_invalid', status: 422, messageKey: 'payments.errors.discount_value_invalid' },
  { code: 'discount_conditions_invalid', status: 422, messageKey: 'payments.errors.discount_conditions_invalid' },
  { code: 'period_out_of_range', status: 422, messageKey: 'payments.errors.period_out_of_range' },
  { code: 'generation_in_progress', status: 409, messageKey: 'payments.errors.generation_in_progress' },
  { code: 'generation_already_undone', status: 409, messageKey: 'payments.errors.generation_already_undone' },
] as const satisfies ErrorCodeTable

export type PaymentsErrorCode = (typeof errorCodes)[number]['code']
