// The reads of club events (club events spec REQ-T01, REQ-T02, REQ-T03, REQ-T11; *API, Command, and Error
// Contracts*): the `clubEvent` line of a part session in the calendars and the session record, the list rows' derived
// columns (dates, place, parts count, `mayManage`) and the event record with its parts. Every read is narrowed to the
// trusted tenant and organization; who may read a club event is decided by the routes (staff of the club).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { Scope } from '@vereino/core'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import { Activity, Attendance, ClubEvent, ClubEventPart, Occurrence } from '../data/entities'
import { clubEventDates, clubEventPublicPath, partKind } from '../lib/club-events'
import { gatheringIso } from '../lib/gathering'
import { confirmByIso } from '../lib/confirm-by'
import { clubEventManagerRole } from './club-event-scope'
import { findExternalTeams, findGroups, findPersons, findPlaces, findSections, type ActivitiesScope } from './directory'

/** The club event a part session belongs to, as the calendars and the session record show it (REQ-T03). */
export type ClubEventRef = { id: string; name: string; publicPath: string | null }

/** The club's public slug while its public page is published, else null (the public path's first segment). */
async function publishedClubSlug(container: AwilixContainer, scope: ActivitiesScope): Promise<string | null> {
  const settings = await container.resolve<ClubCoreSettingsService>('clubCoreSettings').get(scope)
  return settings.publicSettings.publication.enabled ? (settings.publicSettings.publicSlug ?? null) : null
}

/** The club event of each activity among `activityIds` that is a part of one, by activity id. */
export async function clubEventRefs(
  container: AwilixContainer,
  scope: ActivitiesScope,
  activityIds: readonly string[],
  em: EntityManager = container.resolve<EntityManager>('em').fork(),
): Promise<Map<string, ClubEventRef>> {
  const ids = [...new Set(activityIds)]
  const refs = new Map<string, ClubEventRef>()
  if (ids.length === 0) return refs
  const activities = await em.find(
    Activity,
    { ...scope, id: { $in: ids }, clubEventId: { $ne: null } },
    { fields: ['id', 'clubEventId'] },
  )
  if (activities.length === 0) return refs
  const events = await em.find(
    ClubEvent,
    { ...scope, id: { $in: [...new Set(activities.map((row) => row.clubEventId as string))] }, deletedAt: null },
    { fields: ['id', 'name', 'publicSlug', 'isPublic'] },
  )
  const clubSlug = events.some((event) => event.isPublic) ? await publishedClubSlug(container, scope) : null
  const byId = new Map(
    events.map((event) => [
      event.id,
      { id: event.id, name: event.name, publicPath: clubEventPublicPath(clubSlug, event.publicSlug, event.isPublic) },
    ]),
  )
  for (const activity of activities) {
    const ref = byId.get(activity.clubEventId as string)
    if (ref) refs.set(activity.id, ref)
  }
  return refs
}

/** What a list row and the record add to the stored event: its dates, place, parts count and whether the caller manages it. */
export type ClubEventDerived = {
  sectionName: string | null
  placeName: string | null
  placeExternal: boolean
  dateFrom: string | null
  dateTo: string | null
  partsCount: number
  mayManage: boolean
}

type EventRow = Pick<
  ClubEvent,
  'id' | 'tenantId' | 'organizationId' | 'sectionId' | 'placeId' | 'status' | 'publicSlug' | 'isPublic'
>

/** The spans of the live parts of each event (a part with a group: its live session; an open part: its own). */
async function partSpans(
  em: EntityManager,
  scope: ActivitiesScope,
  eventIds: readonly string[],
): Promise<{ parts: ClubEventPart[]; sessions: Map<string, Occurrence> }> {
  const parts = await em.find(
    ClubEventPart,
    { ...scope, clubEventId: { $in: [...eventIds] }, deletedAt: null },
    { orderBy: { createdAt: 'asc' } },
  )
  const activityIds = parts.flatMap((part) => (part.activityId ? [part.activityId] : []))
  const sessions =
    activityIds.length > 0
      ? await em.find(Occurrence, { ...scope, activityId: { $in: activityIds }, deletedAt: null })
      : []
  return { parts, sessions: new Map(sessions.map((session) => [session.activityId, session])) }
}

