// Shared outline library fixtures (training outlines spec phase 4, TEST-O09…TEST-O14; #685): the library tenant (the
// harness configures `VEREINO_LIBRARY_*`; `training library-init` is idempotent), outlines written and shared by a
// coach, the library search narrowed to one test's unique topic, and a closed session whose outline came from an
// entry (a use, so its coaches may rate).
import { expect, type APIRequestContext } from '@playwright/test'
import { calendarDate, call, mercato, OPTIMISTIC_LOCK_HEADER, uniqueSuffix, type Club } from './club'
import { createActivity } from './activities'
import { readAttendanceList, saveAttendanceList, sessionsOf, startNow, type Family } from './attendance'

export type LibraryInit = {
  status: 'created' | 'exists'
  tenantId: string
  organizationId: string
  configured: boolean
}

/** Creates the library tenant under the configured ids (once per run; later calls answer `exists`). */
export function ensureLibrary(): LibraryInit {
  const result = mercato(['training', 'library-init']) as LibraryInit | null
  expect(result?.configured, 'the harness configures VEREINO_LIBRARY_*').toBe(true)
  return result as LibraryInit
}

/** A topic no other test of the run uses, so the shared library can be searched for this test's entries. */
export function uniqueTopic(label: string): string {
  return `${label} ${uniqueSuffix()}`
}

const exercise = (name: string, minutes: number) => ({
  name,
  minutes,
  organisation: 'Pole 20×20 m',
  coachingPoints: '',
})

export const outlineContent = (topic: string) => ({
  language: 'pl',
  topic,
  goal: 'Doskonalenie gry 1×1 w obronie',
  ageCategory: 'U11',
  durationMinutes: 75,
  playersCount: 12,
  equipment: 'Pachołki, piłki',
  parts: {
    warm_up: [exercise('Rondo 4×1', 15)],
    main: [exercise('Gra 1×1 na małe bramki', 40)],
    cool_down: [exercise('Rozciąganie', 10)],
  },
})

export type Created = { id: string; updatedAt: string }

/** An own outline of the caller. */
export async function ownOutline(request: APIRequestContext, token: string, topic: string): Promise<Created> {
  const created = await call<Created>(request, 'POST', '/api/training/outlines', token, { data: outlineContent(topic) })
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  return created.body as Created
}

export type Published = { entryId?: string; visibility?: string; republished?: boolean; code?: string }

export async function publishOutline(
  request: APIRequestContext,
  token: string,
  outlineId: string,
  data: { visibility: 'clubs' | 'public'; acceptTerms?: boolean },
) {
  return call<Published>(request, 'POST', `/api/training/outlines/${outlineId}/publish`, token, { data })
}

export type LibraryCard = {
  id: string
  topic: string
  visibility: string
  credit: { clubName: string; authorName: string | null; adaptedFrom: unknown }
  averageRating: number | null
  ratingCount: number
  userCount: number
  ownClub: boolean
}

export async function searchLibrary(request: APIRequestContext, token: string, query: Record<string, string>) {
  const params = new URLSearchParams(query)
  return call<{ items?: LibraryCard[]; total?: number; code?: string }>(
    request,
    'GET',
    `/api/training/library?${params.toString()}`,
    token,
  )
}

export type LibraryEntryView = LibraryCard & {
  images: string[]
  parts: Record<string, { name: string; image: number | null }[]>
  licence: string
  mine: { used: boolean; stars: number | null; reported: boolean } | null
  code?: string
}

export async function readEntry(request: APIRequestContext, token: string, entryId: string) {
  return call<LibraryEntryView>(request, 'GET', `/api/training/library/${entryId}`, token)
}

/** Sets the club's widest library level as its administrator (B-O1). */
export async function setLibraryLevel(request: APIRequestContext, club: Club, level: 'club' | 'clubs' | 'public') {
  const current = await call<{ updatedAt?: string | null }>(request, 'GET', '/api/club_core/settings', club.adminToken)
  const lock = current.body?.updatedAt
  const saved = await call(request, 'PUT', '/api/club_core/settings', club.adminToken, {
    data: { outlineLibraryMaxVisibility: level },
    headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {},
  })
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
}

/**
 * A training of Żaki today, started (the check-off is open), with the outline `outlineId` attached by the coach, then
 * closed with every participant present — `activities.occurrence.completed` records the library use. Returns the
 * session id.
 */
export async function closeSessionWith(
  request: APIRequestContext,
  club: Club,
  family: Family,
  outlineId: string,
): Promise<string> {
  const today = calendarDate()
  const activity = await createActivity(request, club.adminToken, {
    groupId: family.zaki,
    name: `Trening z biblioteki ${uniqueSuffix()}`,
    type: 'training',
    placeId: family.pitch,
    coachPersonId: family.coach.personId,
    startsOn: today,
    startTime: '23:00',
    endTime: '23:45',
  })
  const [session] = await sessionsOf(request, club, activity.id)
  const attached = await call(request, 'POST', `/api/training/outlines/${outlineId}/attach`, family.coach.token, {
    data: { occurrenceId: session.id },
  })
  expect(attached.status, JSON.stringify(attached.body)).toBe(201)
  await startNow(request, club, session.id, { sameDay: true })
  const list = await readAttendanceList(request, family.coach.token, session.id)
  expect(list.status, JSON.stringify(list.body)).toBe(200)
  const entries = (list.body?.rows ?? [])
    .filter((row) => row.onRoster)
    .map((row) => ({
      personId: row.personId,
      actual: 'present' as const,
    }))
  // The list's session version is the lock token of the check-off.
  const closed = await saveAttendanceList(
    request,
    family.coach.token,
    session.id,
    { entries, complete: true },
    list.body?.occurrence?.updatedAt,
  )
  expect(closed.status, JSON.stringify(closed.body)).toBe(200)
  return session.id
}
