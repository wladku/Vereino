// Client pieces of the `/club` member pages (club spec UI table; #27): the member profile as `GET /api/people/me`
// returns it, its query and the locale-aware formatting of calendar dates and consent instants (DD-34: the resolved
// locale, the club's time zone). Authorization stays on the routes.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export const MEMBER_PROFILE_API = '/api/people/me'
export const MEMBER_PROFILE_QUERY_KEY = ['people-me'] as const
/** The member paths come from the one navigation definition of `@vereino/ui` (E06-S19 #101). */
export { BACKEND_HREF, CLUB_HOME_HREF, CLUB_PROFILE_HREF } from '@vereino/ui'

export type SelfConsent = { granted: boolean; at: string | null }
export type WardConsentKind = 'regulations' | 'image' | 'trips'
export const WARD_CONSENT_KINDS: readonly WardConsentKind[] = ['regulations', 'image', 'trips']
export type WardConsent = { granted: boolean; at: string | null; byPersonId: string | null }

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
  hasAccount: boolean
  guardianship: {
    id: string
    relation: string
    isPrimaryPayer: boolean
    validFrom: string
    validTo: string | null
    consents: Record<WardConsentKind, WardConsent>
    updatedAt: string | null
  }
}

export type MemberProfile = {
  person: MemberPerson
  wards: MemberWard[]
  roles: { role: string; sectionId: string | null }[]
  contexts: string[]
  locale: string
  club: { shortName: string | null; defaultLocale: string; timezone: string; logoUrl: string | null }
  paymentsVisible: boolean
}

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
