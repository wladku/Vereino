import { describe, expect, it } from '@jest/globals'
import {
  heldBackCount,
  isPublicPicture,
  missingConsentIds,
  peopleConfirmed,
  pictureState,
  undoKeepsConfirmation,
  type PictureFacts,
} from '../public-pictures'

const AT = '2026-11-27T10:00:00.000Z'
const JAS = 'person-jas'
const OLA = 'person-ola'

function photo(overrides: Partial<PictureFacts> = {}): PictureFacts {
  return { kind: 'photo', publishedAt: AT, peopleConfirmedAt: AT, personIds: [JAS, OLA], ...overrides }
}

const both = new Map([
  [JAS, true],
  [OLA, true],
])

describe('BR-I01 — public pictures (event photos spec, #872)', () => {
  it('a confirmed, published photo of people with consent is public while the event is public', () => {
    expect(pictureState(photo(), both, true)).toBe('public')
    expect(isPublicPicture(photo(), both, true)).toBe(true)
    expect(pictureState(photo(), both, false)).toBe('event_not_public')
    expect(isPublicPicture(photo(), both, false)).toBe(false)
  })

  it('an unpublished picture is a draft', () => {
    expect(pictureState(photo({ publishedAt: null }), both, true)).toBe('draft')
  })

  it('a photo without a confirmation or without marks is unconfirmed', () => {
    expect(pictureState(photo({ peopleConfirmedAt: null }), both, true)).toBe('unconfirmed')
    expect(pictureState(photo({ personIds: [] }), both, true)).toBe('unconfirmed')
    expect(peopleConfirmed(photo({ personIds: [] }))).toBe(false)
  })

  it('a graphic needs a confirmation but no marks and no consent', () => {
    const graphic: PictureFacts = { kind: 'graphic', publishedAt: AT, peopleConfirmedAt: AT, personIds: [] }
    expect(peopleConfirmed(graphic)).toBe(true)
    expect(missingConsentIds(graphic, new Map())).toEqual([])
    expect(pictureState(graphic, new Map(), true)).toBe('public')
    expect(pictureState({ ...graphic, peopleConfirmedAt: null }, new Map(), true)).toBe('unconfirmed')
  })

  it('one marked person without consent holds the photo back; an unknown person counts as without consent', () => {
    const withdrawn = new Map([
      [JAS, false],
      [OLA, true],
    ])
    expect(missingConsentIds(photo(), withdrawn)).toEqual([JAS])
    expect(pictureState(photo(), withdrawn, true)).toBe('waiting_for_consent')
    expect(missingConsentIds(photo(), new Map([[OLA, true]]))).toEqual([JAS])
    expect(isPublicPicture(photo(), new Map(), true)).toBe(false)
  })

  it('counts the published, confirmed pictures of a person that a withdrawal holds back', () => {
    const withdrawn = new Map([
      [JAS, false],
      [OLA, true],
    ])
    const pictures: PictureFacts[] = [
      photo(),
      photo({ personIds: [OLA] }),
      photo({ publishedAt: null }),
      photo({ peopleConfirmedAt: null }),
      { kind: 'graphic', publishedAt: AT, peopleConfirmedAt: AT, personIds: [] },
      photo({ personIds: [JAS] }),
    ]
    expect(heldBackCount(pictures, JAS, withdrawn)).toBe(2)
    expect(heldBackCount(pictures, OLA, withdrawn)).toBe(1)
    expect(heldBackCount(pictures, JAS, both)).toBe(0)
  })
})

describe('undo of the marks (#899, BR-I01)', () => {
  const MAX = 'person-max'
  it('keeps the confirmation when the restored set drops nobody marked now', () => {
    expect(undoKeepsConfirmation([JAS], [JAS, OLA])).toBe(true)
    expect(undoKeepsConfirmation([JAS, OLA], [OLA, JAS])).toBe(true)
    expect(undoKeepsConfirmation([], [])).toBe(true)
  })
  it('clears it when the restored set drops a person marked now', () => {
    expect(undoKeepsConfirmation([JAS, OLA, MAX], [JAS, OLA])).toBe(false)
    expect(undoKeepsConfirmation([MAX], [JAS])).toBe(false)
  })
})
