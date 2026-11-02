// Pure rules of the cases of `communication` (foundation III REQ-M09, DD-M10, DD-M11; club spec REQ-010, glossary
// *Case*, AC-010): who may mark a thread as a case, and why an edit or a deletion of a message is refused. A case is a
// one-way flag on the thread: there is no unmark, its messages can no longer be edited or deleted, and its history
// (every message, revision and tombstone row) stays. The commands and the read model apply these rules.
import type { GrantKind } from '@vereino/core'

/**
 * The grant kinds that may mark a thread as a case, least-privileged first: the coordinator of the thread's section
 * and the club administrator. The route also requires the feature `communication.cases.manage`.
 */
export const CASE_MANAGE_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']

/**
 * Whether a reader is offered "Mark as case": the thread is not a case yet, the reader holds a staff grant on it (the
 * section's coordinator or the administrator, `staffRole`) and the feature `communication.cases.manage`.
 */
export function mayMarkCase(input: { isCase: boolean; staffRole: string | null; hasCaseFeature: boolean }): boolean {
  return !input.isCase && input.staffRole !== null && input.hasCaseFeature
}

/** Why an edit or a deletion of a message is refused (each a 409 code of `lib/error-codes.ts`). */
export type MessageChangeRefusal = 'case_immutable' | 'message_not_editable' | 'message_deleted'

/**
 * The refusal of an edit or a deletion of a message by someone allowed to change it, or null when it may change. A
 * case refuses every change first — for the author, the coordinator and the administrator alike (409
 * `case_immutable`); then a system message (`message_not_editable`) and an already deleted message
 * (`message_deleted`).
 */
export function messageChangeRefusal(input: {
  threadIsCase: boolean
  system: boolean
  deleted: boolean
}): MessageChangeRefusal | null {
  if (input.threadIsCase) return 'case_immutable'
  if (input.system) return 'message_not_editable'
  if (input.deleted) return 'message_deleted'
  return null
}
