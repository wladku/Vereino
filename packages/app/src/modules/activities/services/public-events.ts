// `activities.publicEvents` (navigation spec REQ-N13; #263; club events spec REQ-T09, REQ-T10, DD-T11, DD-T12; #381):
// the public Events page P-06 and the tournament page P-T1, registered as an optional DI contribution `club_core` reads
// with `hasRegistration` (`club_core/services/public-blocks.ts`). P-06 lists the one-off activities of public groups in
// public sections (never a part of a club event) and one entry per published club event with a live part; P-T1 reads
// one published club event by its slug and its poster and funder logos. `club_core` calls every method only for a
// club that publishes its page and the `events` block, inside the tenant and organization its slug lookup found, and
// passes the club's public sections. Every query carries that scope. A guest gets names, types, dates, times, places,
// cancellations, public groups and visiting teams' names — never a roster, a participant, a contact, a coach or a
// cancellation reason.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { calendarDateInZone } from '@vereino/core'
import type {
  PublicClubBlockContext,
  PublicClubEvent,
  PublicClubEventFile,
  PublicEventsContext,
  PublicEventsProvider,
} from '../../club_core/services/public-blocks'
import { Activity, ClubEvent, ClubEventFile, ClubEventPart, Occurrence } from '../data/entities'
import { CLUB_EVENT_FILE_ASSIGNMENT, CLUB_EVENT_FILE_OWNER_ENTITY } from '../lib/club-event-files'
import { isClubEventSlug } from '../lib/club-events'
import { publicClubEventView } from '../lib/public-club-event'
import {
  pastEventsFrom,
  publicClubEventItems,
  publicEventLists,
  withClubEvents,
  type PublicClubEventSpan,
  type PublicEventLists,
  type PublicEventPlace,
} from '../lib/public-events'
import { storedVenue } from '../lib/venue'
import {
  clubTimeZone,
  findExternalTeams,
  findGroups,
  findPlaces,
  publicGroups,
  type ActivitiesScope,
} from './directory'

export const ACTIVITIES_PUBLIC_EVENTS = 'activities.publicEvents' as const

/** Upper bound of the session rows one page reads (60 days back and the club's whole planned future of events). */
const SESSION_READ_LIMIT = 1000

/** Upper bound of the published club events one P-06 read takes. */
const CLUB_EVENT_READ_LIMIT = 200

/** The kinds of club event files a public read lists and streams without the picture rule (BR-I01). */
const PUBLIC_FILE_KINDS = ['poster', 'funder_logo'] as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const NONE: PublicEventLists = { upcoming: [], past: [] }

type Em = EntityManager

type PartSession = Pick<Occurrence, 'id' | 'activityId' | 'groupId' | 'startAt' | 'endAt' | 'status'>

