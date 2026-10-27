// Column options for P-06 Validity and P-08 ConsentRecord (foundation spec *Data Models*), used with the
// module's own decorators: `@Property(validFromColumn()) validFrom!: string`. Each call returns a fresh object
// because `@Property` mutates the options it receives.
import type { PropertyOptions } from '@mikro-orm/core'

/** `valid_from` date, required (`YYYY-MM-DD`, mapped to a string). */
export function validFromColumn(): PropertyOptions<object> {
  return { name: 'valid_from', type: 'date' }
}

/** `valid_to` date, optional: an empty end means open-ended. */
export function validToColumn(): PropertyOptions<object> {
  return { name: 'valid_to', type: 'date', nullable: true }
}

const CONSENT_NAME_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

/**
 * The `<consent>_at` timestamptz column of a consent (e.g. `share_contact_with_coaches` →
 * `share_contact_with_coaches_at`): set = granted at that instant, null = never granted or withdrawn; the row
 * is never deleted.
 */
export function consentColumn(consent: string): PropertyOptions<object> {
  if (!CONSENT_NAME_PATTERN.test(consent)) {
    throw new RangeError(`[internal] consent name ${JSON.stringify(consent)} must be lower snake_case`)
  }
  return { name: `${consent}_at`, type: Date, nullable: true }
}
