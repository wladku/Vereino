// The HTTP side of the `training` member pages (training outlines spec M-O5, M-O6, M-O7; #683): the member profile
// (`GET /api/people/me`, the same query key as `people`'s pages), the outline list and one outline, and the writes —
// create, update (with the lock token), delete, attach, ensure-copy and the images. Authorization stays on the routes
// and commands.
import { useQuery } from '@tanstack/react-query'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import type { OutlineLanguage, OutlinePart, OutlineParts } from '../../lib/outline'

export const OUTLINES_HREF = '/club/training/outlines'

export function outlineHref(id: string): string {
  return `${OUTLINES_HREF}/${encodeURIComponent(id)}`
}

export function outlinePrintHref(id: string): string {
  return `${outlineHref(id)}/print`
}

/** The editor of a new outline, optionally written straight for a session or as a series outline. */
export function newOutlineHref(target?: { occurrenceId?: string; activityId?: string }): string {
  const params = new URLSearchParams()
  if (target?.occurrenceId) params.set('occurrenceId', target.occurrenceId)
  if (target?.activityId) params.set('activityId', target.activityId)
  const query = params.toString()
  return `${OUTLINES_HREF}/new${query ? `?${query}` : ''}`
}

export function sessionHref(occurrenceId: string): string {
  return `/club/occurrences/${encodeURIComponent(occurrenceId)}?as=coach`
}

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
  isParticipant?: boolean
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

// --- Outlines ---

export type OutlineListItem = {
  id: string
  topic: string
  ageCategory: string
  language: OutlineLanguage
  durationMinutes: number
  authorPersonId: string | null
  authorName: string | null
  groupId: string | null
  groupName: string | null
  activityId: string | null
  occurrenceId: string | null
  sessionDate: string | null
  sourceOutlineId: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type OutlineListView = 'all' | 'mine' | 'sessions' | 'series'

export type OutlineListFilters = { view: OutlineListView; search: string; ageCategory: string }

export const OUTLINES_QUERY_KEY = 'training-outlines'
export const OUTLINE_QUERY_KEY = 'training-outline'

export function outlinesUrl(
  filters: Partial<OutlineListFilters> & { occurrenceId?: string; pageSize?: number },
): string {
  const params = new URLSearchParams({
    sortField: 'updatedAt',
    sortDir: 'desc',
    pageSize: String(filters.pageSize ?? 50),
  })
  if (filters.view && filters.view !== 'all') params.set('view', filters.view)
  if (filters.search) params.set('search', filters.search)
  if (filters.ageCategory) params.set('ageCategory', filters.ageCategory)
  if (filters.occurrenceId) params.set('occurrenceId', filters.occurrenceId)
  return `/api/training/outlines?${params.toString()}`
}

export function useOutlines(filters: OutlineListFilters) {
  return useQuery({
    queryKey: [OUTLINES_QUERY_KEY, filters],
    queryFn: async (): Promise<{ items: OutlineListItem[]; total: number }> => {
      const call = await apiCall<{ items?: OutlineListItem[]; total?: number }>(outlinesUrl(filters))
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return { items: call.result.items ?? [], total: call.result.total ?? 0 }
    },
  })
}

export type OutlineSession = {
  id: string
  activityId: string
  activityName: string | null
  type: string
  status: string
  occurrenceDate: string
  startAt: string
  endAt: string
  placeLabel: string | null
  coachName: string | null
}

export type Outline = {
  id: string
  authorPersonId: string
  authorName: string | null
  sectionId: string | null
  groupId: string | null
  groupName: string | null
  activityId: string | null
  occurrenceId: string | null
  sourceOutlineId: string | null
  language: OutlineLanguage
  topic: string
  goal: string
  specificGoals: string
  ageCategory: string
  durationMinutes: number
  playersCount: number | null
  equipment: string
  parts: OutlineParts
  minutes: Record<OutlinePart, number> & { total: number }
  session: OutlineSession | null
  locked: boolean
  fileName: string
  clubName: string | null
  createdAt: string
  updatedAt: string
}

export type OutlineLoad = { status: 'ok'; outline: Outline } | { status: 'not_found' } | { status: 'forbidden' }

export async function fetchOutline(id: string): Promise<OutlineLoad> {
  const call = await apiCall<Outline>(`/api/training/outlines/${encodeURIComponent(id)}`)
  if (call.status === 404) return { status: 'not_found' }
  if (call.status === 403) return { status: 'forbidden' }
  if (!call.ok || !call.result) throw new Error(String(call.status))
  return { status: 'ok', outline: call.result }
}

export function useOutline(id: string | null) {
  return useQuery({
    queryKey: [OUTLINE_QUERY_KEY, id],
    enabled: Boolean(id),
    queryFn: () => fetchOutline(id as string),
  })
}

/** The content a form edits and the create and update routes take. */
export type OutlineInput = {
  language: OutlineLanguage
  topic: string
  goal: string
  specificGoals: string
  ageCategory: string
  durationMinutes: number
  playersCount: number | null
  equipment: string
  parts: OutlineParts
}

export async function createOutline(
  input: OutlineInput & { occurrenceId?: string; activityId?: string },
  errorMessage: string,
): Promise<{ id: string; updatedAt: string }> {
  const call = await apiCallOrThrow<{ id: string; updatedAt: string }>(
    '/api/training/outlines',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) },
    { errorMessage },
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}

export async function updateOutline(
  id: string,
  input: OutlineInput,
  lockToken: string,
  errorMessage: string,
): Promise<{ updatedAt: string }> {
  const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
    apiCallOrThrow<{ updatedAt: string }>(
      '/api/training/outlines',
      { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...input }) },
      { errorMessage },
    ),
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}

export async function deleteOutline(id: string, lockToken: string, errorMessage: string): Promise<void> {
  await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
    apiCallOrThrow(`/api/training/outlines?id=${encodeURIComponent(id)}`, { method: 'DELETE' }, { errorMessage }),
  )
}

export async function attachOutline(
  id: string,
  target: { occurrenceId: string } | { activityId: string },
  errorMessage: string,
): Promise<{ id: string }> {
  const call = await apiCallOrThrow<{ id: string }>(
    `/api/training/outlines/${encodeURIComponent(id)}/attach`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(target) },
    { errorMessage },
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}

export async function ensureCopy(occurrenceId: string, errorMessage: string): Promise<{ id: string | null }> {
  const call = await apiCallOrThrow<{ id: string | null }>(
    '/api/training/outlines/ensure-copy',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ occurrenceId }) },
    { errorMessage },
  )
  return { id: call.result?.id ?? null }
}

export async function uploadImage(
  id: string,
  target: { part: OutlinePart; index: number; file: File },
  lockToken: string,
  errorMessage: string,
): Promise<{ attachmentId: string; ownerOutlineId: string; updatedAt: string }> {
  const form = new FormData()
  form.set('file', target.file)
  form.set('part', target.part)
  form.set('index', String(target.index))
  const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
    apiCallOrThrow<{ attachmentId: string; ownerOutlineId: string; updatedAt: string }>(
      `/api/training/outlines/${encodeURIComponent(id)}/images`,
      { method: 'POST', body: form },
      { errorMessage },
    ),
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}

export async function removeImage(
  id: string,
  attachmentId: string,
  lockToken: string,
  errorMessage: string,
): Promise<{ updatedAt: string }> {
  const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
    apiCallOrThrow<{ updatedAt: string }>(
      `/api/training/outlines/${encodeURIComponent(id)}/images/${encodeURIComponent(attachmentId)}`,
      { method: 'DELETE' },
      { errorMessage },
    ),
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
