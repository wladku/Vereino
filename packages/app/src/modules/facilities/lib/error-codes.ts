// Error codes owned by `facilities` (engineering standards S6.7; facilities spec *API, Command, and Error Contracts*;
// #121). Thrown through `api/errors.ts`. An inverted validity period answers the foundation's `validity_inverted`, a
// stale lock token the platform's `optimistic_lock_conflict`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'facilities_reference_invalid', status: 422, messageKey: 'facilities.errors.facilities_reference_invalid' },
  // Zones (glossary *Zone*): equal priority and overlap → 409 on save.
  { code: 'zone_rule_overlap', status: 409, messageKey: 'facilities.errors.zone_rule_overlap' },
  { code: 'zone_rule_times_invalid', status: 422, messageKey: 'facilities.errors.zone_rule_times_invalid' },
  // Booking availability (REQ-029): 422 per day.
  { code: 'availability_time_order', status: 422, messageKey: 'facilities.errors.availability_time_order' },
  { code: 'availability_too_short', status: 422, messageKey: 'facilities.errors.availability_too_short' },
  {
    code: 'availability_outside_opening_hours',
    status: 422,
    messageKey: 'facilities.errors.availability_outside_opening_hours',
  },
  { code: 'availability_days_invalid', status: 422, messageKey: 'facilities.errors.availability_days_invalid' },
  // Closures (DD-22).
  { code: 'closure_period_invalid', status: 422, messageKey: 'facilities.errors.closure_period_invalid' },
  // Rental rates.
  { code: 'rental_rate_season_invalid', status: 422, messageKey: 'facilities.errors.rental_rate_season_invalid' },
  { code: 'rental_rate_overlap', status: 409, messageKey: 'facilities.errors.rental_rate_overlap' },
] as const satisfies ErrorCodeTable

export type FacilitiesErrorCode = (typeof errorCodes)[number]['code']
