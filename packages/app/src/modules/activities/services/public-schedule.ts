// `activities.publicSchedule` (club spec DD-28, DD-29, REQ-025; #91): the schedule of the public groups on a section's
// public page, registered as an optional DI provider `club_core` reads with `hasRegistration`
// (`club_core/services/public-blocks.ts`). `club_core` calls it only for a club that publishes `description_schedule`,
// inside the tenant and organization its slug lookup found, and passes the public section; `groups` names the public
// groups among it. The club page no longer lists one-off events: they moved to P-06 (`activities.publicEvents`, #263). Every query carries that
// scope. A guest gets days, times, places, dates and cancellations — never a roster, a participant or a coach.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { calendarDateInZone } from '@vereino/core'
import type { PublicBlockProvider, PublicSectionBlockContext } from '../../club_core/services/public-blocks'
import { Activity, Occurrence } from '../data/entities'
import { publicScheduleBlock, type PublicScheduleBlock, type PublicSessionRow } from '../lib/public-schedule'
import { clubTimeZone, findPlaces, publicGroups, type ActivitiesScope } from './directory'

export const ACTIVITIES_PUBLIC_SCHEDULE = 'activities.publicSchedule' as const

/** The response key of the block on the section page. */
export const PUBLIC_SCHEDULE_KEY = 'schedule'

/** Upper bound of the session rows one page reads (16 weeks of a few series per group). */
const SESSION_READ_LIMIT = 1000

async function placeNames(
  container: AwilixContainer,
  scope: ActivitiesScope,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const places = await findPlaces(container, scope, [...new Set(ids)])
  return new Map([...places.values()].map((place) => [place.id, place.name]))
}

/** The future sessions of `activityIds`, in start order. */
async function futureSessions(
  em: EntityManager,
  scope: ActivitiesScope,
  activityIds: readonly string[],
  now: Date,
): Promise<PublicSessionRow[]> {
  const rows = await em.find(
    Occurrence,
    { ...scope, activityId: { $in: [...activityIds] }, startAt: { $gte: now }, deletedAt: null },
    {
      fields: ['id', 'activityId', 'groupId', 'startAt', 'endAt', 'placeId', 'status'],
      orderBy: { startAt: 'asc', id: 'asc' },
      limit: SESSION_READ_LIMIT,
    },
  )
  return rows.map((row) => ({
    activityId: row.activityId,
    groupId: row.groupId,
    startAt: row.startAt,
    endAt: row.endAt,
    placeId: row.placeId,
    status: row.status,
  }))
}

export function createPublicSchedule(container: AwilixContainer): PublicBlockProvider {
  return {
    block: 'description_schedule',
    key: PUBLIC_SCHEDULE_KEY,

    async sectionBlock(ctx: PublicSectionBlockContext): Promise<PublicScheduleBlock | null> {
      const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
      const groups = await publicGroups(container, scope, [ctx.sectionId])
      if (groups.length === 0) return null
      const groupIds = groups.map((group) => group.id)
      const em = container.resolve<EntityManager>('em').fork()
      const timeZone = await clubTimeZone(container, scope)
      const now = new Date()
      const today = calendarDateInZone(now, timeZone)
      const series = await em.find(
        Activity,
        {
          ...scope,
          groupId: { $in: groupIds },
          recurrenceRule: { $ne: null },
          isActive: true,
          deletedAt: null,
          $or: [{ endsOn: null }, { endsOn: { $gte: today } }],
        },
        {
          fields: ['id', 'groupId', 'recurrenceRule', 'defaultStartTime', 'defaultEndTime', 'defaultPlaceId'],
          orderBy: { defaultStartTime: 'asc', id: 'asc' },
        },
      )
      if (series.length === 0) return null
      const sessions = await futureSessions(
        em,
        scope,
        series.map((row) => row.id),
        now,
      )
      const places = await placeNames(container, scope, [
        ...series.map((row) => row.defaultPlaceId),
        ...sessions.map((row) => row.placeId),
      ])
      return publicScheduleBlock(
        groupIds,
        series.map((row) => ({
          id: row.id,
          groupId: row.groupId,
          recurrenceRule: row.recurrenceRule ?? null,
          defaultStartTime: row.defaultStartTime,
          defaultEndTime: row.defaultEndTime,
          defaultPlaceId: row.defaultPlaceId,
        })),
        sessions,
        places,
        timeZone,
      )
    },
  }
}
