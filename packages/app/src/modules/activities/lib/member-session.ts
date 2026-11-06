// The session page `/club/occurrences/[id]` (README M-04; club spec REQ-007; E06-S15 #97) reads one session in up to
// two perspectives: the member's (their own or their wards' declarations) and — for a person who coaches — the coach's
// ("Running the session"). A coach who is also a guardian gets both on their ward's session. Pure: the page passes the
// requested `?as=`, the profile facts and the state of each read.

export type MemberSessionPerspective = 'self' | 'guardian'

export type SessionPerspectives = { member: MemberSessionPerspective; coach: boolean }

/**
 * The reads the page makes: the member perspective (`guardian` when asked for, or by default for a guardian; `self`
 * otherwise) and the coach's whenever the person coaches, whatever `?as=` names.
 */
export function sessionPerspectives(
  requested: string | null,
  profile: { hasWards: boolean; coaches: boolean },
): SessionPerspectives {
  const member: MemberSessionPerspective =
    requested === 'guardian' || (requested !== 'self' && profile.hasWards) ? 'guardian' : 'self'
  return { member, coach: profile.coaches }
}

/** The state of one read: `off` when the page does not make it. */
export type SessionReadState = 'off' | 'loading' | 'error' | 'ok' | 'not_found' | 'forbidden'

export type SessionPageView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  | { kind: 'not_yours' }
  | { kind: 'show'; member: boolean; coach: boolean }

/**
 * What the page shows: the session when either read found it (with the blocks of each perspective that did); while
 * a read is still running, loading; a failed read, the error with retry; a coach's refusal, "This is not your
 * session" with none of its data (the J-002 defect); otherwise "not in your calendar".
 */
export function sessionPageView(member: SessionReadState, coach: SessionReadState): SessionPageView {
  if (member === 'ok' || coach === 'ok') return { kind: 'show', member: member === 'ok', coach: coach === 'ok' }
  if (member === 'loading' || coach === 'loading') return { kind: 'loading' }
  if (member === 'error' || coach === 'error') return { kind: 'error' }
  return coach === 'forbidden' ? { kind: 'not_yours' } : { kind: 'not_found' }
}
