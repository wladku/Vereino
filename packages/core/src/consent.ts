// P-08 ConsentRecord: a `<consent>_at` timestamp column (club spec `people_persons`). Set = granted at that
// instant, null = never granted or withdrawn. The row is never deleted; the grant and withdrawal dates
// survive in the command's audit log entry (listmonk pattern).

export type ConsentState = {
  readonly grantedAt: Date | null
}

/** Result of a transition: the new state, whether it changed and when (`now`, or null when unchanged). */
export type ConsentTransition = {
  readonly state: ConsentState
  readonly changed: boolean
  readonly at: Date | null
}

export function isConsentGranted(state: ConsentState): boolean {
  return state.grantedAt !== null
}

/** Grants the consent at `now`; granting a consent that is already granted keeps its original date. */
export function grantConsent(state: ConsentState, now: Date): ConsentTransition {
  if (state.grantedAt !== null) return { state, changed: false, at: null }
  return { state: { grantedAt: now }, changed: true, at: now }
}

/** Withdraws the consent at `now`; withdrawing a consent that is not granted is a no-op. */
export function withdrawConsent(state: ConsentState, now: Date): ConsentTransition {
  if (state.grantedAt === null) return { state, changed: false, at: null }
  return { state: { grantedAt: null }, changed: true, at: now }
}