function scopeOf(ctx: PublicClubBlockContext): ActivitiesScope {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

async function placesById(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
  em: Em,
): Promise<Map<string, PublicEventPlace>> {
  const found = await findPlaces(container, scope, [...new Set(ids)], em)
  return new Map(
    [...found.values()].map((place) => [
      place.id,
      {
        name: place.name,
        isExternal: place.isExternal,
        address: place.address,
        geoLat: place.geoLat,
        geoLng: place.geoLng,
      },
    ]),
  )
}

/** The live parts of `eventIds` with the live sessions of their activities, by activity id. */
async function liveParts(
  em: Em,
  scope: ActivitiesScope,
  eventIds: readonly string[],
): Promise<{ parts: ClubEventPart[]; sessions: Map<string, PartSession> }> {
  const parts = await em.find(ClubEventPart, { ...scope, clubEventId: { $in: [...eventIds] }, deletedAt: null })
  const activityIds = parts.flatMap((part) => (part.activityId ? [part.activityId] : []))
  const sessions =
    activityIds.length > 0
      ? await em.find(
          Occurrence,
          { ...scope, activityId: { $in: activityIds }, deletedAt: null },
          { fields: ['id', 'activityId', 'groupId', 'startAt', 'endAt', 'status'] },
        )
      : []
  return { parts, sessions: new Map(sessions.map((session) => [session.activityId, session])) }
}

/** The published, live club event behind a slug, or null. */
function publishedClubEvent(em: Em, scope: ActivitiesScope, eventSlug: string): Promise<ClubEvent | null> {
  if (!isClubEventSlug(eventSlug)) return Promise.resolve(null)
  return em.findOne(ClubEvent, { ...scope, publicSlug: eventSlug, isPublic: true, deletedAt: null })
}

export function createPublicEvents(container: AwilixContainer): PublicEventsProvider {
  const fork = (): Em => container.resolve<Em>('em').fork()

  /** The one-off activities of the public groups (never a part of a club event): the P-06 lists of #263. */
  async function oneOffLists(
    em: Em,
    scope: ActivitiesScope,
    ctx: PublicEventsContext,
    groupIds: readonly string[],
    timeZone: string,
    today: string,
  ): Promise<PublicEventLists> {
    if (groupIds.length === 0) return NONE
    const events = await em.find(
      Activity,
      {
        ...scope,
        groupId: { $in: [...groupIds] },
        recurrenceRule: null,
        clubEventId: null,
        isActive: true,
        deletedAt: null,
      },
      { fields: ['id', 'name', 'type', 'sectionId'] },
    )
    if (events.length === 0) return NONE
    // One day of slack before the 60 days: the exact cut is the club-zone date in `publicEventLists`.
    const endsAfter = new Date(`${pastEventsFrom(today)}T00:00:00Z`)
    endsAfter.setUTCDate(endsAfter.getUTCDate() - 1)
    const sessions = await em.find(
      Occurrence,
      {
        ...scope,
        activityId: { $in: events.map((event) => event.id) },
        endAt: { $gte: endsAfter },
        deletedAt: null,
      },
      {
        fields: ['id', 'activityId', 'groupId', 'startAt', 'endAt', 'placeId', 'venueName', 'venueAddress', 'status'],
        orderBy: { startAt: 'asc', id: 'asc' },
        limit: SESSION_READ_LIMIT,
      },
    )
    if (sessions.length === 0) return NONE
    const places = await placesById(
      container,
      scope,
      sessions.flatMap((row) => (row.placeId ? [row.placeId] : [])),
      em,
    )
    return publicEventLists(
      events.map((event) => ({ id: event.id, name: event.name, type: event.type, sectionId: event.sectionId })),
      sessions.map((row) => ({
        activityId: row.activityId,
        groupId: row.groupId,
        startAt: row.startAt,
        endAt: row.endAt,
        placeId: row.placeId,
        venue: storedVenue(row),
        status: row.status,
      })),
      new Map(ctx.sections.map((section) => [section.id, section.slug])),
      places,
      timeZone,
      today,
    )
  }

  return {
    async events(ctx: PublicEventsContext) {
      const scope = scopeOf(ctx)
      const em = fork()
      const groups =
        ctx.sections.length > 0
          ? await publicGroups(
              container,
              scope,
              ctx.sections.map((section) => section.id),
              em,
            )
          : []
      const clubEvents = await em.find(
        ClubEvent,
        { ...scope, isPublic: true, deletedAt: null },
        {
          fields: ['id', 'name', 'publicSlug', 'sectionId', 'placeId', 'status'],
          orderBy: { createdAt: 'desc' },
          limit: CLUB_EVENT_READ_LIMIT,
        },
      )
      if (groups.length === 0 && clubEvents.length === 0) return NONE
      const timeZone = await clubTimeZone(container, scope)
      const today = calendarDateInZone(new Date(), timeZone)
      const lists = await oneOffLists(
        em,
        scope,
        ctx,
        groups.map((group) => group.id),
        timeZone,
        today,
      )
      if (clubEvents.length === 0) return lists
      const eventIds = clubEvents.map((event) => event.id)
      const { parts, sessions } = await liveParts(em, scope, eventIds)
      const spans = parts.flatMap((part): PublicClubEventSpan[] => {
        const session = part.activityId ? sessions.get(part.activityId) : undefined
        if (session) {
          return [
            { clubEventId: part.clubEventId, startAt: session.startAt, endAt: session.endAt, groupId: session.groupId },
          ]
        }
        return !part.activityId && part.startsAt && part.endsAt
          ? [{ clubEventId: part.clubEventId, startAt: part.startsAt, endAt: part.endsAt, groupId: null }]
          : []
      })
      if (spans.length === 0) return lists
      const [posters, places] = await Promise.all([
        em.find(
          ClubEventFile,
          { ...scope, clubEventId: { $in: eventIds }, kind: 'poster', deletedAt: null },
          { fields: ['id', 'clubEventId'] },
        ),
        placesById(
          container,
          scope,
          clubEvents.map((event) => event.placeId),
          em,
        ),
      ])
      const items = publicClubEventItems({
        events: clubEvents.map((event) => ({
          id: event.id,
          name: event.name,
          slug: event.publicSlug,
          sectionId: event.sectionId ?? null,
          placeId: event.placeId,
          status: event.status,
        })),
        spans,
        posters: new Map(posters.map((file) => [file.clubEventId, file.id])),
        sectionSlugs: new Map(ctx.sections.map((section) => [section.id, section.slug])),
        publicGroupIds: new Set(groups.map((group) => group.id)),
        filtered: ctx.filtered === true,
        places,
        timeZone,
        today,
      })
      return withClubEvents(lists, items)
    },

    clubEvent: readClubEvent,

    async clubEventFile(ctx, eventSlug, fileId): Promise<PublicClubEventFile | null> {
      if (!UUID_PATTERN.test(fileId)) return null
      // The same rule as the page (public, with a live part): no file of an event whose page answers 404.
      if (!(await readClubEvent(ctx, eventSlug))) return null
      const scope = scopeOf(ctx)
      const em = fork()
      const event = await publishedClubEvent(em, scope, eventSlug)
      if (!event) return null
      // Only the poster and the logos stream here as they are; a picture (`photo`, `graphic`) is public only under
      // BR-I01 of the event photos spec, checked separately, so no picture row is ever reachable without it.
      const file = await em.findOne(ClubEventFile, {
        ...scope,
        id: fileId,
        clubEventId: event.id,
        kind: { $in: [...PUBLIC_FILE_KINDS] },
        deletedAt: null,
      })
      if (!file) return null
      return {
        attachmentId: file.attachmentId,
        owner: { entityId: CLUB_EVENT_FILE_OWNER_ENTITY, recordId: event.id },
        assignment: { type: CLUB_EVENT_FILE_ASSIGNMENT, id: file.id },
        mimeType: file.mimeType,
      }
    },
  }

  async function readClubEvent(ctx: PublicClubBlockContext, eventSlug: string): Promise<PublicClubEvent | null> {
    const scope = scopeOf(ctx)
    const em = fork()
    const event = await publishedClubEvent(em, scope, eventSlug)
    if (!event) return null
    const { parts, sessions } = await liveParts(em, scope, [event.id])
    if (parts.length === 0) return null
    const sessionList = [...sessions.values()]
    const [groups, publicGroupRows, teams, places, files, timeZone] = await Promise.all([
      findGroups(
        container,
        scope,
        sessionList.map((session) => session.groupId),
        em,
      ),
      ctx.sections.length > 0
        ? publicGroups(
            container,
            scope,
            ctx.sections.map((section) => section.id),
            em,
          )
        : Promise.resolve([]),
      findExternalTeams(
        container,
        scope,
        parts.flatMap((part) => part.visitingTeamIds),
        em,
      ),
      placesById(container, scope, [event.placeId], em),
      em.find(ClubEventFile, {
        ...scope,
        clubEventId: event.id,
        kind: { $in: [...PUBLIC_FILE_KINDS] },
        deletedAt: null,
      }),
      clubTimeZone(container, scope),
    ])
    return publicClubEventView({
      event: {
        name: event.name,
        slug: event.publicSlug,
        status: event.status,
        description: event.description ?? null,
      },
      place: places.get(event.placeId) ?? null,
      parts: parts.map((part) => ({
        title: part.title,
        categoryLabel: part.categoryLabel ?? null,
        type: part.type,
        activityId: part.activityId ?? null,
        startsAt: part.startsAt ?? null,
        endsAt: part.endsAt ?? null,
        status: part.status ?? null,
        visitingTeamIds: part.visitingTeamIds,
      })),
      sessions,
      groups: new Map(
        [...groups.values()].map((group) => [group.id, { name: group.name, sectionId: group.sectionId }]),
      ),
      publicGroupIds: new Set(publicGroupRows.map((group) => group.id)),
      sectionSlugs: new Map(ctx.sections.map((section) => [section.id, section.slug])),
      teams,
      files: files.map((file) => ({
        id: file.id,
        kind: file.kind,
        funderName: file.funderName ?? null,
        position: file.position,
        createdAt: file.createdAt,
      })),
      timeZone,
    })
  }
}
