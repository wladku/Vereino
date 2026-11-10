import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'

describe('facilities error codes', () => {
  it('declares every code with a facilities message key and an S6.7 status', () => {
    expect(errorCodes.map((entry) => entry.code)).toEqual([
      'facilities_reference_invalid',
      'zone_rule_overlap',
      'zone_rule_times_invalid',
      'availability_time_order',
      'availability_too_short',
      'availability_outside_opening_hours',
      'availability_days_invalid',
      'closure_period_invalid',
      'rental_rate_season_invalid',
      'rental_rate_overlap',
      'rental_units_invalid',
      'rental_rate_missing',
      'rental_renter_invalid',
      'zone_not_reservable',
      'rental_conflict',
      'place_closed',
      'entry_ban_active',
      'rental_start_past',
      'rental_not_started',
      'booking_period_invalid',
      'booking_start_past',
      'booking_section_invalid',
      'entry_ban_period_invalid',
      'entry_ban_revoked',
      'log_date_invalid',
      'log_exists',
      'log_edit_closed',
      'log_condition_required',
      'log_not_opened',
      'log_period_invalid',
      'log_groups_invalid',
      'incident_description_length',
      'incident_time_future',
      'public_place_not_found',
      'public_places_disabled',
      'public_schedule_month_invalid',
      'slot_unavailable',
      'requests_not_accepted',
      'request_zone_invalid',
      'request_regulations_required',
      'request_refused',
      'request_hold_expired',
      'request_renter_required',
      'rental_amount_note_required',
      'maintenance_scheduled',
      'maintenance_window_invalid',
      'maintenance_schedule_invalid',
      'maintenance_usage_threshold_invalid',
      'maintenance_task_closed',
      'maintainer_exists',
      'maintainer_person_invalid',
      'report_period_order',
      'report_period_too_long',
    ])
    for (const entry of errorCodes) {
      expect(entry.messageKey).toBe(`facilities.errors.${entry.code}`)
      expect([400, 403, 404, 409, 422]).toContain(entry.status)
    }
  })
})
