// The HTTP side of the coordinator's applications pages (sign-up form spec M-J1, M-J2, M-J3, B-J1; #799): the member
// profile (`GET /api/people/me`, the query key `people`'s pages use), the list by tab, one application, the overdue
// count and the two decisions of phase 2 — reject and waiting list — each sending the `updatedAt` it was read with.
// Authorization stays on the routes and commands; a refused decision comes back as an outcome the page shows (409:
// changed by someone else, 404: gone) instead of a thrown error.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { grantsFeature } from '@vereino/ui'
import type { ApplicationTab } from '../../lib/applications'
import type { ApplicationDetail, ApplicationList, ApplicationListItem } from '../../services/views'

export type { ApplicationDetail, ApplicationList, ApplicationListItem }
export type { ApplicationFlag, ApplicationTab } from '../../lib/applications'

export type Translate = (key: string, params?: Record<string, string | number>) => string

// --- The member profile (the frame) ---

export type ClubProfile = {
  person: { id: string; firstName: string; lastName: string }
  wards: { personId: string; firstName: string; lastName: string }[]
  contexts: string[]
  locale: string
  club: {
    shortName: string | null
    defaultLocale: string
    timezone: string
    logoUrl: string | null
    accent: { color: string; foreground: '#000000' | '#ffffff' } | null
  }
  paymentsVisible: boolean
}

export type ClubProfileLoad = { status: 'ok'; profile: ClubProfile } | { status: 'not_linked' }

/** The query key of `people`'s member pages: the same entry, the same `{ status, profile }` shape. */
export const MEMBER_PROFILE_QUERY_KEY = ['people-me'] as const

export function useClubProfile() {
  return useQuery({
    queryKey: MEMBER_PROFILE_QUERY_KEY,
    queryFn: async (): Promise<ClubProfileLoad> => {
      const call = await apiCall<ClubProfile>('/api/people/me')
      if (call.status === 404) return { status: 'not_linked' }
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return { status: 'ok', profile: call.result }
    },
  })
}

// --- The list ---

export const APPLICATIONS_QUERY_KEY = 'enrolment-applications'
export const APPLICATION_QUERY_KEY = 'enrolment-application'
export const APPLICATIONS_API = '/api/enrolment/applications'

export type ApplicationFilters = {
  tab: ApplicationTab
  sectionId?: string | null
  overdue?: boolean
  q?: string
  page?: number
  pageSize?: number
}

export function applicationsUrl(filters: ApplicationFilters): string {
  const params = new URLSearchParams({ tab: filters.tab })
  if (filters.sectionId) params.set('sectionId', filters.sectionId)
  if (filters.overdue) params.set('overdue', '1')
  const q = filters.q?.trim()
  if (q && filters.tab !== 'closed') params.set('q', q)
  params.set('page', String(filters.page ?? 1))
  params.set('pageSize', String(filters.pageSize ?? 100))
  return `${APPLICATIONS_API}?${params.toString()}`
}

export async function fetchApplications(filters: ApplicationFilters): Promise<ApplicationList> {
  const call = await apiCall<ApplicationList>(applicationsUrl(filters))
  if (!call.ok || !call.result || !Array.isArray(call.result.items)) throw new Error(String(call.status))
  return call.result
}

export function useApplications(filters: ApplicationFilters, extraKey: readonly unknown[] = []) {
  return useQuery({
    queryKey: [APPLICATIONS_QUERY_KEY, filters, ...extraKey],
    queryFn: () => fetchApplications(filters),
  })
}

const VIEW_FEATURE = 'enrolment.applications.view'

/**
 * M-J1: the open `new` applications and how many of them are past the answer time; `null` for a caller without
 * `enrolment.applications.view` (a guardian, a coach). The `/club` Today spot does not enforce a widget's `features`,
 * so the platform feature check runs first and such a caller makes no read of the inbox (#483, lesson
 * `club-spot-widgets-hide-themselves-when-refused`).
 */
export function useApplicationCounts() {
  return useQuery({
    queryKey: [APPLICATIONS_QUERY_KEY, 'counts'],
    retry: 1,
    queryFn: async (): Promise<{ fresh: number; overdue: number } | null> => {
      const check = await apiCall<{ granted?: unknown[] }>('/api/auth/feature-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: [VIEW_FEATURE] }),
      })
      const granted = check.ok && Array.isArray(check.result?.granted) ? check.result.granted.map(String) : []
      if (!grantsFeature(granted, VIEW_FEATURE)) return null
      const [all, late] = await Promise.all([
        fetchApplications({ tab: 'new', pageSize: 1 }),
        fetchApplications({ tab: 'new', overdue: true, pageSize: 1 }),
      ])
      return { fresh: all.total, overdue: late.total }
    },
  })
}

