// Client pieces of the `/club` member pages (club spec UI table; #27): the member profile as `GET /api/people/me`
// returns it, its query and the locale-aware formatting of calendar dates and consent instants (DD-34: the resolved
// locale, the club's time zone). Authorization stays on the routes.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export const MEMBER_PROFILE_API = '/api/people/me'
export const MEMBER_PROFILE_QUERY_KEY = ['people-me'] as const
/** The member paths come from the one navigation definition of `@vereino/ui` (E06-S19 #101). */
export { BACKEND_HREF, CLUB_HOME_HREF, CLUB_PROFILE_HREF } from '@vereino/ui'
/** The member's own change-password page in the member app (README M-10; #876, no longer the panel's page). */
export { MEMBER_PASSWORD_HREF as CHANGE_PASSWORD_HREF } from '../../lib/member-rules'
/** The member's request to leave the club (people life-cycle spec REQ-L03, #306). */
export const CLUB_LEAVE_HREF = '/club/profile/leave'

export type SelfConsent = { granted: boolean; at: string | null }
export type WardConsentKind = 'regulations' | 'image' | 'trips'
export const WARD_CONSENT_KINDS: readonly WardConsentKind[] = ['regulations', 'image', 'trips']
/** A guardianship consent; `byName` names its last author from the family, `byRole` labels anyone else (#104, #191). */
export type WardConsent = {
  granted: boolean
  at: string | null
  byPersonId: string | null
  byName: string | null
  byRole: 'club_admin' | 'coordinator' | 'coach' | 'staff' | null
}
/** The `medical` consent (#682) rides along with the three; only the medical certificate block shows it. */
export type WardConsents = Record<WardConsentKind, WardConsent> & { medical?: WardConsent }

/** The sports medical certificate block (M-O4, #682) as `GET /api/people/me` returns it. */
export type MemberMedical = {
  validUntil: string | null
  status: 'red' | 'orange' | 'green'
  state: 'missing' | 'unknown' | 'expired' | 'expiring' | 'valid'
  consentInForce: boolean
  /** The person's lock token for `PUT /api/people/persons/{id}/medical`. */
  updatedAt: string | null
}

/** `PUT` the date (or null) of a person's medical certificate (#682). */
export function medicalApi(personId: string): string {
  return `/api/people/persons/${encodeURIComponent(personId)}/medical`
}

export type MemberPerson = {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  email: string | null
  phone: string | null
  preferredLocale: string | null
  consents: {
    shareContactWithCoaches: SelfConsent
    sharePresenceWithGuardians: SelfConsent
    publishNameConsent: SelfConsent
  }
  updatedAt: string | null
}

export type MemberWard = {
  personId: string
  firstName: string
  lastName: string
  birthDate: string | null
  /** Completed years on the club day (E06-S22 #104). */
  age: number | null
  hasAccount: boolean
  guardianship: {
    id: string
    relation: string
    isPrimaryPayer: boolean
    validFrom: string
    validTo: string | null
    consents: WardConsents
    updatedAt: string | null
  }
  /** The ward card's life-cycle lines (#310); absent from an older response. */
  notices?: WardNotice[]
  /** The ward's medical certificate block (#682); absent from an older response. */
  medical?: MemberMedical
}

/** A ward card line (people life-cycle spec M-10, #310). */
export type WardNotice = { kind: 'may_have_account' } | { kind: 'turns_18'; on: string }

/** The member's own card before (`turns_18`) and after (`came_of_age`) the 18th birthday (#310). */
export type OwnNotice = { kind: 'turns_18' | 'came_of_age'; on: string }

/** One of the member's own guardians with the consents they gave (E06-S22 #104). */
export type MemberGuardian = {
  guardianshipId: string
  firstName: string
  lastName: string
  relation: string
  consents: WardConsents
}

export type MemberProfile = {
  person: MemberPerson
  wards: MemberWard[]
  guardians: MemberGuardian[]
  roles: { role: string; sectionId: string | null }[]
  contexts: string[]
  locale: string
  club: {
    shortName: string | null
    name: string | null
    defaultLocale: string
    timezone: string
    logoUrl: string | null
    /** The club's colour and the text colour on it (#486); null uses the default. */
    accent: { color: string; foreground: '#000000' | '#ffffff' } | null
  }
  paymentsVisible: boolean
  /** An active participant membership today: with the wards, the member side of the acting context (spec N). */
  isParticipant?: boolean
  /** An adult's own consents (people life-cycle spec REQ-L10, #309); null for a minor. */
  ownConsents?: WardConsents | null
  /** The club's own consent texts by key with the instant of their last change (DD-L11). */
  consentTexts?: ConsentTexts
  /** The member's own life-cycle card (#310); null or absent when there is none. */
  notice?: OwnNotice | null
  /** The adult member's own medical certificate block (#682); null for a minor. */
  medical?: MemberMedical | null
}

/** The keys of the club's consent texts (`club_core` `CONSENT_TEXT_KEYS`). */
export type ConsentTextKey =
  | 'regulations'
  | 'image'
  | 'trips'
  | 'medical'
  | 'share_contact_with_coaches'
  | 'share_presence_with_guardians'
  | 'publish_name_consent'
export type ConsentTexts = Partial<Record<ConsentTextKey, { text: string; changedAt: string }>>

/** The own consents of an adult participant on `PUT /api/people/me/consents` (#309). */
export const OWN_CONSENTS_API = '/api/people/me/consents'

export type MemberProfileLoad = { status: 'ok'; profile: MemberProfile } | { status: 'not_linked' }

class MemberProfileLoadError extends Error {}

export function useMemberProfile() {
  return useQuery({
    queryKey: MEMBER_PROFILE_QUERY_KEY,
    queryFn: async (): Promise<MemberProfileLoad> => {
      const call = await apiCall<MemberProfile & { code?: string }>(MEMBER_PROFILE_API)
      if (call.status === 404) return { status: 'not_linked' }
      if (!call.ok || !call.result) throw new MemberProfileLoadError(String(call.status))
      return { status: 'ok', profile: call.result }
    },
  })
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim()
}

/** A calendar date (`YYYY-MM-DD`) in the reader's locale, without a time-zone shift. */
export function formatCalendarDate(value: string | null, locale: string): string | null {
  if (!value) return null
  const date = new Date(`${value}T12:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

/** An instant in the reader's locale and the club's time zone. */
export function formatInstant(value: string | null, locale: string, timeZone: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(date)
}
