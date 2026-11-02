// Error codes owned by `communication` (engineering standards S6.7; foundation III *API, Command, and Error Contracts*).
// Thrown through `api/errors.ts`. Scope refusals answer the foundation's `scope_denied`, audiences its
// `audience_kind_unavailable` / `audience_too_large`, a stale lock token the platform's `optimistic_lock_conflict`.
// `case_immutable` (the club spec's, AC-010) refuses an edit or a deletion of a case's message, `case_already_open`
// a second marking of a case (foundation III DD-M11; #36).
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'message_deleted', status: 409, messageKey: 'communication.errors.message_deleted' },
  { code: 'message_not_editable', status: 409, messageKey: 'communication.errors.message_not_editable' },
  { code: 'share_text_unavailable', status: 404, messageKey: 'communication.errors.share_text_unavailable' },
  { code: 'case_immutable', status: 409, messageKey: 'communication.errors.case_immutable' },
  { code: 'case_already_open', status: 409, messageKey: 'communication.errors.case_already_open' },
] as const satisfies ErrorCodeTable

export type CommunicationErrorCode = (typeof errorCodes)[number]['code']
