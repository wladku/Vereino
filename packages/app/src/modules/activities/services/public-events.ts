// `activities.publicEvents` (navigation spec REQ-N13; #263): the one-off activities of public groups in public sections
// for the public Events page P-06, registered as an optional DI contribution `club_core` reads with `hasRegistration`
// (`club_core/services/public-blocks.ts`). `club_core` calls it only for a club that publishes its page and the `events`
// block, inside the tenant and organization its slug lookup found, and passes the public sections the page shows. Every
// query carries that scope. A guest gets names, types, dates, times, places and cancellations — never a roster, a
// participant, an opponent's contact or a coach.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { calendarDateInZone } from '@vereino/core'
import type { PublicClubBlockContext, PublicEventsProvider } from '../../club_core/services/public-blocks'
import { Activity, Occurrence } from '../data/entities'
import { pastEventsFrom, publicEventLists, type PublicEventPlace } from '../lib/public-events'
import { clubTimeZone, findPlaces, publicGroups } from './directory'

export const ACTIVITIES_PUBLIC_EVENTS = 'activities.publicEvents' as const

/** Upper bound of the session rows one page reads (60 days back and the club's whole planned future of events). */
const SESSION_READ_LIMIT = 1000

const NONE = { upcoming: [], past: [] }

export function createPublicEvents(container: AwilixContainer): PublicEventsProvider {
  return {
    async events(ctx: PublicClubBlockContext) {
      if (ctx.sections.length === 0) return NONE
      const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
      const groups = await publicGroups(
        container,
        scope,
        ctx.sections.map((section) => section.id),
      )
      if (groups.length === 0) return NONE
      const em = container.resolve<EntityManager>('em').fork()
      const events = await em.find(
        Activity,
        {
          ...scope,
          groupId: { $in: groups.map((group) => group.id) },
          recurrenceRule: null,
          isActive: true,
          deletedAt: null,
        },
        { fields: ['id', 'name', 'type', 'sectionId'] },
      )
      if (events.length === 0) return NONE
      const timeZone = await clubTimeZone(container, scope)
      const today = calendarDateInZone(new Date(), timeZone)
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
          fields: ['id', 'activityId', 'groupId', 'startAt', 'endAt', 'placeId', 'status'],
          orderBy: { startAt: 'asc', id: 'asc' },
          limit: SESSION_READ_LIMIT,
        },
      )
      if (sessions.length === 0) return NONE
      const found = await findPlaces(container, scope, [...new Set(sessions.map((row) => row.placeId))])
      const places = new Map<string, PublicEventPlace>(
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
      return publicEventLists(
        events.map((event) => ({ id: event.id, name: event.name, type: event.type, sectionId: event.sectionId })),
        sessions.map((row) => ({
          activityId: row.activityId,
          groupId: row.groupId,
          startAt: row.startAt,
          endAt: row.endAt,
          placeId: row.placeId,
          status: row.status,
        })),
        new Map(ctx.sections.map((section) => [section.id, section.slug])),
        places,
        timeZone,
        today,
      )
    },
  }
}
