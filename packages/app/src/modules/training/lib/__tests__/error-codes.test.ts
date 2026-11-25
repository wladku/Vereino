import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'

describe('training error codes', () => {
  it('declares every code with a training message key and an S6.7 status', () => {
    expect(errorCodes.map((entry) => entry.code)).toEqual([
      'outline_exists',
      'outline_locked',
      'outline_reference_invalid',
      'outline_activity_not_recurring',
      'outline_image_missing',
      'outline_image_format_unsupported',
      'outline_image_too_large',
      'outline_images_limit_reached',
      'outline_exercise_not_found',
      'library_not_configured',
      'visibility_above_club_level',
      'library_terms_required',
      'library_entry_not_found',
      'outline_not_published',
      'rating_requires_use',
      'library_report_exists',
    ])
    for (const entry of errorCodes) {
      expect(entry.messageKey).toBe(`training.errors.${entry.code}`)
      expect([403, 404, 409, 422]).toContain(entry.status)
    }
  })
})
