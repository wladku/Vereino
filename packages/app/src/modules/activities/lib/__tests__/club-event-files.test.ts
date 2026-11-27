import { describe, expect, it } from '@jest/globals'
import {
  FUNDER_LOGO_MAX_BYTES,
  MAX_FUNDER_LOGOS,
  MAX_PICTURES,
  PICTURE_MAX_BYTES,
  POSTER_MAX_BYTES,
  checkClubEventFile,
  clubEventFileMaxBytes,
  funderNameOf,
  fundersLimitReached,
  isPictureKind,
  nextFilePosition,
  pictureContentUrl,
  pictureDescriptionOf,
  picturesLimitReached,
  reorderedPositions,
  sortClubEventFiles,
  staffImageUrl,
} from '../club-event-files'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff, 0xe0]

function bytes(signature: number[], size: number): Uint8Array {
  const buffer = new Uint8Array(size)
  buffer.set(signature)
  return buffer
}

describe('club event files (DD-T10, REQ-T08)', () => {
  it('limits a poster to 5 MB and a funder logo to 2 MB', () => {
    expect(clubEventFileMaxBytes('poster')).toBe(POSTER_MAX_BYTES)
    expect(clubEventFileMaxBytes('funder_logo')).toBe(FUNDER_LOGO_MAX_BYTES)
    expect(POSTER_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(FUNDER_LOGO_MAX_BYTES).toBe(2 * 1024 * 1024)
  })

  it('accepts a 3 MB JPEG poster and refuses it as a logo; refuses a 7 MB PNG', () => {
    const jpeg = bytes(JPEG, 3 * 1024 * 1024)
    expect(checkClubEventFile(jpeg, 'poster')).toEqual({
      ok: true,
      file: { format: 'jpeg', mimeType: 'image/jpeg', size: jpeg.length },
    })
    expect(checkClubEventFile(jpeg, 'funder_logo')).toEqual({ ok: false, problem: 'too_large' })
    expect(checkClubEventFile(bytes(PNG, 7 * 1024 * 1024), 'poster')).toEqual({ ok: false, problem: 'too_large' })
  })

  it('refuses an SVG under any name and a PDF by their bytes', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')
    expect(checkClubEventFile(svg, 'poster')).toEqual({ ok: false, problem: 'format_unsupported' })
    const pdf = new TextEncoder().encode('%PDF-1.4\n%%EOF')
    expect(checkClubEventFile(pdf, 'funder_logo')).toEqual({ ok: false, problem: 'format_unsupported' })
    expect(checkClubEventFile(new Uint8Array(0), 'poster')).toEqual({ ok: false, problem: 'empty' })
  })

  it('requires a funder name of 2–120 characters for a logo, none for a poster', () => {
    expect(funderNameOf('poster', 'Gmina Zielony Las')).toEqual({ valid: true, name: null })
    expect(funderNameOf('poster', undefined)).toEqual({ valid: true, name: null })
    expect(funderNameOf('funder_logo', '  Gmina Zielony Las  ')).toEqual({ valid: true, name: 'Gmina Zielony Las' })
    expect(funderNameOf('funder_logo', 'ab')).toEqual({ valid: true, name: 'ab' })
    expect(funderNameOf('funder_logo', 'a'.repeat(120))).toEqual({ valid: true, name: 'a'.repeat(120) })
    expect(funderNameOf('funder_logo', 'a'.repeat(121))).toEqual({ valid: false })
    expect(funderNameOf('funder_logo', ' a ')).toEqual({ valid: false })
    expect(funderNameOf('funder_logo', null)).toEqual({ valid: false })
    expect(funderNameOf('funder_logo', undefined)).toEqual({ valid: false })
  })

  it('stops at 12 live logos', () => {
    expect(MAX_FUNDER_LOGOS).toBe(12)
    expect(fundersLimitReached(11)).toBe(false)
    expect(fundersLimitReached(12)).toBe(true)
  })

  it('places the next logo after the highest live position', () => {
    expect(nextFilePosition([])).toBe(0)
    expect(nextFilePosition([0, 4, 2])).toBe(5)
  })

  it('builds the staff image URL', () => {
    expect(staffImageUrl('a b')).toBe('/api/attachments/image/a%20b')
  })

  it('sorts the poster first, then the logos by position, creation and id', () => {
    const rows = [
      { id: 'd', kind: 'funder_logo', position: 1, createdAt: '2026-11-20T10:00:00Z' },
      { id: 'c', kind: 'funder_logo', position: 0, createdAt: '2026-11-20T10:00:01Z' },
      { id: 'b', kind: 'funder_logo', position: 0, createdAt: new Date('2026-11-20T10:00:00Z') },
      { id: 'a', kind: 'funder_logo', position: 0, createdAt: '2026-11-20T10:00:00Z' },
      { id: 'e', kind: 'poster', position: 0, createdAt: '2026-11-20T11:00:00Z' },
      { id: 'a2', kind: 'funder_logo', position: 0, createdAt: '2026-11-20T10:00:00Z' },
    ]
    expect(sortClubEventFiles(rows).map((row) => row.id)).toEqual(['e', 'a', 'a2', 'b', 'c', 'd'])
    expect(sortClubEventFiles([rows[3], rows[3]]).map((row) => row.id)).toEqual(['a', 'a'])
  })
})

