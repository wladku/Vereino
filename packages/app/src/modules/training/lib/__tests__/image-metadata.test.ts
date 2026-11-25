import { describe, expect, it } from '@jest/globals'
import { stripImageMetadata } from '../image-metadata'

const bytes = (...values: number[]) => Uint8Array.from(values)
const text = (value: string) => [...value].map((char) => char.charCodeAt(0))

const segment = (marker: number, payload: number[]) => {
  const length = payload.length + 2
  return [0xff, marker, length >> 8, length & 0xff, ...payload]
}

describe('stripImageMetadata — JPEG', () => {
  it('drops EXIF, IPTC and comments and keeps JFIF, ICC, Adobe, tables, restart markers and the scan', () => {
    const jfif = segment(0xe0, text('JFIF'))
    const exif = segment(0xe1, text('Exif GPS'))
    const icc = segment(0xe2, text('ICC'))
    const app5 = segment(0xe5, [1])
    const iptc = segment(0xed, text('IPTC'))
    const adobe = segment(0xee, text('Adobe'))
    const comment = segment(0xfe, text('taken at home'))
    const dqt = segment(0xdb, [0, 1, 2])
    const scan = [...segment(0xda, [1, 2]), 0x11, 0x22, 0xff, 0xd9]
    const input = bytes(
      0xff,
      0xd8,
      ...jfif,
      0xff, // fill byte
      ...exif,
      ...icc,
      ...app5,
      ...iptc,
      ...adobe,
      ...comment,
      0xff,
      0xd0, // RST0
      0xff,
      0x01, // TEM
      ...dqt,
      ...scan,
    )
    const out = stripImageMetadata(input, 'jpeg')
    expect(out).toEqual(bytes(0xff, 0xd8, ...jfif, ...icc, ...adobe, 0xff, 0xd0, 0xff, 0x01, ...dqt, ...scan))
  })

  it('ends at the end-of-image marker', () => {
    expect(stripImageMetadata(bytes(0xff, 0xd8, 0xff, 0xd9), 'jpeg')).toEqual(bytes(0xff, 0xd8, 0xff, 0xd9))
  })

  it('refuses a malformed JPEG', () => {
    expect(stripImageMetadata(bytes(0xff, 0xd8), 'jpeg')).toBeNull()
    expect(stripImageMetadata(bytes(0x00, 0xd8, 0xff, 0xd9), 'jpeg')).toBeNull()
    expect(stripImageMetadata(bytes(0xff, 0x00, 0xff, 0xd9), 'jpeg')).toBeNull()
    // Not a marker where one is expected.
    expect(stripImageMetadata(bytes(0xff, 0xd8, 0x00, 0x00), 'jpeg')).toBeNull()
    // A lone 0xFF at the end.
    expect(stripImageMetadata(bytes(0xff, 0xd8, 0x00, 0xff), 'jpeg')).toBeNull()
    expect(stripImageMetadata(bytes(0xff, 0xd8, 0xff, 0xff, 0xff), 'jpeg')).toBeNull()
    // A segment header cut short, a length below 2 and a length past the end.
    expect(stripImageMetadata(bytes(0xff, 0xd8, 0xff, 0xdb, 0x00), 'jpeg')).toBeNull()
    expect(stripImageMetadata(bytes(0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01), 'jpeg')).toBeNull()
    expect(stripImageMetadata(bytes(0xff, 0xd8, 0xff, 0xdb, 0x00, 0x09, 0x01), 'jpeg')).toBeNull()
    // Segments without a scan or an end.
    expect(stripImageMetadata(bytes(0xff, 0xd8, ...segment(0xdb, [1])), 'jpeg')).toBeNull()
  })
})

const chunk = (type: string, data: number[]) => {
  const length = data.length
  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...text(type),
    ...data,
    0,
    0,
    0,
    0,
  ]
}
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

