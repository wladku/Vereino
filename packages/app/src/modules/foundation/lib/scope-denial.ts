// Which 403 a scope denial answers (#76). The scope provider (`people.scopeService`) returns no grant when no person of
// the club is linked to the user, and a linked person always carries at least `self`; so a session scope that holds
// nothing beyond the foundation's own `self_user` means "not linked to a person of this club" (403 `scope_unlinked`),
// and any other denial means "outside your grants" (403 `scope_denied`). Pure: the rule reads the scope only.
import type { GrantKind, Scope } from '@vereino/core'

export type ScopeDenialCode = 'scope_denied' | 'scope_unlinked'

/** True when the scope holds at least one grant and none other than `self_user`: no linked person of the club. */
export function isUnlinkedScope(scope: Scope): boolean {
  return scope.length > 0 && scope.every((grant) => grant.kind === 'self_user')
}

/** The code a session scope that matches no allowed grant answers. */
export function scopeDenialCode(scope: Scope): ScopeDenialCode {
  return isUnlinkedScope(scope) ? 'scope_unlinked' : 'scope_denied'
}

/**
 * True when the session scope can match none of `kinds` whatever the target: the user is not linked and the command
 * or read does not accept `self_user`. The caller refuses before it looks the target up, so the answer is the same
 * for a record that exists and one that does not.
 */
export function refusesUnlinked(scope: Scope, kinds: readonly GrantKind[]): boolean {
  return isUnlinkedScope(scope) && !kinds.includes('self_user')
}
