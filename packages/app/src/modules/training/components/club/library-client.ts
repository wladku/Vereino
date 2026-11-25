// The HTTP side of the library pages (training outlines spec M-O8, P-O1 and the publish control; E24-S05, #685): the
// search, one entry, and the writes — publish and withdraw an outline, copy, rate, report. Authorization stays on the
// routes and commands.
import { useQuery } from '@tanstack/react-query'
import { apiCall, apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import type { LibraryLevel, LibraryParts, LibrarySort, PublishVisibility, ReportReason } from '../../lib/library'
import type { OutlinePart } from '../../lib/outline'

export const LIBRARY_HREF = '/club/training/library'

/** The library, optionally opened to pick an outline for one session (the session card's "From the library"). */
export function libraryHref(target?: { occurrenceId?: string }): string {
  return target?.occurrenceId ? `${LIBRARY_HREF}?occurrenceId=${encodeURIComponent(target.occurrenceId)}` : LIBRARY_HREF
}

export function libraryEntryHref(entryId: string, target?: { occurrenceId?: string }): string {
  const base = `${LIBRARY_HREF}/${encodeURIComponent(entryId)}`
  return target?.occurrenceId ? `${base}?occurrenceId=${encodeURIComponent(target.occurrenceId)}` : base
}

/** The public page of an entry shared with the public (P-O1). */
export function publicEntryHref(entryId: string): string {
  return `/library/o/${encodeURIComponent(entryId)}`
}

export type LibraryCredit = {
  clubName: string
  authorName: string | null
  adaptedFrom: { entryId: string | null; clubName: string; authorName: string | null } | null
}

export type LibraryCard = {
  id: string
  visibility: PublishVisibility
  language: string
  topic: string
  ageCategory: string
  durationMinutes: number
  parts: OutlinePart[]
  credit: LibraryCredit
  averageRating: number | null
  ratingCount: number
  userCount: number
  publishedAt: string
  ownClub: boolean
}

export type LibraryEntry = Omit<LibraryCard, 'parts'> & {
  goal: string
  specificGoals: string
  playersCount: number | null
  equipment: string
  parts: LibraryParts
  images: string[]
  licence: string
  licenceUrl: string
  mine: { used: boolean; stars: number | null; reported: boolean } | null
}

export type LibraryFilters = { q: string; ageCategory: string; part: OutlinePart | ''; sort: LibrarySort }

export type LibraryLoad = { status: 'ok'; items: LibraryCard[]; total: number } | { status: 'off' }

export const LIBRARY_QUERY_KEY = 'training-library'
export const LIBRARY_ENTRY_QUERY_KEY = 'training-library-entry'

export function libraryUrl(filters: LibraryFilters, pageSize = 50): string {
  const params = new URLSearchParams({ sort: filters.sort, pageSize: String(pageSize) })
  if (filters.q) params.set('q', filters.q)
  if (filters.ageCategory) params.set('ageCategory', filters.ageCategory)
  if (filters.part) params.set('part', filters.part)
  return `/api/training/library?${params.toString()}`
}

/** True for the 404 the library answers while it is not configured on this instance. */
function libraryOff(status: number, body: unknown): boolean {
  return (
    status === 404 &&
    Boolean(body && typeof body === 'object' && 'code' in body && body.code === 'library_not_configured')
  )
}

export function useLibrary(filters: LibraryFilters) {
  return useQuery({
    queryKey: [LIBRARY_QUERY_KEY, filters],
    queryFn: async (): Promise<LibraryLoad> => {
      const call = await apiCall<{ items?: LibraryCard[]; total?: number; code?: string }>(libraryUrl(filters))
      if (libraryOff(call.status, call.result)) return { status: 'off' }
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return { status: 'ok', items: call.result.items ?? [], total: call.result.total ?? 0 }
    },
  })
}

export type LibraryEntryLoad = { status: 'ok'; entry: LibraryEntry } | { status: 'not_found' } | { status: 'off' }

export function useLibraryEntry(entryId: string) {
  return useQuery({
    queryKey: [LIBRARY_ENTRY_QUERY_KEY, entryId],
    queryFn: async (): Promise<LibraryEntryLoad> => {
      const call = await apiCall<LibraryEntry & { code?: string }>(
        `/api/training/library/${encodeURIComponent(entryId)}`,
      )
      if (libraryOff(call.status, call.result)) return { status: 'off' }
      if (call.status === 404) return { status: 'not_found' }
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return { status: 'ok', entry: call.result }
    },
  })
}

const json = (body: unknown) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export async function publishOutline(
  outlineId: string,
  input: { visibility: PublishVisibility; acceptTerms?: boolean },
  errorMessage: string,
): Promise<{ entryId: string; visibility: PublishVisibility }> {
  const call = await apiCallOrThrow<{ entryId: string; visibility: PublishVisibility }>(
    `/api/training/outlines/${encodeURIComponent(outlineId)}/publish`,
    { method: 'POST', ...json(input) },
    { errorMessage },
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}

export async function withdrawOutline(outlineId: string, errorMessage: string): Promise<void> {
  await apiCallOrThrow(
    `/api/training/outlines/${encodeURIComponent(outlineId)}/publish`,
    { method: 'DELETE' },
    { errorMessage },
  )
}

export async function copyEntry(entryId: string, errorMessage: string): Promise<{ id: string }> {
  const call = await apiCallOrThrow<{ id: string }>(
    `/api/training/library/${encodeURIComponent(entryId)}/copy`,
    { method: 'POST' },
    { errorMessage },
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}

export async function rateEntry(
  entryId: string,
  stars: number,
  errorMessage: string,
): Promise<{ stars: number; averageRating: number | null; ratingCount: number }> {
  const call = await apiCallOrThrow<{ stars: number; averageRating: number | null; ratingCount: number }>(
    `/api/training/library/${encodeURIComponent(entryId)}/rating`,
    { method: 'PUT', ...json({ stars }) },
    { errorMessage },
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}

export async function reportEntry(
  entryId: string,
  input: { reason: ReportReason; note: string | null },
  errorMessage: string,
  options: { public?: boolean } = {},
): Promise<void> {
  const base = options.public ? '/api/training/public/library' : '/api/training/library'
  await apiCallOrThrow(
    `${base}/${encodeURIComponent(entryId)}/report`,
    { method: 'POST', ...json(input) },
    { errorMessage },
  )
}

/** The levels a coach may pick for a publication: the publication levels up to the club's widest one. */
export function publishOptions(max: LibraryLevel): PublishVisibility[] {
  if (max === 'public') return ['clubs', 'public']
  if (max === 'clubs') return ['clubs']
  return []
}
