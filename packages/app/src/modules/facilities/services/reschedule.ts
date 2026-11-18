// The reschedule flags a blocking window sets after its commit (facilities spec the `facilities.closure.created` and
// `facilities.maintenance.scheduled` rows of *Events*; DD-20, DD-43; #121, #122, #123, #128): a closure or a planned
// maintenance window marks the planned sessions, the rentals holding their slot and the confirmed internal bookings
// under it `needs_reschedule`, each in a transaction of its own, so no transaction holding the occupancy lock waits for
// an `activities` row. Sessions are flagged on the place and its sub-places (a session points at a leaf); rentals and
// bookings on its ancestors too (they may hold the whole parent place). A flag is set only where it is false.
//
// The flagged entries under the window that are new to the cause — not under its window before this save — are then
// announced to the people who must move them (`reschedule-notice.ts`, facilities parity spec REQ-R18; #287): an entry
// flagged earlier by another cause is announced again as this cause's, one already under this cause's previous window
// is not. A failed notice is logged and never fails the committed save.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { InternalBooking, Rental } from '../data/entities'
import { flagInternalBookingsForReschedule, flagRentalsForReschedule } from '../data/queries'
import { emitFacilitiesEvent } from '../events'
import type { RescheduleCounts } from '../lib/closures'
import { announcedBefore, type RescheduleCause, type WindowPlaces } from '../lib/reschedule-notice'
import { flagSessionsForReschedule, placeFamily, plannedSessions, type FacilitiesScope } from './directory'
import { notifyRescheduleNeeded, type FlaggedIds } from './reschedule-notice'

const logger = createLogger('facilities').child({ component: 'reschedule' })

async function windowPlaces(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeId: string,
): Promise<WindowPlaces> {
  const family = await placeFamily(container, scope, placeId)
  const sessionPlaceIds = [placeId, ...(family?.descendantIds ?? [])]
  return {
    sessionPlaceIds: new Set(sessionPlaceIds),
    familyIds: new Set([...sessionPlaceIds, ...(family?.ancestorIds ?? [])]),
  }
}

export async function flagUnderWindow(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeId: string,
  window: { start: Date; end: Date },
  cause: RescheduleCause,
): Promise<RescheduleCounts> {
  const places = await windowPlaces(container, scope, placeId)
  const placeIds = [...places.sessionPlaceIds]
  const flagged = await flagSessionsForReschedule(container, scope, placeIds, window)
  const familyIds = [...places.familyIds]
  const em = container.resolve<EntityManager>('em').fork()
  const rentals = await em.transactional((tx) => flagRentalsForReschedule(tx, scope, familyIds, window))
  for (const rental of rentals) {
    await emitFacilitiesEvent('facilities.rental.updated', { ...rental, ...scope }, { persistent: true, ...scope })
  }
  const bookings = await em.transactional((tx) => flagInternalBookingsForReschedule(tx, scope, familyIds, window))
  for (const booking of bookings) {
    await emitFacilitiesEvent(
      'facilities.internal_booking.updated',
      { ...booking, ...scope },
      { persistent: true, ...scope },
    )
  }
  try {
    const entries = await newToCause(container, scope, places, window, cause)
    await notifyRescheduleNeeded(container, scope, cause, entries)
  } catch (error: unknown) {
    logger.warn('Reschedule notices failed after the entries were flagged', {
      causeId: cause.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return { sessions: flagged.length, rentals: rentals.length, bookings: bookings.length }
}

/** The flagged entries under the window, without those that lay under the cause's previous window. */
async function newToCause(
  container: AwilixContainer,
  scope: FacilitiesScope,
  places: WindowPlaces,
  window: { start: Date; end: Date },
  cause: RescheduleCause,
): Promise<FlaggedIds> {
  const em = container.resolve<EntityManager>('em').fork()
  const overlap = { startsAt: { $lt: window.end }, endsAt: { $gt: window.start } }
  const sessions = (await plannedSessions(container, scope, [...places.sessionPlaceIds], window, em))
    .filter((session) => session.needsReschedule)
    .map((session) => ({
      kind: 'session' as const,
      id: session.id,
      placeId: session.placeId,
      startsAt: session.startAt,
      endsAt: session.endAt,
    }))
  const rentals = await em.find(
    Rental,
    {
      ...scope,
      ...overlap,
      deletedAt: null,
      needsReschedule: true,
      status: { $in: ['requested', 'confirmed'] },
      placeId: { $in: [...places.familyIds] },
    },
    { fields: ['id', 'placeId', 'startsAt', 'endsAt'] },
  )
  const bookings = await em.find(
    InternalBooking,
    {
      ...scope,
      ...overlap,
      deletedAt: null,
      needsReschedule: true,
      status: 'confirmed',
      placeId: { $in: [...places.familyIds] },
    },
    { fields: ['id', 'placeId', 'startsAt', 'endsAt'] },
  )
  const previous = cause.previous
    ? {
        ...(await windowPlaces(container, scope, cause.previous.placeId)),
        start: cause.previous.start,
        end: cause.previous.end,
      }
    : null
  const fresh = <T extends { id: string }>(
    kind: 'session' | 'rental' | 'booking',
    rows: readonly (T & {
      placeId: string
      startsAt: Date
      endsAt: Date
    })[],
  ) => rows.filter((row) => !announcedBefore({ kind, ...row }, previous)).map((row) => row.id)
  return {
    sessions: fresh('session', sessions),
    rentals: fresh('rental', rentals),
    bookings: fresh('booking', bookings),
  }
}
