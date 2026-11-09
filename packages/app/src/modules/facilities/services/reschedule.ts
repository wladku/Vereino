// The reschedule flags a blocking window sets after its commit (facilities spec the `facilities.closure.created` and
// `facilities.maintenance.scheduled` rows of *Events*; DD-20, DD-43; #121, #122, #123, #128): a closure or a planned
// maintenance window marks the planned sessions, the rentals holding their slot and the confirmed internal bookings
// under it `needs_reschedule`, each in a transaction of its own, so no transaction holding the occupancy lock waits for
// an `activities` row. Sessions are flagged on the place and its sub-places (a session points at a leaf); rentals and
// bookings on its ancestors too (they may hold the whole parent place). A flag is set only where it is false.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { flagInternalBookingsForReschedule, flagRentalsForReschedule } from '../data/queries'
import { emitFacilitiesEvent } from '../events'
import type { RescheduleCounts } from '../lib/closures'
import { flagSessionsForReschedule, placeFamily, type FacilitiesScope } from './directory'

export async function flagUnderWindow(
  container: AwilixContainer,
  scope: FacilitiesScope,
  placeId: string,
  window: { start: Date; end: Date },
): Promise<RescheduleCounts> {
  const family = await placeFamily(container, scope, placeId)
  const placeIds = [placeId, ...(family?.descendantIds ?? [])]
  const flagged = await flagSessionsForReschedule(container, scope, placeIds, window)
  const familyIds = [...placeIds, ...(family?.ancestorIds ?? [])]
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
  return { sessions: flagged.length, rentals: rentals.length, bookings: bookings.length }
}
