// Error codes owned by `facilities` (engineering standards S6.7; facilities spec *API, Command, and Error Contracts*;
// #121, #122, #123, #124, #125). Thrown through `api/errors.ts`. An inverted validity period answers the foundation's `validity_inverted`, a
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
  // Rentals (glossary *Booking (external rental)*, B-24 validation; #122).
  { code: 'rental_units_invalid', status: 422, messageKey: 'facilities.errors.rental_units_invalid' },
  { code: 'rental_rate_missing', status: 422, messageKey: 'facilities.errors.rental_rate_missing' },
  { code: 'rental_renter_invalid', status: 422, messageKey: 'facilities.errors.rental_renter_invalid' },
  { code: 'zone_not_reservable', status: 409, messageKey: 'facilities.errors.zone_not_reservable' },
  { code: 'rental_conflict', status: 409, messageKey: 'facilities.errors.rental_conflict' },
  { code: 'place_closed', status: 409, messageKey: 'facilities.errors.place_closed' },
  { code: 'entry_ban_active', status: 409, messageKey: 'facilities.errors.entry_ban_active' },
  { code: 'rental_start_past', status: 422, messageKey: 'facilities.errors.rental_start_past' },
  { code: 'rental_not_started', status: 409, messageKey: 'facilities.errors.rental_not_started' },
  // Internal bookings (glossary *Internal booking*, REQ-023, M-11 validation; #123). An occupied slot answers
  // `rental_conflict` with the list (club spec), a closure or the opening hours `place_closed`.
  { code: 'booking_period_invalid', status: 422, messageKey: 'facilities.errors.booking_period_invalid' },
  { code: 'booking_start_past', status: 422, messageKey: 'facilities.errors.booking_start_past' },
  { code: 'booking_section_invalid', status: 422, messageKey: 'facilities.errors.booking_section_invalid' },
  // Entry bans (REQ-016).
  { code: 'entry_ban_period_invalid', status: 422, messageKey: 'facilities.errors.entry_ban_period_invalid' },
  { code: 'entry_ban_revoked', status: 409, messageKey: 'facilities.errors.entry_ban_revoked' },
  // The facility log (REQ-016, M-12, B-27; #126): one per place and day, editable until the end of the next day.
  { code: 'log_date_invalid', status: 422, messageKey: 'facilities.errors.log_date_invalid' },
  { code: 'log_exists', status: 409, messageKey: 'facilities.errors.log_exists' },
  { code: 'log_edit_closed', status: 403, messageKey: 'facilities.errors.log_edit_closed' },
  { code: 'log_condition_required', status: 422, messageKey: 'facilities.errors.log_condition_required' },
  { code: 'log_not_opened', status: 422, messageKey: 'facilities.errors.log_not_opened' },
  { code: 'log_period_invalid', status: 422, messageKey: 'facilities.errors.log_period_invalid' },
  { code: 'log_groups_invalid', status: 422, messageKey: 'facilities.errors.log_groups_invalid' },
  // Incidents (REQ-016, M-12): never deleted.
  { code: 'incident_description_length', status: 422, messageKey: 'facilities.errors.incident_description_length' },
  { code: 'incident_time_future', status: 422, messageKey: 'facilities.errors.incident_time_future' },
  // The public facility calendar (P-03, P-04, TEST-024; #124): an unknown club, place or a place that is not public
  // answer the same 404; a club that does not publish its places calendar answers its own 404; a month outside the
  // readable range 400.
  { code: 'public_place_not_found', status: 404, messageKey: 'facilities.errors.public_place_not_found' },
  { code: 'public_places_disabled', status: 404, messageKey: 'facilities.errors.public_places_disabled' },
  { code: 'public_schedule_month_invalid', status: 400, messageKey: 'facilities.errors.public_schedule_month_invalid' },
  // Online requests (P-04, P-05, B-25, TEST-035, TEST-036; #125): a slot taken or held by another confirmed request
  // answers 409 `slot_unavailable`; the place or the club not taking requests 403; a request outside the `reservable_paid`
  // zone, without the rules accepted, starting in the past or with the honeypot filled 422. An unknown, used or expired
  // link answers the foundation's 410 `token_link_expired` / `token_link_used`. On B-25 a request whose hold lapsed
  // answers 409 `request_hold_expired`, an approval without a renter 422 `request_renter_required` and a changed amount
  // without a note 422 `rental_amount_note_required`.
  { code: 'slot_unavailable', status: 409, messageKey: 'facilities.errors.slot_unavailable' },
  { code: 'requests_not_accepted', status: 403, messageKey: 'facilities.errors.requests_not_accepted' },
  { code: 'request_zone_invalid', status: 422, messageKey: 'facilities.errors.request_zone_invalid' },
  { code: 'request_regulations_required', status: 422, messageKey: 'facilities.errors.request_regulations_required' },
  { code: 'request_refused', status: 422, messageKey: 'facilities.errors.request_refused' },
  { code: 'request_hold_expired', status: 409, messageKey: 'facilities.errors.request_hold_expired' },
  { code: 'request_renter_required', status: 422, messageKey: 'facilities.errors.request_renter_required' },
  { code: 'rental_amount_note_required', status: 422, messageKey: 'facilities.errors.rental_amount_note_required' },
  // Maintenance (REQ-022, DD-36, TEST-049, TEST-050; #128): a new entry in a planned maintenance window answers 409
  // `maintenance_scheduled`; a task's window, schedule and usage threshold 422; a planned task only is changed or completed.
  { code: 'maintenance_scheduled', status: 409, messageKey: 'facilities.errors.maintenance_scheduled' },
  { code: 'maintenance_window_invalid', status: 422, messageKey: 'facilities.errors.maintenance_window_invalid' },
  { code: 'maintenance_schedule_invalid', status: 422, messageKey: 'facilities.errors.maintenance_schedule_invalid' },
  {
    code: 'maintenance_usage_threshold_invalid',
    status: 422,
    messageKey: 'facilities.errors.maintenance_usage_threshold_invalid',
  },
  { code: 'maintenance_task_closed', status: 409, messageKey: 'facilities.errors.maintenance_task_closed' },
  { code: 'maintainer_exists', status: 409, messageKey: 'facilities.errors.maintainer_exists' },
  { code: 'maintainer_person_invalid', status: 422, messageKey: 'facilities.errors.maintainer_person_invalid' },
] as const satisfies ErrorCodeTable

export type FacilitiesErrorCode = (typeof errorCodes)[number]['code']
