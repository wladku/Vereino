import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Events of `facilities` (facilities spec *Events, Jobs, Notifications*; #121): payloads carry ids only (S4.6), plus
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
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'facilities', events })

/** Type-safe emitter for `facilities` events. */
export const emitFacilitiesEvent = eventsConfig.emit

export type FacilitiesEventId = (typeof events)[number]['id']

export default eventsConfig