/** REQ-J17: the club's applications past the answer time (the administrator's dashboard). */
export function useOverdueCount(refreshKey: unknown, enabled: boolean) {
  return useQuery({
    queryKey: [APPLICATIONS_QUERY_KEY, 'overdue', refreshKey],
    enabled,
    queryFn: async (): Promise<number> => {
      const call = await apiCall<{ count?: number }>('/api/enrolment/overdue')
      if (!call.ok || typeof call.result?.count !== 'number') throw new Error(String(call.status))
      return call.result.count
    },
  })
}

/** The sections seen in the lists so far, by id (the section filter, M-J2). */
export function mergeSections(
  known: ReadonlyMap<string, string>,
  items: readonly Pick<ApplicationListItem, 'sectionId' | 'sectionName'>[],
): ReadonlyMap<string, string> {
  const missing = items.filter((item) => known.get(item.sectionId) !== item.sectionName)
  if (missing.length === 0) return known
  const next = new Map(known)
  for (const item of missing) next.set(item.sectionId, item.sectionName)
  return next
}

/** The waiting tab grouped by group, in the order the list sorts them (group name, then number). */
export function groupWaiting(
  items: readonly ApplicationListItem[],
): { key: string; groupName: string | null; items: ApplicationListItem[] }[] {
  const groups: { key: string; groupName: string | null; items: ApplicationListItem[] }[] = []
  for (const item of items) {
    const key = item.groupId ?? ''
    const last = groups.at(-1)
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, groupName: item.groupName, items: [item] })
  }
  return groups
}

// --- One application ---

export type ApplicationLoad = { status: 'ok'; application: ApplicationDetail } | { status: 'not_found' }

export async function fetchApplication(id: string): Promise<ApplicationLoad> {
  const call = await apiCall<ApplicationDetail>(`${APPLICATIONS_API}/${encodeURIComponent(id)}`)
  if (call.status === 404) return { status: 'not_found' }
  if (!call.ok || !call.result) throw new Error(String(call.status))
  return { status: 'ok', application: call.result }
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: [APPLICATION_QUERY_KEY, id],
    queryFn: () => fetchApplication(id),
  })
}

// --- The decisions (phase 2: reject and waiting list) ---

export type DecisionOutcome =
  | { status: 'ok'; state: string; updatedAt: string; waitingNumber: number | null }
  | { status: 'conflict' }
  | { status: 'not_found' }
  | { status: 'invalid'; code: string | null }
  | { status: 'error' }

type DecisionAnswer = {
  ok?: boolean
  state?: string
  updatedAt?: string
  waitingNumber?: number | null
  code?: string
}

async function decide(
  id: string,
  action: 'reject' | 'waiting',
  body: Record<string, string>,
): Promise<DecisionOutcome> {
  let call
  try {
    call = await apiCall<DecisionAnswer>(`${APPLICATIONS_API}/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { status: 'error' }
  }
  const result = call.result
  if (call.ok && result?.state && result.updatedAt) {
    return {
      status: 'ok',
      state: result.state,
      updatedAt: result.updatedAt,
      waitingNumber: result.waitingNumber ?? null,
    }
  }
  if (call.status === 409) return { status: 'conflict' }
  if (call.status === 404) return { status: 'not_found' }
  if (call.status === 400 || call.status === 422) return { status: 'invalid', code: result?.code ?? null }
  return { status: 'error' }
}

export function rejectApplication(id: string, reason: string, updatedAt: string): Promise<DecisionOutcome> {
  return decide(id, 'reject', { reason, updatedAt })
}

export function waitApplication(id: string, groupId: string, updatedAt: string): Promise<DecisionOutcome> {
  return decide(id, 'waiting', { groupId, updatedAt })
}

// --- Formatting ---

/** A calendar date (`YYYY-MM-DD`) in the reader's language, read as that day whatever the zone. */
export function calendarDateLabel(date: string, locale: string): string {
  const parsed = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed)
}

/** An instant as a date in the club's zone. */
export function instantDateLabel(value: string | null, locale: string, timeZone: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone }).format(parsed)
}

/** An instant as a date and time in the club's zone. */
export function instantDateTimeLabel(value: string | null, locale: string, timeZone: string): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(parsed)
}
