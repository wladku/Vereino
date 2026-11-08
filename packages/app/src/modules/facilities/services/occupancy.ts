// `facilities.occupancyService` (facilities spec glossary *Slot occupancy*, DD-20, DD-25, DD-43; #122): one place
// for what occupies a place in a window — the planned sessions of `activities`, the rentals that hold their slot
// (`requested`, `confirmed`), the confirmed internal bookings (#123) and the closures — on the place, its ancestors
// and its descendants. `occupancyEntries`
// serves the rental commands and the quote and reads with the caller's EntityManager, so under the occupancy lock it
// sees the caller's uncommitted rows. `blockingIntervals` is the `vereino.occupancyProvider` implementation the session
// preview and save consult (foundation II P-26): rentals, internal bookings and closures, because `activities` checks
// its own sessions; maintenance windows join with E08-S08.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { BlockingInterval, OccupancyContext, OccupancyProvider } from '@/modules/foundation'
import { Closure, InternalBooking, Rental } from '../data/entities'
import { OCCUPYING_BOOKING_STATUSES } from '../lib/internal-bookings'
import { OCCUPYING_RENTAL_STATUSES, overlappingEntries, type OccupancyEntry } from '../lib/rentals'
import { placeFamily, plannedSessions, type FacilitiesScope } from './directory'

export const FACILITIES_OCCUPANCY_SERVICE = 'facilities.occupancyService' as const

type Window = { start: Date; end: Date }

/** The place and every place whose occupancy blocks it (ancestors and descendants); just the place if it is unknown. */
export async function placeFamilyIds(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeId: string,
  em?: EntityManager,
): Promise<string[]> {
  const family = await placeFamily(container, scope, placeId, em)
  return family ? [placeId, ...family.ancestorIds, ...family.descendantIds] : [placeId]
}

async function facilityEntries(
  em: EntityManager,
  scope: FacilitiesScope,
  placeIds: readonly string[],
  window: Window,
): Promise<OccupancyEntry[]> {
  if (placeIds.length === 0) return []
  const overlapping = { startsAt: { $lt: window.end }, endsAt: { $gt: window.start } }
  const where = { ...scope, deletedAt: null, placeId: { $in: [...new Set(placeIds)] }, ...overlapping }
  // One query after the other: a transactional EntityManager runs on one connection.
  const rentals = await em.find(
    Rental,
    { ...where, status: { $in: [...OCCUPYING_RENTAL_STATUSES] } },
    { fields: ['id', 'placeId', 'startsAt', 'endsAt'] },
  )
  const bookings = await em.find(
    InternalBooking,
    { ...where, status: { $in: [...OCCUPYING_BOOKING_STATUSES] } },
    { fields: ['id', 'placeId', 'startsAt', 'endsAt'] },
  )
  const closures = await em.find(Closure, where, { fields: ['id', 'placeId', 'startsAt', 'endsAt'] })
  return [
    ...rentals.map((row) => ({
      id: row.id,
      kind: 'rental' as const,
      placeId: row.placeId,
      start: row.startsAt,
      end: row.endsAt,
    })),
    ...bookings.map((row) => ({
      id: row.id,
      kind: 'booking' as const,
      placeId: row.placeId,
      start: row.startsAt,
      end: row.endsAt,
    })),
    ...closures.map((row) => ({
      id: row.id,
      kind: 'closure' as const,
      placeId: row.placeId,
      start: row.startsAt,
      end: row.endsAt,
    })),
  ]
}

/**
 * Everything that occupies the place family in the window, except `ignoreIds` (the rental being moved), by start.
 * Reads with `em`, the caller's transactional EntityManager.
 */
export async function occupancyEntries(
  container: AwilixContainer,
  em: EntityManager,
  scope: FacilitiesScope,
  placeId: string,
  window: Window,
  ignoreIds: readonly string[] = [],
): Promise<OccupancyEntry[]> {
  const placeIds = await placeFamilyIds(container, scope, placeId, em)
  const sessions = await plannedSessions(container, scope, placeIds, window, em)
  const others = await facilityEntries(em, scope, placeIds, window)
  const sessionEntries: OccupancyEntry[] = sessions.map((session) => ({
    id: session.id,
    kind: 'session',
    placeId: session.placeId,
    start: session.startAt,
    end: session.endAt,
  }))
  return overlappingEntries([...sessionEntries, ...others], window, ignoreIds)
}

/** The reason a session's 409 `occurrence_place_conflict` shows for each facility entry (DD-20). */
const PROVIDER_REASONS: Record<Exclude<OccupancyEntry['kind'], 'session'>, BlockingInterval['reason']> = {
  rental: 'rental',
  booking: 'booking',
  closure: 'closure',
}

/**
 * The DI service: the `vereino.occupancyProvider` contract (rentals, internal bookings and closures as blocking
 * intervals). The rental
 * commands and the quote call `occupancyEntries` with the request container and their transactional EntityManager.
 */
export type FacilitiesOccupancyService = OccupancyProvider

export function createOccupancyService(getEm: () => EntityManager): FacilitiesOccupancyService {
  return {
    async blockingIntervals(placeIds, window, ctx: OccupancyContext): Promise<BlockingInterval[]> {
      const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
      const entries = await facilityEntries(getEm().fork(), scope, placeIds, window)
      return entries.map((entry) => ({
        id: entry.id,
        resourceId: entry.placeId,
        start: entry.start,
        end: entry.end,
        reason: PROVIDER_REASONS[entry.kind as Exclude<OccupancyEntry['kind'], 'session'>],
      }))
    },
  }
}
