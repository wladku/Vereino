// Error codes owned by `communication` (engineering standards S6.7; foundation III *API, Command, and Error Contracts*).
// Thrown through `api/errors.ts`. Scope refusals answer the foundation's `scope_denied`, audiences its
// `audience_kind_unavailable` / `audience_too_large`, a stale lock token the platform's `optimistic_lock_conflict`. The
// case codes (`case_immutable`, `case_already_open`) arrive with the cases of phase C (#36).
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'message_deleted', status: 409, messageKey: 'communication.errors.message_deleted' },
  { code: 'message_not_editable', status: 409, messageKey: 'communication.errors.message_not_editable' },
  { code: 'share_text_unavailable', status: 404, messageKey: 'communication.errors.share_text_unavailable' },
] as const satisfies ErrorCodeTable

export type CommunicationErrorCode = (typeof errorCodes)[number]['code']
