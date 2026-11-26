// Error codes owned by `enrolment` (engineering standards S6.7; sign-up form spec *API, Command, and Error Contracts*,
// *Domain Vocabulary*; #799). Thrown through `api/errors.ts`. A spent or expired link answers the foundation's
// `token_link_used` / `token_link_expired`, a stale lock token the platform's `optimistic_lock_conflict`, an unknown
// application 404 like an application of another section or club (D-034).
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  // The public form: the section takes no applications (or is unknown), the honeypot, the hard limits (BR-J1, BR-J2).
  { code: 'applications_closed', status: 404, messageKey: 'enrolment.errors.applications_closed' },
  { code: 'application_refused', status: 422, messageKey: 'enrolment.errors.application_refused' },
  { code: 'birth_date_future', status: 422, messageKey: 'enrolment.errors.birth_date_future' },
  { code: 'age_out_of_bounds', status: 422, messageKey: 'enrolment.errors.age_out_of_bounds' },
  { code: 'application_group_invalid', status: 422, messageKey: 'enrolment.errors.application_group_invalid' },
  { code: 'application_field_invalid', status: 422, messageKey: 'enrolment.errors.application_field_invalid' },
  // Decisions (State, BR-J5).
  { code: 'application_not_found', status: 404, messageKey: 'enrolment.errors.application_not_found' },
  { code: 'application_state_conflict', status: 409, messageKey: 'enrolment.errors.application_state_conflict' },
  { code: 'decision_reason_required', status: 422, messageKey: 'enrolment.errors.decision_reason_required' },
] as const satisfies ErrorCodeTable

export type EnrolmentErrorCode = (typeof errorCodes)[number]['code']
