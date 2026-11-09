import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Events of `facilities` (facilities spec *Events, Jobs, Notifications*; #121, #122, #123, #125): payloads carry ids only (S4.6), plus
 * `placeId` for the events that change occupancy. `facilities.zone_rules.bulk_updated` has no subscriber in 1.0: the
 * public calendar has no server-side cache to invalidate (DD-45).
 */
const events = [
  { id: 'facilities.zone_rule.created', label: 'Zone rule created', entity: 'zone_rule', category: 'crud' },
  { id: 'facilities.zone_rule.updated', label: 'Zone rule updated', entity: 'zone_rule', category: 'crud' },
  { id: 'facilities.zone_rule.deleted', label: 'Zone rule deleted', entity: 'zone_rule', category: 'crud' },
  {
    id: 'facilities.zone_rules.bulk_updated',
    label: 'Booking availability set',
    entity: 'zone_rule',
    category: 'custom',
  },
  { id: 'facilities.closure.created', label: 'Closure created', entity: 'closure', category: 'crud' },
  { id: 'facilities.closure.updated', label: 'Closure updated', entity: 'closure', category: 'crud' },
  { id: 'facilities.closure.deleted', label: 'Closure deleted', entity: 'closure', category: 'crud' },
  { id: 'facilities.rental_rate.created', label: 'Rental rate created', entity: 'rental_rate', category: 'crud' },
  { id: 'facilities.rental_rate.updated', label: 'Rental rate updated', entity: 'rental_rate', category: 'crud' },
  { id: 'facilities.rental_rate.deleted', label: 'Rental rate deleted', entity: 'rental_rate', category: 'crud' },
  { id: 'facilities.rental.requested', label: 'Rental entered', entity: 'rental', category: 'custom' },
  { id: 'facilities.rental.confirmed', label: 'Rental confirmed', entity: 'rental', category: 'custom' },
  { id: 'facilities.rental.cancelled', label: 'Rental cancelled', entity: 'rental', category: 'custom' },
  { id: 'facilities.rental.moved', label: 'Rental moved', entity: 'rental', category: 'custom' },
  { id: 'facilities.rental.no_show', label: 'Rental no-show recorded', entity: 'rental', category: 'custom' },
  { id: 'facilities.rental.done', label: 'Rental completed', entity: 'rental', category: 'custom' },
  { id: 'facilities.rental.updated', label: 'Rental updated', entity: 'rental', category: 'crud' },
  // Online requests (#125): ids only (DD-44: never the token).
  {
    id: 'facilities.rental.request_submitted',
    label: 'Booking request submitted',
    entity: 'rental',
    category: 'custom',
  },
  {
    id: 'facilities.rental.request_verified',
    label: 'Booking request confirmed',
    entity: 'rental',
    category: 'custom',
  },
  { id: 'facilities.rental.approved', label: 'Booking request approved', entity: 'rental', category: 'custom' },
  { id: 'facilities.rental.rejected', label: 'Booking request rejected', entity: 'rental', category: 'custom' },
  { id: 'facilities.rental.expired', label: 'Booking request expired', entity: 'rental', category: 'custom' },
  {
    id: 'facilities.rental.superseded',
    label: 'Request superseded by a club booking',
    entity: 'rental',
    category: 'custom',
  },
  {
    id: 'facilities.internal_booking.created',
    label: 'Internal booking created',
    entity: 'internal_booking',
    category: 'crud',
  },
  {
    id: 'facilities.internal_booking.cancelled',
    label: 'Internal booking cancelled',
    entity: 'internal_booking',
    category: 'custom',
  },
  {
    id: 'facilities.internal_booking.updated',
    label: 'Internal booking updated',
    entity: 'internal_booking',
    category: 'crud',
  },
  { id: 'facilities.entry_ban.created', label: 'Entry ban issued', entity: 'entry_ban', category: 'crud' },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'facilities', events })

/** Type-safe emitter for `facilities` events. */
export const emitFacilitiesEvent = eventsConfig.emit

export type FacilitiesEventId = (typeof events)[number]['id']

export default eventsConfig
