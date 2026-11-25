import { describe, expect, it } from '@jest/globals'
import { checkOutlineImage, imageFits, OUTLINE_IMAGE_MAX_BYTES, outlineImageUrl } from '../images'
import { emptyParts, type OutlineExercise } from '../outline'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

const exercise = (attachmentId: string | null): OutlineExercise => ({
  name: 'Rondo',
  minutes: 5,
  organisation: '',
  coachingPoints: '',
  image: attachmentId ? { attachmentId, ownerOutlineId: 'o' } : null,
})

describe('outline images', () => {
  it('accepts a PNG and refuses an empty, an oversized or a foreign file', () => {
    expect(checkOutlineImage(PNG)).toMatchObject({ ok: true, file: { format: 'png' } })
    expect(checkOutlineImage(new Uint8Array())).toEqual({ ok: false, problem: 'empty' })
    expect(checkOutlineImage(new Uint8Array(OUTLINE_IMAGE_MAX_BYTES + 1))).toEqual({ ok: false, problem: 'too_large' })
    expect(checkOutlineImage(Uint8Array.from([1, 2, 3, 4]))).toEqual({ ok: false, problem: 'format_unsupported' })
  })

  it('allows at most 12 images, a replacement counting once', () => {
    const parts = emptyParts()
    parts.main = Array.from({ length: 12 }, (_, index) => exercise(`a${String(index)}`))
    expect(imageFits(parts, false)).toBe(false)
    expect(imageFits(parts, true)).toBe(true)
    expect(imageFits(emptyParts(), false)).toBe(true)
  })

  it('builds the authenticated image route', () => {
    expect(outlineImageUrl('o 1', 'a/2')).toBe('/api/training/outlines/o%201/images/a%2F2')
  })
})
