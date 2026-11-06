// Error codes owned by `communication` (engineering standards S6.7; foundation III *API, Command, and Error Contracts*).
// Thrown through `api/errors.ts`. Scope refusals answer the foundation's `scope_denied`, audiences its
// `audience_kind_unavailable` / `audience_too_large`, a stale lock token the platform's `optimistic_lock_conflict`.
// `case_immutable` (the club spec's, AC-010) refuses an edit or a deletion of a case's message, `case_already_open`
// a second marking of a case (foundation III DD-M11; #36). `direct_no_recipients` refuses a member's direct thread
// to a group or section without staff today, `direct_thread_limit` the 21st in 24 hours (DD-M18; #138).
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'message_deleted', status: 409, messageKey: 'communication.errors.message_deleted' },
  { code: 'message_not_editable', status: 409, messageKey: 'communication.errors.message_not_editable' },
  { code: 'share_text_unavailable', status: 404, messageKey: 'communication.errors.share_text_unavailable' },
  { code: 'case_immutable', status: 409, messageKey: 'communication.errors.case_immutable' },
  { code: 'case_already_open', status: 409, messageKey: 'communication.errors.case_already_open' },
  { code: 'direct_no_recipients', status: 422, messageKey: 'communication.errors.direct_no_recipients' },
  { code: 'direct_thread_limit', status: 429, messageKey: 'communication.errors.direct_thread_limit' },
] as const satisfies ErrorCodeTable

export type CommunicationErrorCode = (typeof errorCodes)[number]['code']
