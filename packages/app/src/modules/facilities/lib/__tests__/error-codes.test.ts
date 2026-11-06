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
      'entry_ban_period_invalid',
    ])
    for (const entry of errorCodes) {
      expect(entry.messageKey).toBe(`facilities.errors.${entry.code}`)
      expect([409, 422]).toContain(entry.status)
    }
  })
})
