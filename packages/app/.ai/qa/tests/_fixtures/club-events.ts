// Club events and their parts through the API (club events spec phase 1, #376): the event and part routes, and the
// example of the spec — the academy section with its groups, an external hall and a club place.
import { expect, type APIRequestContext } from '@playwright/test'
import { addDays, zoneInstant, type CodedError } from './activities'
import { memberAccount, type Family } from './attendance'
import { OPTIMISTIC_LOCK_HEADER, birthDateTurning, calendarDate, call, createPerson, type Club } from './club'
import { create as createStructure } from './club-structure'
import { addMembership, createGroup } from './groups'

export type ClubEventBody = CodedError & {
  id?: string
  publicSlug?: string
  updatedAt?: string
  actingRole?: string
  sessionsMoved?: number
  notified?: number
  cancelledSessions?: number
}

export type PartView = {
  id: string
  kind: 'group' | 'open'
  title: string
  type: string
  activityId: string | null
  occurrenceId: string | null
  groupId: string | null
  startAt: string | null
  endAt: string | null
  status: string | null
  visitingTeams: Array<{ id: string; name: string; clubName: string | null }>
  updatedAt: string
}

export type ClubEventRecord = CodedError & {
  id: string
  name: string
  publicSlug: string
  sectionId: string | null
  placeId: string
  placeExternal: boolean
  status: string
  dateFrom: string | null
  dateTo: string | null
  partsCount: number
  mayManage: boolean
  updatedAt: string
  parts: PartView[]
}

const lock = (token: string | null | undefined): Record<string, string> =>
  token ? { [OPTIMISTIC_LOCK_HEADER]: token } : {}

export function createClubEvent(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<ClubEventBody>(request, 'POST', '/api/activities/club-events', token, { data })
}

export function updateClubEvent(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>,
  lockToken: string | null | undefined,
) {
  return call<ClubEventBody>(request, 'PUT', '/api/activities/club-events', token, { data, headers: lock(lockToken) })
}

export function cancelClubEvent(
  request: APIRequestContext,
  token: string,
  id: string,
  reason: string,
  lockToken: string | null | undefined,
) {
  return call<ClubEventBody>(request, 'POST', `/api/activities/club-events/${id}/cancel`, token, {
    data: { reason },
    headers: lock(lockToken),
  })
}

export function readClubEvent(request: APIRequestContext, token: string, id: string) {
  return call<ClubEventRecord>(request, 'GET', `/api/activities/club-events/${id}`, token)
}

export function addPart(request: APIRequestContext, token: string, eventId: string, data: Record<string, unknown>) {
  return call<CodedError & { id?: string; activityId?: string | null; occurrenceId?: string | null }>(
    request,
    'POST',
    `/api/activities/club-events/${eventId}/parts`,
    token,
    { data },
  )
}

export function updatePart(
  request: APIRequestContext,
  token: string,
  eventId: string,
  partId: string,
  data: Record<string, unknown>,
  lockToken: string | null | undefined,
) {
  return call<CodedError & { updatedAt?: string }>(
    request,
    'PUT',
    `/api/activities/club-events/${eventId}/parts/${partId}`,
    token,
    { data, headers: lock(lockToken) },
  )
}

export function deletePart(
  request: APIRequestContext,
  token: string,
  eventId: string,
  partId: string,
  lockToken: string | null | undefined,
) {
  return call<CodedError>(request, 'DELETE', `/api/activities/club-events/${eventId}/parts/${partId}`, token, {
    headers: lock(lockToken),
  })
}

export function cancelOpenPart(
  request: APIRequestContext,
  token: string,
  eventId: string,
  partId: string,
  reason: string,
  lockToken: string | null | undefined,
) {
  return call<CodedError & { status?: string }>(
    request,
    'POST',
    `/api/activities/club-events/${eventId}/parts/${partId}/cancel`,
    token,
    { data: { reason }, headers: lock(lockToken) },
  )
}

