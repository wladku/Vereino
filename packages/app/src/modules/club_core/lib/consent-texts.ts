// The club's consent texts (club spec DD-39; people life-cycle spec REQ-L10, DD-L11; #309): per consent key the club's
// own wording, stored with the instant of its last change in `club_core_club_settings.consent_texts`. An empty text
// removes the key, so the built-in text applies again. Changing a text never withdraws a consent: a consent given
// before `changedAt` is shown as "given to an earlier wording" by the module that owns it. Time is a parameter (S3.5).

/**
 * The consents whose wording the club may change: the four of a guardianship or of an adult participant (`medical`:
 * the sports medical certificate date, #682), and the three a member gives in their profile (REQ-037, REQ-006, DD-29).
 */
export const CONSENT_TEXT_KEYS = [
  'regulations',
  'image',
  'trips',
  'medical',
  'share_contact_with_coaches',
  'share_presence_with_guardians',
  'publish_name_consent',
] as const
export type ConsentTextKey = (typeof CONSENT_TEXT_KEYS)[number]

/** The longest club text, in characters after trimming (people life-cycle spec *Consent wording*). */
export const CONSENT_TEXT_MAX_LENGTH = 1000

/** One club text: the wording and the instant it was last changed (ISO 8601). */
export type ConsentText = { readonly text: string; readonly changedAt: string }
export type ConsentTexts = { readonly [key in ConsentTextKey]?: ConsentText }

/** A requested change per key: the new wording, or an empty string to restore the built-in text. */
export type ConsentTextsPatch = { readonly [key in ConsentTextKey]?: string }

function storedText(value: unknown): ConsentText | null {
  if (value === null || typeof value !== 'object') return null
  const { text, changedAt } = value as Record<string, unknown>
  if (typeof text !== 'string' || text.trim().length === 0) return null
  if (typeof changedAt !== 'string' || Number.isNaN(Date.parse(changedAt))) return null
  return { text, changedAt }
}

/** The well-formed texts of a stored `consent_texts` value; unknown keys and malformed entries are dropped. */
export function parseConsentTexts(raw: unknown): ConsentTexts {
  if (raw === null || typeof raw !== 'object') return {}
  const result: Partial<Record<ConsentTextKey, ConsentText>> = {}
  for (const key of CONSENT_TEXT_KEYS) {
    const entry = storedText((raw as Record<string, unknown>)[key])
    if (entry) result[key] = entry
  }
  return result
}

/** The first key of the patch whose trimmed text is longer than the limit, or null when every text fits. */
export function consentTextTooLong(patch: ConsentTextsPatch): ConsentTextKey | null {
  for (const key of CONSENT_TEXT_KEYS) {
    const value = patch[key]
    if (value !== undefined && value.trim().length > CONSENT_TEXT_MAX_LENGTH) return key
  }
  return null
}

/**
 * The texts after a patch at `now`: a new wording is stored trimmed with `changedAt = now`, an empty one removes the
 * key, and a wording equal to the stored one keeps its `changedAt` (nothing changed, so no consent becomes "earlier").
 * Returns the keys that changed. The caller checks the length first (`consentTextTooLong`).
 */
export function applyConsentTextsPatch(
  current: ConsentTexts,
  patch: ConsentTextsPatch | undefined,
  now: Date,
): { texts: ConsentTexts; changed: ConsentTextKey[] } {
  const next: Partial<Record<ConsentTextKey, ConsentText>> = {}
  const changed: ConsentTextKey[] = []
  for (const key of CONSENT_TEXT_KEYS) {
    const stored = current[key]
    const value = patch?.[key]
    const text = value?.trim()
    if (text === undefined || text === stored?.text || (text.length === 0 && !stored)) {
      if (stored) next[key] = stored
      continue
    }
    // A new wording gets the instant of the change; an empty one leaves the key out (the built-in text applies).
    if (text.length > 0) next[key] = { text, changedAt: now.toISOString() }
    changed.push(key)
  }
  return { texts: next, changed }
}
