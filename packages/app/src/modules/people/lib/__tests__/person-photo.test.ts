import { describe, expect, it } from '@jest/globals'
import { PERSON_PHOTO_MAX_BYTES, checkPersonPhoto } from '../person-photo'

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new TextEncoder().encode(value)
const sized = (head: Uint8Array, size: number) => {
  const out = new Uint8Array(size)
  out.set(head)
  return out
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0)
const WEBP = text('RIFF\0\0\0\0WEBPVP8 ')
const SVG = text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')

describe('checkPersonPhoto (#312)', () => {
  it('accepts a PNG, JPEG or WebP photo up to 5 MB', () => {
    expect(checkPersonPhoto(PNG)).toMatchObject({ ok: true, file: { format: 'png', mimeType: 'image/png' } })
    expect(checkPersonPhoto(JPEG)).toMatchObject({ ok: true, file: { format: 'jpeg' } })
    expect(checkPersonPhoto(WEBP)).toMatchObject({ ok: true, file: { format: 'webp' } })
    expect(checkPersonPhoto(sized(PNG, PERSON_PHOTO_MAX_BYTES))).toMatchObject({ ok: true })
  })

  it('refuses an SVG renamed .png, a larger file and an empty one', () => {
    expect(checkPersonPhoto(SVG)).toEqual({ ok: false, problem: 'format_unsupported' })
    expect(checkPersonPhoto(sized(PNG, PERSON_PHOTO_MAX_BYTES + 1))).toEqual({ ok: false, problem: 'too_large' })
    expect(checkPersonPhoto(new Uint8Array())).toEqual({ ok: false, problem: 'empty' })
  })
})