/** The external municipal hall of the example and a club place with capacity 1. */
export async function examplePlaces(request: APIRequestContext, club: Club): Promise<{ hall: string; salka: string }> {
  const hall = await createStructure(request, club.adminToken, 'places', {
    name: 'Hala sportowa w Liszkach',
    kind: 'hall',
    capacityGroups: 1,
    isExternal: true,
    address: 'ul. Szkolna 50, Liszki',
  })
  const salka = await createStructure(request, club.adminToken, 'places', {
    name: 'Salka w budynku klubowym',
    kind: 'hall',
    capacityGroups: 1,
  })
  return { hall, salka }
}

/** Creates the club event as `token` and returns its id (201 asserted). */
export async function clubEventId(
  request: APIRequestContext,
  token: string,
  data: Record<string, unknown>,
): Promise<string> {
  const created = await createClubEvent(request, token, data)
  expect(created.status, JSON.stringify(created.body)).toBe(201)
  return String(created.body?.id)
}

/** Adds a part (201 asserted) and returns its ids. */
export async function partIds(
  request: APIRequestContext,
  token: string,
  eventId: string,
  data: Record<string, unknown>,
): Promise<{ id: string; activityId: string | null; occurrenceId: string | null }> {
  const added = await addPart(request, token, eventId, data)
  expect(added.status, JSON.stringify(added.body)).toBe(201)
  return {
    id: String(added.body?.id),
    activityId: added.body?.activityId ?? null,
    occurrenceId: added.body?.occurrenceId ?? null,
  }
}

/**
 * The family example of the member pages (club events spec TEST-T03, TEST-T13; #382): `familyFor`'s academy with a
 * club event at the external hall. The Żaki part (tomorrow 9:00–14:00, confirm by two hours before, coach Marek, three
 * visiting teams) concerns the guardian's wards; a Trampkarz part of the same event concerns nobody in the family; Ola,
 * an adult participant of the pool group only, is in no part.
 */
export async function partFamily(request: APIRequestContext, club: Club, family: Family) {
  const admin = club.adminToken
  const { hall } = await examplePlaces(request, club)
  const trampkarz = await createGroup(request, admin, { sectionId: family.academy, name: 'Trampkarz', kind: 'team' })
  const teams: string[] = []
  for (const name of ['Wisła Liszki', 'Orzeł Kryspinów', 'CIS Czernichów']) {
    const team = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', admin, {
      data: { name, clubName: name },
    })
    expect(team.status, JSON.stringify(team.body)).toBe(201)
    teams.push(String(team.body?.id))
  }
  const olaId = await createPerson(request, admin, {
    firstName: 'Ola',
    lastName: 'Pływak',
    birthDate: birthDateTurning(20),
  })
  await addMembership(request, admin, {
    groupId: family.poolGroup,
    personId: olaId,
    role: 'participant',
    validFrom: addDays(calendarDate(), -30),
  })
  const ola = await memberAccount(request, club, olaId, 'ola')
  const coordinator = family.academyCoordinator.token
  const eventId = await clubEventId(request, coordinator, {
    name: 'GWIAZDA CUP 2026',
    sectionId: family.academy,
    placeId: hall,
  })
  const day = addDays(calendarDate(), 1)
  const zakiPart = await partIds(request, coordinator, eventId, {
    title: 'Turniej Żaków',
    groupId: family.zaki,
    coachPersonId: family.coach.personId,
    startsAt: zoneInstant(day, '09:00'),
    endsAt: zoneInstant(day, '14:00'),
    confirmByMinutesBefore: 120,
    visitingTeamIds: teams,
  })
  const trampkarzPart = await partIds(request, coordinator, eventId, {
    title: 'Turniej Trampkarza',
    groupId: trampkarz,
    startsAt: zoneInstant(day, '14:30'),
    endsAt: zoneInstant(day, '16:30'),
  })
  return { eventId, day, hall, ola, zakiPart, trampkarzPart }
}

/** Makes the club event public (the club page and its `events` block are published separately). */
export async function makePublic(request: APIRequestContext, token: string, eventId: string): Promise<string> {
  const current = await readClubEvent(request, token, eventId)
  expect(current.status, JSON.stringify(current.body)).toBe(200)
  const updated = await updateClubEvent(request, token, { id: eventId, isPublic: true }, current.body?.updatedAt)
  expect(updated.status, JSON.stringify(updated.body)).toBe(200)
  return String(current.body?.publicSlug)
}