describe('stripImageMetadata — PNG', () => {
  it('drops text, time and EXIF chunks and keeps the image chunks', () => {
    const ihdr = chunk('IHDR', [1, 2, 3])
    const idat = chunk('IDAT', [9, 9])
    const iend = chunk('IEND', [])
    const input = bytes(
      ...PNG_SIGNATURE,
      ...ihdr,
      ...chunk('tEXt', text('Author')),
      ...chunk('zTXt', [1]),
      ...chunk('iTXt', [2]),
      ...chunk('eXIf', [3]),
      ...chunk('tIME', [4]),
      ...idat,
      ...iend,
    )
    expect(stripImageMetadata(input, 'png')).toEqual(bytes(...PNG_SIGNATURE, ...ihdr, ...idat, ...iend))
  })

  it('refuses a malformed PNG', () => {
    expect(stripImageMetadata(bytes(1, 2, 3), 'png')).toBeNull()
    expect(stripImageMetadata(bytes(...PNG_SIGNATURE.slice(0, 7), 0), 'png')).toBeNull()
    // A chunk header cut short, a length past the end, and no IEND.
    expect(stripImageMetadata(bytes(...PNG_SIGNATURE, 0, 0, 0), 'png')).toBeNull()
    expect(stripImageMetadata(bytes(...PNG_SIGNATURE, 0, 0, 0, 9, ...text('IDAT'), 0, 0, 0, 0), 'png')).toBeNull()
    expect(stripImageMetadata(bytes(...PNG_SIGNATURE, ...chunk('IHDR', [1])), 'png')).toBeNull()
  })
})

const riffChunk = (type: string, data: number[]) => {
  const size = data.length
  return [
    ...text(type),
    size & 0xff,
    (size >>> 8) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 24) & 0xff,
    ...data,
    ...(size % 2 ? [0] : []),
  ]
}
const riff = (chunks: number[]) => {
  const size = chunks.length + 4
  return bytes(
    ...text('RIFF'),
    size & 0xff,
    (size >>> 8) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 24) & 0xff,
    ...text('WEBP'),
    ...chunks,
  )
}

describe('stripImageMetadata — WebP', () => {
  it('drops EXIF and XMP, clears their VP8X flags and fixes the RIFF size', () => {
    const vp8x = riffChunk('VP8X', [0x0c | 0x10, 0, 0, 0, 1, 0, 0, 1, 0, 0])
    const image = riffChunk('VP8 ', [1, 2, 3])
    const input = riff([...vp8x, ...image, ...riffChunk('EXIF', [7, 7]), ...riffChunk('XMP ', [8])])
    const cleanVp8x = riffChunk('VP8X', [0x10, 0, 0, 0, 1, 0, 0, 1, 0, 0])
    expect(stripImageMetadata(input, 'webp')).toEqual(riff([...cleanVp8x, ...image]))
  })

  it('keeps an empty VP8X chunk and a simple file as they are', () => {
    const input = riff([...riffChunk('VP8X', []), ...riffChunk('VP8L', [5])])
    expect(stripImageMetadata(input, 'webp')).toEqual(input)
  })

  it('refuses a malformed WebP', () => {
    expect(stripImageMetadata(bytes(...text('RIFF')), 'webp')).toBeNull()
    expect(stripImageMetadata(bytes(...text('RIFX'), 0, 0, 0, 0, ...text('WEBP')), 'webp')).toBeNull()
    expect(stripImageMetadata(bytes(...text('RIFF'), 0, 0, 0, 0, ...text('WAVE')), 'webp')).toBeNull()
    expect(stripImageMetadata(riff([...text('VP8 '), 0]), 'webp')).toBeNull()
    expect(stripImageMetadata(riff([...text('VP8 '), 9, 0, 0, 0, 1]), 'webp')).toBeNull()
  })
})

describe('stripImageMetadata — other formats', () => {
  it('refuses a format it cannot clean', () => {
    expect(stripImageMetadata(bytes(1, 2, 3), 'pdf')).toBeNull()
  })
})
