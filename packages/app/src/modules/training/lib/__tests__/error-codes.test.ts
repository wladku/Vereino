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
    ])
    for (const entry of errorCodes) {
      expect(entry.messageKey).toBe(`training.errors.${entry.code}`)
      expect([409, 422]).toContain(entry.status)
    }
  })
})
