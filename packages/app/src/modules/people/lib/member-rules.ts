// Pure rules of the member side of `people` (club spec phase 1 steps 4, 4a and 5; #27): the two consents a guardian
// gives in their own profile (P-08 transitions), the R10 gate on a person's own payments, the request locale of a
// signed-in member (DD-34), the acting contexts of the role-context switcher, where a sign-in lands and the authors of
// the guardianship consents a member page names (E06-S22 #104). Time and the served locales are parameters
// (engineering standards S3.5, S4.9).
import {
  grantConsent,
  isAdultOn,
  withdrawConsent,
  type ActingRole,
  type AssignableRole,
  type CalendarDate,
  type GrantKind,
  type Scope,
} from '@vereino/core'
import { CONSENT_KINDS, type ConsentKind, type ConsentView, type ConsentsView } from './people-rules'

/**
 * The consents a member gives in their own profile (`GET/PUT /api/people/me`, club spec `people_persons`): the
 * guardian's two (REQ-006, REQ-037) and the instructor's consent to publish their name (DD-29, #91).
 */
export const SELF_CONSENT_KINDS = [
  'shareContactWithCoaches',
  'sharePresenceWithGuardians',
  'publishNameConsent',
] as const
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

/**
 * An instructor's name as the club's public pages show it with their consent (DD-29, #91): the first name and the
 * initial of the last name ("Anna K."), whitespace collapsed. The full last name never leaves `people`; a blank first
 * name gives null (the page then says "Section coach").
 */
export function publicPersonName(firstName: string, lastName: string): string | null {
  const first = firstName.trim().replace(/\s+/g, ' ')
  if (!first) return null
  const initial = Array.from(lastName.trim())[0]
  return initial ? `${first} ${initial.toLocaleUpperCase()}.` : first
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

/**
 * Who an author outside the family is shown as (#191, README M-10): the most senior staff role they hold, or `staff`
 * when they hold none any more.
 */
export type ConsentAuthorRole = AssignableRole | 'staff'

const AUTHOR_ROLE_ORDER: readonly AssignableRole[] = ['club_admin', 'coordinator', 'coach']

/** The label role of a consent author from the roles they hold; none → `staff`. */
export function consentAuthorRole(roles: readonly AssignableRole[]): ConsentAuthorRole {
  return AUTHOR_ROLE_ORDER.find((role) => roles.includes(role)) ?? 'staff'
}

/**
 * A guardianship consent as the member pages show it (E06-S22 #104): the view plus its last author — by name when the
 * author is family (the ward or a guardian of the ward), else by role only, so a ward never sees a staff member's
 * name (#191).
 */
export type MemberConsentView = ConsentView & {
  readonly byName: string | null
  readonly byRole: ConsentAuthorRole | null
}
export type MemberConsentsView = { readonly [kind in ConsentKind]: MemberConsentView }

/** The distinct persons who last changed any of the consents, in first-seen order. */
export function consentAuthorIds(views: readonly ConsentsView[]): string[] {
  const ids = new Set<string>()
  for (const view of views) {
    for (const kind of CONSENT_KINDS) {
      const author = view[kind].byPersonId
      if (author) ids.add(author)
    }
  }
  return [...ids]
}

/** What the reader knows about the authors of one guardianship's consents. */
export type ConsentAuthors = {
  /** The ward and every guardian of the ward: shown by name. */
  readonly family: ReadonlySet<string>
  /** Names of the family authors; an author the reader cannot resolve (e.g. deleted) has no name. */
  readonly names: ReadonlyMap<string, string>
  /** Label roles of the authors outside the family; a missing one is `staff`. */
  readonly roles: ReadonlyMap<string, ConsentAuthorRole>
}

/** The consents with each author as the member pages may show them: a family name or a staff role label. */
export function withConsentAuthors(view: ConsentsView, authors: ConsentAuthors): MemberConsentsView {
  const entry = (kind: ConsentKind): MemberConsentView => {
    const consent = view[kind]
    const author = consent.byPersonId
    if (!author) return { ...consent, byName: null, byRole: null }
    if (authors.family.has(author)) return { ...consent, byName: authors.names.get(author) ?? null, byRole: null }
    return { ...consent, byName: null, byRole: authors.roles.get(author) ?? 'staff' }
  }
  return { regulations: entry('regulations'), image: entry('image'), trips: entry('trips') }
}
