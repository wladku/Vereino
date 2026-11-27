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
  // Accepting (BR-J4, BR-J6, DD-J10, DD-J10a, DD-J11; phase 3, #800).
  { code: 'group_full', status: 409, messageKey: 'enrolment.errors.group_full' },
  { code: 'participant_already_in_group', status: 409, messageKey: 'enrolment.errors.participant_already_in_group' },
  { code: 'start_day_invalid', status: 422, messageKey: 'enrolment.errors.start_day_invalid' },
  { code: 'accept_person_invalid', status: 422, messageKey: 'enrolment.errors.accept_person_invalid' },
  {
    code: 'invitation_birth_date_required',
    status: 422,
    messageKey: 'enrolment.errors.invitation_birth_date_required',
  },
  // The group sign-up QR code (#869): an unknown group, or one of another club (D-034).
  { code: 'group_not_found', status: 404, messageKey: 'enrolment.errors.group_not_found' },
] as const satisfies ErrorCodeTable

export type EnrolmentErrorCode = (typeof errorCodes)[number]['code']
