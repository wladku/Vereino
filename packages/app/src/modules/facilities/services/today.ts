// "Today at the facility" (facilities spec the `GET /api/facilities/today` row, `/club/facility`; REQ-013, REQ-016;
// M-12; #126): for one place of the club — the one named, or the first — the day in the club's time zone, the day's
// log (with its version, the lock token of its update) and the planned sessions and the rentals on the place, its
// ancestors and descendants: each with its label (activity or renter) and, for a rental, its status, its version and
// whether a no-show may be recorded now (after the start, while `requested` or `confirmed`). A facility attendant
// chooses among the places of their grant only (#126). Encrypted columns are read with `findWithDecryption`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { addDays, calendarDateInZone, zonedInstant, type CalendarDate } from '@vereino/core'
import { FacilityLog, Rental } from '../data/entities'
import type { GroupPresent } from '../lib/logs'
import type { RentalStatus } from '../lib/rentals'
import { clubTimeZone, placeOptions, plannedSessions, type FacilitiesScope } from './directory'
import { placeFamilyIds } from './occupancy'

/** The rentals the attendant's day lists: the ones that hold the slot, and the ones already marked no-show or done. */
const TODAY_RENTAL_STATUSES: readonly RentalStatus[] = ['requested', 'confirmed', 'done', 'no_show']

/** The statuses a no-show may be recorded from (glossary *Rental statuses*). */
const NO_SHOW_FROM: readonly RentalStatus[] = ['requested', 'confirmed']

export type TodayLog = {
  id: string
  updatedAt: string
  openedAt: string | null
  closedAt: string | null
  conditionBefore: string | null
  conditionAfter: string | null
  groupsPresent: GroupPresent[]
  remarks: string | null
}

export type TodayEntry = {
  kind: 'session' | 'rental'
  id: string
  placeId: string
  start: string
  end: string
  /** The activity or the renter. */
  label: string | null
  status: RentalStatus | 'planned'
  /** A rental's version, the lock token of its no-show. */
  updatedAt: string | null
  canNoShow: boolean
}

export type Today = {
  timeZone: string
  date: CalendarDate
  places: Array<{ id: string; name: string; parentName: string | null }>
  place: { id: string; name: string } | null
  log: TodayLog | null
  entries: TodayEntry[]
}

/**
 * Null when `placeId` names no live place of the club; `forbidden` when it names a place outside `visiblePlaceIds` (the
 * attendant's places; null = every place).
 */
export async function facilityToday(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeId: string | undefined,
  now: Date,
  visiblePlaceIds: readonly string[] | null = null,
): Promise<Today | null | 'forbidden'> {
  const em = container.resolve<EntityManager>('em').fork()
  const timeZone = await clubTimeZone(container, scope)
  const date = calendarDateInZone(now, timeZone)
  const all = await placeOptions(container, scope)
  if (placeId && visiblePlaceIds && all.some((option) => option.id === placeId) && !visiblePlaceIds.includes(placeId)) {
    return 'forbidden'
  }
  const options = visiblePlaceIds ? all.filter((option) => visiblePlaceIds.includes(option.id)) : all
  const places = options.map((option) => ({ id: option.id, name: option.name, parentName: option.parentName }))
  const chosen = placeId ? options.find((option) => option.id === placeId) : options[0]
  if (placeId && !chosen) return null
  if (!chosen) return { timeZone, date, places, place: null, log: null, entries: [] }

  const window = {
    start: zonedInstant(date, '00:00', timeZone),
    end: zonedInstant(addDays(date, 1), '00:00', timeZone),
  }
  const familyIds = await placeFamilyIds(container, scope, chosen.id, em)
  const sessions = await plannedSessions(container, scope, familyIds, window, em)
  const rentals = await findWithDecryption(
    em,
    Rental,
    {
      ...scope,
      deletedAt: null,
      placeId: { $in: familyIds },
      status: { $in: [...TODAY_RENTAL_STATUSES] },
      startsAt: { $lt: window.end },
      endsAt: { $gt: window.start },
    },
    {},
    scope,
  )
  const logs = await findWithDecryption(
    em,
    FacilityLog,
    { ...scope, deletedAt: null, placeId: chosen.id, logDate: date },
    {},
    scope,
  )
  const log = logs[0] ?? null
  const entries: TodayEntry[] = [
    ...sessions.map((row) => ({
      kind: 'session' as const,
      id: row.id,
      placeId: row.placeId,
      start: row.startAt.toISOString(),
      end: row.endAt.toISOString(),
      label: row.activityName,
      status: 'planned' as const,
      updatedAt: null,
      canNoShow: false,
    })),
    ...rentals.map((row) => ({
      kind: 'rental' as const,
      id: row.id,
      placeId: row.placeId,
      start: row.startsAt.toISOString(),
      end: row.endsAt.toISOString(),
      label: row.renterDisplayName,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      canNoShow: NO_SHOW_FROM.includes(row.status) && row.startsAt.getTime() <= now.getTime(),
    })),
  ].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
  return {
    timeZone,
    date,
    places,
    place: { id: chosen.id, name: chosen.name },
    log: log
      ? {
          id: log.id,
          updatedAt: log.updatedAt.toISOString(),
          openedAt: log.openedAt?.toISOString() ?? null,
          closedAt: log.closedAt?.toISOString() ?? null,
          conditionBefore: log.conditionBefore ?? null,
          conditionAfter: log.conditionAfter ?? null,
          groupsPresent: log.groupsPresent,
          remarks: log.remarks ?? null,
        }
      : null,
    entries,
  }
}
