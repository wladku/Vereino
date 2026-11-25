import { describe, expect, it } from '@jest/globals'
import {
  droppedImages,
  emptyParts,
  isOutlineLocked,
  isUneditedCopy,
  keepKnownImages,
  outlineContent,
  outlineFileName,
  outlineImages,
  outlineMinutes,
  outlinePartsSchema,
  readParts,
  withExerciseImage,
  withoutImage,
  type OutlineContent,
  type OutlineExercise,
  type OutlineParts,
} from '../outline'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const OWNER = '33333333-3333-4333-8333-333333333333'

const exercise = (name: string, minutes: number, attachmentId: string | null = null): OutlineExercise => ({
  name,
  minutes,
  organisation: '',
  coachingPoints: '',
  image: attachmentId ? { attachmentId, ownerOutlineId: OWNER } : null,
})

const parts = (): OutlineParts => ({
  warm_up: [exercise('Rondo', 10, A)],
  main: [exercise('1v1', 30, B), exercise('Game', 20, A)],
  cool_down: [exercise('Stretch', 5)],
})

const content = (overrides: Partial<OutlineContent> = {}): OutlineContent => ({
  language: 'pl',
  topic: 'Gra 1v1 w obronie',
  goal: 'Odbiór piłki',
  specificGoals: '',
  ageCategory: 'U11',
  durationMinutes: 75,
  playersCount: 14,
  equipment: 'Pachołki',
  parts: parts(),
  ...overrides,
})

describe('outline parts', () => {
  it('parses exactly the three parts with defaults and refuses a fourth', () => {
    const parsed = outlinePartsSchema.parse({ main: [{ name: ' Rondo ', minutes: 5 }] })
    expect(parsed.warm_up).toEqual([])
    expect(parsed.main[0]).toEqual({ name: 'Rondo', minutes: 5, organisation: '', coachingPoints: '', image: null })
    expect(outlinePartsSchema.safeParse({ extra: [] }).success).toBe(false)
    expect(
      outlinePartsSchema.safeParse({ main: Array.from({ length: 13 }, () => ({ name: 'x', minutes: 1 })) }).success,
    ).toBe(false)
  })

  it('reads stored parts defensively', () => {
    expect(readParts(parts())).toEqual(parts())
    expect(readParts('broken')).toEqual(emptyParts())
  })

  it('sums the planned minutes per part and in total', () => {
    expect(outlineMinutes(parts())).toEqual({ warm_up: 10, main: 50, cool_down: 5, total: 65 })
  })
})

describe('outline images in the parts', () => {
  it('lists each image once in part order', () => {
    expect(outlineImages(parts()).map((image) => image.attachmentId)).toEqual([A, B])
  })

  it('keeps only images the stored outline knows, with the stored owner', () => {
    const sent = parts()
    sent.cool_down = [{ ...exercise('Stretch', 5), image: { attachmentId: B, ownerOutlineId: A } }, exercise('Walk', 2)]
    const known = [{ attachmentId: B, ownerOutlineId: OWNER }]
    const kept = keepKnownImages(sent, known)
    expect(kept.warm_up[0].image).toBeNull()
    expect(kept.cool_down[0].image).toEqual({ attachmentId: B, ownerOutlineId: OWNER })
    expect(kept.cool_down[1].image).toBeNull()
  })

  it('names the images an edit dropped', () => {
    const after = parts()
    after.main = [exercise('1v1', 30, B)]
    expect(droppedImages(parts(), after)).toEqual([])
    after.warm_up = [exercise('Rondo', 10)]
    expect(droppedImages(parts(), after).map((image) => image.attachmentId)).toEqual([A])
  })

  it('sets an image on one exercise, or answers null for a missing one', () => {
    const image = { attachmentId: B, ownerOutlineId: OWNER }
    const next = withExerciseImage(parts(), 'cool_down', 0, image)
    expect(next?.cool_down[0].image).toEqual(image)
    expect(next?.main[0].image?.attachmentId).toBe(B)
    expect(withExerciseImage(parts(), 'cool_down', 3, image)).toBeNull()
    const second = withExerciseImage(parts(), 'main', 1, null)
    expect(second?.main.map((item) => item.image?.attachmentId ?? null)).toEqual([B, null])
  })

  it('removes an image from every exercise that shows it', () => {
    const next = withoutImage(parts(), A)
    expect(next.warm_up[0].image).toBeNull()
    expect(next.main[1].image).toBeNull()
    expect(next.main[0].image?.attachmentId).toBe(B)
  })
})

describe('the 72-hour lock (BR-O3)', () => {
  const end = '2026-11-20T18:00:00.000Z'
  it('locks 72 hours after the session end', () => {
    expect(isOutlineLocked(end, new Date('2026-11-23T17:59:59.000Z'))).toBe(false)
    expect(isOutlineLocked(end, new Date('2026-11-23T18:00:00.000Z'))).toBe(true)
    expect(isOutlineLocked(new Date(end), new Date('2026-11-24T00:00:00.000Z'))).toBe(true)
  })

  it('never locks an outline of no session or of an unreadable end', () => {
    expect(isOutlineLocked(null, new Date())).toBe(false)
    expect(isOutlineLocked(undefined, new Date())).toBe(false)
    expect(isOutlineLocked('not a date', new Date())).toBe(false)
  })
})

describe('session copies (DD-O07)', () => {
  it('takes the content fields only, a missing player count as null', () => {
    const row = { ...content({ playersCount: undefined }), id: 'x', occurrenceId: 'y' }
    expect(outlineContent(row)).toEqual({ ...content(), playersCount: null })
  })

  it('tells an unedited copy from an edited one', () => {
    expect(isUneditedCopy(content(), content())).toBe(true)
    expect(isUneditedCopy(content({ topic: 'Inny temat' }), content())).toBe(false)
    expect(isUneditedCopy(content(), null)).toBe(false)
  })
})

describe('the PDF file name (REQ-O09)', () => {
  it('names a session outline with its date and an ASCII topic', () => {
    expect(outlineFileName({ language: 'pl', topic: 'Gra 1v1 w obronie — Żaki/Łódź', date: '2026-11-24' })).toBe(
      'konspekt-2026-11-24-gra-1v1-w-obronie-zaki-lodz',
    )
  })

  it('names an outline of no session and trims a long topic', () => {
    expect(outlineFileName({ language: 'en', topic: 'Rondo', date: null })).toBe('outline-rondo')
    expect(outlineFileName({ language: 'en', topic: `${'a'.repeat(59)} bbbb`, date: null })).toBe(
      `outline-${'a'.repeat(59)}`,
    )
    expect(outlineFileName({ language: 'pl', topic: '!!!', date: null })).toBe('konspekt')
  })
})