describe('club event pictures (event photos spec REQ-I01, #872)', () => {
  it('tells the picture kinds from the poster and the logos', () => {
    expect(isPictureKind('photo')).toBe(true)
    expect(isPictureKind('graphic')).toBe(true)
    expect(isPictureKind('poster')).toBe(false)
    expect(isPictureKind('funder_logo')).toBe(false)
  })

  it('limits a picture to 10 MB and an event to 30 pictures', () => {
    expect(clubEventFileMaxBytes('photo')).toBe(PICTURE_MAX_BYTES)
    expect(clubEventFileMaxBytes('graphic')).toBe(10 * 1024 * 1024)
    expect(checkClubEventFile(bytes(JPEG, 9 * 1024 * 1024), 'photo').ok).toBe(true)
    expect(checkClubEventFile(bytes(JPEG, 11 * 1024 * 1024), 'photo')).toEqual({ ok: false, problem: 'too_large' })
    expect(picturesLimitReached(MAX_PICTURES - 1)).toBe(false)
    expect(picturesLimitReached(MAX_PICTURES)).toBe(true)
  })

  it('needs a description of 2–200 characters for a picture and none for the other kinds', () => {
    expect(pictureDescriptionOf('photo', '  Final  ')).toEqual({ valid: true, name: 'Final' })
    expect(pictureDescriptionOf('graphic', 'x')).toEqual({ valid: false })
    expect(pictureDescriptionOf('photo', 'x'.repeat(201))).toEqual({ valid: false })
    expect(pictureDescriptionOf('photo', null)).toEqual({ valid: false })
    expect(pictureDescriptionOf('poster', 'ignored')).toEqual({ valid: true, name: null })
    expect(funderNameOf('photo', 'ignored')).toEqual({ valid: true, name: null })
  })

  it('moves a picture to a new index and returns only the changed positions', () => {
    const rows = [
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ]
    expect(reorderedPositions(rows, 'c', 0)).toEqual(
      new Map([
        ['c', 0],
        ['a', 1],
        ['b', 2],
      ]),
    )
    expect(reorderedPositions(rows, 'a', 1)).toEqual(
      new Map([
        ['b', 0],
        ['a', 1],
      ]),
    )
    expect(reorderedPositions(rows, 'a', 99)).toEqual(
      new Map([
        ['b', 0],
        ['c', 1],
        ['a', 2],
      ]),
    )
    expect(reorderedPositions(rows, 'b', -5).get('b')).toBe(0)
    expect(reorderedPositions(rows, 'b', 1).size).toBe(0)
    expect(reorderedPositions(rows, 'missing', 0).size).toBe(0)
  })

  it('streams a picture through the manager-checked content route', () => {
    expect(pictureContentUrl('e 1', 'f/1')).toBe('/api/activities/club-events/e%201/files/f%2F1/content')
  })
})