/** The derived columns of club event rows (B-T1 list, `/club/club-events`). */
export async function clubEventDerived(
  container: AwilixContainer,
  scope: ActivitiesScope,
  grants: Scope,
  rows: readonly EventRow[],
  timeZone: string,
): Promise<Map<string, ClubEventDerived>> {
  const result = new Map<string, ClubEventDerived>()
  if (rows.length === 0) return result
  const em = container.resolve<EntityManager>('em').fork()
  const [sections, places, spans] = await Promise.all([
    findSections(
      container,
      scope,
      rows.flatMap((row) => (row.sectionId ? [row.sectionId] : [])),
      em,
    ),
    findPlaces(
      container,
      scope,
      rows.map((row) => row.placeId),
      em,
    ),
    partSpans(
      em,
      scope,
      rows.map((row) => row.id),
    ),
  ])
  for (const row of rows) {
    const parts = spans.parts.filter((part) => part.clubEventId === row.id)
    const dates = clubEventDates(
      parts.flatMap((part) => {
        const session = part.activityId ? spans.sessions.get(part.activityId) : undefined
        if (session) return [{ startAt: session.startAt, endAt: session.endAt }]
        return part.startsAt && part.endsAt ? [{ startAt: part.startsAt, endAt: part.endsAt }] : []
      }),
      timeZone,
    )
    const place = places.get(row.placeId)
    result.set(row.id, {
      sectionName: row.sectionId ? (sections.get(row.sectionId)?.name ?? null) : null,
      placeName: place?.name ?? null,
      placeExternal: place?.isExternal === true,
      dateFrom: dates?.dateFrom ?? null,
      dateTo: dates?.dateTo ?? null,
      partsCount: parts.length,
      mayManage: clubEventManagerRole(grants, { ...row, sectionId: row.sectionId ?? null }) !== null,
    })
  }
  return result
}

/** One part as the event record lists it (the API table, `GET /api/activities/club-events/{id}`). */
export type ClubEventPartView = {
  id: string
  kind: 'group' | 'open'
  title: string
  categoryLabel: string | null
  type: string
  visitingTeamIds: string[]
  visitingTeams: Array<{ id: string; name: string; clubName: string | null }>
  activityId: string | null
  occurrenceId: string | null
  groupId: string | null
  groupName: string | null
  sectionName: string | null
  startAt: string | null
  endAt: string | null
  coachPersonId: string | null
  coachName: string | null
  status: string | null
  cancelReason: string | null
  gatheringAt: string | null
  confirmBy: string | null
  declaredCount: number
  updatedAt: string
}

function personName(person: { firstName: string; lastName: string } | undefined): string | null {
  return person ? `${person.firstName} ${person.lastName}` : null
}

/** The event record's parts, in time order. */
export async function clubEventPartViews(
  container: AwilixContainer,
  scope: ActivitiesScope,
  eventId: string,
): Promise<ClubEventPartView[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const { parts, sessions } = await partSpans(em, scope, [eventId])
  const sessionList = [...sessions.values()]
  const [groups, persons, teams, declared] = await Promise.all([
    findGroups(
      container,
      scope,
      sessionList.map((session) => session.groupId),
      em,
    ),
    findPersons(
      container,
      scope,
      sessionList.flatMap((session) => (session.coachPersonId ? [session.coachPersonId] : [])),
      em,
    ),
    findExternalTeams(
      container,
      scope,
      parts.flatMap((part) => part.visitingTeamIds),
      em,
    ),
    sessionList.length > 0
      ? em.find(
          Attendance,
          {
            ...scope,
            occurrenceId: { $in: sessionList.map((session) => session.id) },
            declared: 'yes',
            deletedAt: null,
          },
          { fields: ['id', 'occurrenceId'] },
        )
      : Promise.resolve([]),
  ])
  const sections = await findSections(
    container,
    scope,
    [...groups.values()].map((group) => group.sectionId),
    em,
  )
  const declaredBySession = new Map<string, number>()
  for (const row of declared)
    declaredBySession.set(row.occurrenceId, (declaredBySession.get(row.occurrenceId) ?? 0) + 1)
  const views = parts.map((part): ClubEventPartView => {
    const session = part.activityId ? (sessions.get(part.activityId) ?? null) : null
    const group = session ? groups.get(session.groupId) : undefined
    return {
      id: part.id,
      kind: partKind(part),
      title: part.title,
      categoryLabel: part.categoryLabel ?? null,
      type: part.type,
      visitingTeamIds: [...part.visitingTeamIds],
      visitingTeams: part.visitingTeamIds.flatMap((id) => {
        const team = teams.get(id)
        return team ? [{ id, name: team.name, clubName: team.clubName ?? null }] : []
      }),
      activityId: part.activityId ?? null,
      occurrenceId: session?.id ?? null,
      groupId: session?.groupId ?? null,
      groupName: group?.name ?? null,
      sectionName: group ? (sections.get(group.sectionId)?.name ?? null) : null,
      startAt: (session?.startAt ?? part.startsAt)?.toISOString() ?? null,
      endAt: (session?.endAt ?? part.endsAt)?.toISOString() ?? null,
      coachPersonId: session?.coachPersonId ?? null,
      coachName: session?.coachPersonId ? personName(persons.get(session.coachPersonId)) : null,
      status: session?.status ?? part.status ?? null,
      cancelReason: session ? (session.cancelReason ?? null) : (part.cancelReason ?? null),
      gatheringAt: session ? gatheringIso(session.startAt, session.gatheringMinutesBefore) : null,
      confirmBy: session ? confirmByIso(session.startAt, session.confirmByMinutesBefore) : null,
      declaredCount: session ? (declaredBySession.get(session.id) ?? 0) : 0,
      updatedAt: part.updatedAt.toISOString(),
    }
  })
  return views.sort((a, b) => (a.startAt ?? '').localeCompare(b.startAt ?? '') || a.title.localeCompare(b.title, 'pl'))
}
