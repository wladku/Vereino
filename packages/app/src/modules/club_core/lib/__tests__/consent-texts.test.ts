import { describe, expect, it } from '@jest/globals'
import {
  CONSENT_TEXT_KEYS,
  CONSENT_TEXT_MAX_LENGTH,
  applyConsentTextsPatch,
  consentTextTooLong,
  parseConsentTexts,
} from '../consent-texts'

const at = '2026-11-01T10:00:00.000Z'
const now = new Date('2026-11-19T08:30:00.000Z')

describe('consent text keys (DD-39, REQ-L10)', () => {
  it('lists the seven consents whose wording the club may change', () => {
    expect(CONSENT_TEXT_KEYS).toEqual([
      'regulations',
      'image',
      'trips',
      'medical',
      'share_contact_with_coaches',
      'share_presence_with_guardians',
      'publish_name_consent',
    ])
    expect(CONSENT_TEXT_MAX_LENGTH).toBe(1000)
  })
})

describe('parseConsentTexts', () => {
  it('keeps well-formed entries of known keys', () => {
    expect(
      parseConsentTexts({ image: { text: 'Photos', changedAt: at }, other: { text: 'x', changedAt: at } }),
    ).toEqual({ image: { text: 'Photos', changedAt: at } })
  })

  it('drops malformed entries and values', () => {
    expect(parseConsentTexts(null)).toEqual({})
    expect(parseConsentTexts('text')).toEqual({})
    expect(
      parseConsentTexts({
        regulations: null,
        image: 'Photos',
        trips: { text: 3, changedAt: at },
        share_contact_with_coaches: { text: '   ', changedAt: at },
        share_presence_with_guardians: { text: 'Presence', changedAt: 'yesterday' },
        publish_name_consent: { text: 'Name', changedAt: 5 },
      }),
    ).toEqual({})
  })
})

describe('consentTextTooLong', () => {
  it('names the first key longer than the limit after trimming', () => {
    const long = 'a'.repeat(CONSENT_TEXT_MAX_LENGTH + 1)
    expect(consentTextTooLong({ image: 'ok', trips: long })).toBe('trips')
    expect(consentTextTooLong({ image: ` ${'a'.repeat(CONSENT_TEXT_MAX_LENGTH)} ` })).toBeNull()
    expect(consentTextTooLong({})).toBeNull()
  })
})

describe('applyConsentTextsPatch (DD-L11)', () => {
  it('stores a new wording trimmed, with the instant of the change', () => {
    const result = applyConsentTextsPatch({}, { regulations: '  Our rules  ' }, now)
    expect(result).toEqual({
      texts: { regulations: { text: 'Our rules', changedAt: now.toISOString() } },
      changed: ['regulations'],
    })
  })

  it('keeps the instant when the wording does not change', () => {
    const current = { image: { text: 'Photos', changedAt: at } }
    expect(applyConsentTextsPatch(current, { image: ' Photos ' }, now)).toEqual({ texts: current, changed: [] })
  })

  it('removes a key on an empty text and ignores the removal of a missing one', () => {
    const current = { image: { text: 'Photos', changedAt: at } }
    expect(applyConsentTextsPatch(current, { image: '  ', trips: '' }, now)).toEqual({ texts: {}, changed: ['image'] })
  })

  it('changes nothing without a patch', () => {
    const current = { image: { text: 'Photos', changedAt: at } }
    expect(applyConsentTextsPatch(current, undefined, now)).toEqual({ texts: current, changed: [] })
  })
})
