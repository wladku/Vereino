// Pure rules of the member side of `people` (club spec phase 1 steps 4, 4a and 5; #27): the two consents a guardian
// gives in their own profile (P-08 transitions), the R10 gate on a person's own payments, the request locale of a
// signed-in member (DD-34), the acting contexts of the role-context switcher and where a sign-in lands. Time and the
// served locales are parameters (engineering standards S3.5, S4.9).
import {
  grantConsent,
  isAdultOn,
  withdrawConsent,
  type ActingRole,
  type CalendarDate,
  type GrantKind,
  type Scope,
} from '@vereino/core'

/** The consents a member gives in their own profile (`GET/PUT /api/people/me`, club spec `people_persons`). */
export const SELF_CONSENT_KINDS = ['shareContactWithCoaches', 'sharePresenceWithGuardians'] as const
export type SelfConsentKind = (typeof SELF_CONSENT_KINDS)[number]

/** A self consent as the API returns it: granted with the instant it was given, or not granted. */
export type SelfConsentView = { readonly granted: boolean; readonly at: string | null }

/** The view of a `<consent>_at` column: set = granted at that instant; null or unreadable = not granted. */
export function selfConsentView(at: Date | string | null | undefined): SelfConsentView {
  if (at === null || at === undefined) return { granted: false, at: null }
  const date = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(date.getTime())) return { granted: false, at: null }
  return { granted: true, at: date.toISOString() }
}

/**
 * The requested state of one self consent at `now` (P-08): `true` grants (a granted consent keeps its first date),
 * `false` withdraws (null), `undefined` keeps the current value.
 */
export function applySelfConsent(
  current: Date | null,
  desired: boolean | undefined,
  now: Date,
): { at: Date | null; changed: boolean } {
  if (desired === undefined) return { at: current, changed: false }
  const state = { grantedAt: current }
  const transition = desired ? grantConsent(state, now) : withdrawConsent(state, now)
  return { at: transition.state.grantedAt, changed: transition.changed }
}

/** Why a caller may or may not see their own payments (R10). */
export type OwnPaymentsAccess = 'allowed' | 'no_person' | 'minor' | 'no_feature'

export type OwnPaymentsInput = {
  /** The user is linked to a person of the organization. */
  readonly hasPerson: boolean
  /** The user holds `payments.view_own` (the `vereino_payer` role). */
  readonly hasFeature: boolean
  readonly birthDate: CalendarDate | null
}

/**
 * The R10 gate on the caller's own payments (club spec *Account payer*, REQ-002): only an adult person may see them.
 * The age is checked before the feature, so a minor is refused even with a manually granted `payments.view_own`; a
 * person without a date of birth counts as a minor (fail closed).
 */
export function ownPaymentsAccess(input: OwnPaymentsInput, today: CalendarDate): OwnPaymentsAccess {
  if (!input.hasPerson) return 'no_person'
  if (!input.birthDate || !isAdultOn(input.birthDate, today)) return 'minor'
  if (!input.hasFeature) return 'no_feature'
  return 'allowed'
}

/**
 * The locale of a signed-in member (DD-34): the first candidate the app serves — the person's `preferred_locale`,
 * then the club's `default_locale`, then the locale the request resolved (cookie or `Accept-Language`) — else
 * `fallback` (`en`).
 */
export function memberLocale(
  candidates: readonly (string | null | undefined)[],
  supported: readonly string[],
  fallback: string,
): string {
  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim().toLowerCase() : ''
    if (normalized && supported.includes(normalized)) return normalized
  }
  return fallback
}

/** The acting contexts the role-context switcher offers, in a fixed order (REQ-001). */
const CONTEXT_ORDER: readonly (GrantKind & ActingRole)[] = ['self', 'guardian', 'coach', 'coordinator', 'club_admin']

/** The acting contexts of a scope: the provider grant kinds it holds, `self` first. */
export function memberContexts(scope: Scope): ActingRole[] {
  const kinds = new Set<GrantKind>(scope.map((grant) => grant.kind))
  return CONTEXT_ORDER.filter((kind) => kinds.has(kind))
}

/** The member interface and the admin panel entry (club spec *UI architecture* → redirect after sign-in). */
export const MEMBER_HOME = '/club'
export const BACKEND_HOME = '/backend'

export type LandingInput = {
  /** The redirect the sign-in answered with; only the platform default (`/backend`) is changed. */
  readonly redirect: unknown
  /** The user is linked to a person of their organization. */
  readonly linked: boolean
  /** The user holds `people.self`. */
  readonly selfFeature: boolean
}

/**
 * Where a sign-in lands (club spec *UI architecture*): a user linked to a person with `people.self` goes to `/club`;
 * a user linked to no person stays on `/backend` with a notice and never reaches anyone's data. An explicit redirect
 * the user asked for is kept. Null keeps the platform's answer.
 */
export function memberLanding(input: LandingInput): { redirect: string; notice: boolean } | null {
  if (input.redirect !== BACKEND_HOME) return null
  if (!input.linked) return { redirect: BACKEND_HOME, notice: true }
  if (input.selfFeature) return { redirect: MEMBER_HOME, notice: false }
  return null
}

/** `path` with the platform's same-origin flash parameters (`flash`, `type=info`). */
export function withNotice(path: string, message: string): string {
  return `${path}?${new URLSearchParams({ flash: message, type: 'info' }).toString()}`
}
