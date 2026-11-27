import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stripImageMetadata } from '../image-metadata.ts'

// Fixtures are built in code: each metadata block carries the word SECRET, so a leak shows up as that text.
const text = (value) => Array.from(value, (char) => char.charCodeAt(0))
const join = (...parts) => new Uint8Array(parts.flatMap((part) => Array.from(part)))
const has = (bytes, value) => Buffer.from(bytes).includes(Buffer.from(value, 'latin1'))
const MALFORMED = { ok: false, problem: 'malformed' }

const strip = (bytes, format) => {
  const result = stripImageMetadata(bytes, format)
  assert.equal(result.ok, true)
  return result.bytes
}

// --- JPEG fixtures ---

const SOI = [0xff, 0xd8]
const segment = (marker, payload) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
// Start of scan with its header, entropy-coded data with a stuffed 0xFF00 and a restart marker, then EOI.
const SCAN = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]
const EOI = [0xff, 0xd9]
const DQT = segment(0xdb, [0x00, ...Array(64).fill(1)])
const APP0 = segment(0xe0, [...text('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0])
const ICC = segment(0xe2, [...text('ICC_PROFILE\0'), 1, 1, 0xaa])
const MPF = segment(0xe2, text('MPF\0SECRET-MPF'))
const SHORT_APP2 = segment(0xe2, text('ICC'))
const ADOBE = segment(0xee, [...text('Adobe'), 0, 100, 0, 0, 0, 0, 1])
const XMP = segment(0xe1, text('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>SECRET-XMP</x:xmpmeta>'))
const IPTC = segment(0xed, text('Photoshop 3.0\0SECRET-IPTC'))
const COM = segment(0xfe, text('SECRET-COMMENT'))
const APP14_OTHER = segment(0xee, text('SECRET-APP14'))
const JPG0 = segment(0xf0, [0x01]) // JPGn, outside the APPn range: kept

/** A TIFF structure with IFD0 holding `entries` ([tag, type, count, value]) followed by `extra` bytes. */
function tiff(order, entries, extra = [], magic = 42) {
  const littleEndian = order === 'II'
  const bytes = new Uint8Array(8 + 2 + entries.length * 12 + 4 + extra.length)
  const view = new DataView(bytes.buffer)
  bytes.set(text(order), 0)
  view.setUint16(2, magic, littleEndian)
  view.setUint32(4, 8, littleEndian)
  view.setUint16(8, entries.length, littleEndian)
  entries.forEach(([tag, type, count, value], index) => {
    const entry = 10 + index * 12
    view.setUint16(entry, tag, littleEndian)
    view.setUint16(entry + 2, type, littleEndian)
    view.setUint32(entry + 4, count, littleEndian)
    if (type === 3) view.setUint16(entry + 8, value, littleEndian)
    else view.setUint32(entry + 8, value, littleEndian)
  })
  bytes.set(extra, 8 + 2 + entries.length * 12 + 4)
  return bytes
}

const exifSegment = (tiffBytes) => segment(0xe1, [...text('Exif\0\0'), ...tiffBytes])
const GPS_EXTRA = text('SECRET-GPS-IFD-52.2297N-21.0122E')
/** IFD0 with Make, Orientation and a GPS IFD pointer to the SECRET block after the IFD. */
const cameraExif = (order, orientation) =>
  exifSegment(
    tiff(
      order,
      [
        [0x010f, 2, 4, 0],
        [0x0112, 3, 1, orientation],
        [0x8825, 4, 1, 8 + 2 + 3 * 12 + 4],
      ],
      GPS_EXTRA,
    ),
  )

const MINIMAL_EXIF = (orientation) =>
  join(
    [0xff, 0xe1, 0x00, 0x22],
    text('Exif\0\0MM'),
    [0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01],
    [0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00],
    [0x00, 0x00, 0x00, 0x00],
  )

test('stripImageMetadata removes EXIF with GPS, XMP, IPTC and comments from a JPEG and keeps the orientation', () => {
  for (const order of ['MM', 'II']) {
    const input = join(
      SOI,
      APP0,
      cameraExif(order, 6),
      XMP,
      IPTC,
      COM,
      MPF,
      SHORT_APP2,
      APP14_OTHER,
      ICC,
      ADOBE,
      DQT,
      JPG0,
      SCAN,
      EOI,
    )
    const output = strip(input, 'jpeg')
    assert.deepEqual(output, join(SOI, APP0, MINIMAL_EXIF(6), ICC, ADOBE, DQT, JPG0, SCAN, EOI))
    assert.equal(has(output, 'SECRET'), false)
    assert.deepEqual(output.subarray(output.length - SCAN.length - EOI.length), join(SCAN, EOI))
  }
})

test('stripImageMetadata writes no EXIF for a JPEG without a non-default orientation', () => {
  const expected = join(SOI, APP0, DQT, SCAN, EOI)
  const withExif = (tiffBytes) => strip(join(SOI, APP0, exifSegment(tiffBytes), DQT, SCAN, EOI), 'jpeg')
  assert.deepEqual(strip(join(SOI, APP0, DQT, SCAN, EOI), 'jpeg'), expected)
  assert.deepEqual(strip(join(SOI, APP0, cameraExif('II', 1), DQT, SCAN, EOI), 'jpeg'), expected)
  assert.deepEqual(withExif(tiff('MM', [[0x0112, 3, 1, 9]])), expected)
  assert.deepEqual(withExif(tiff('MM', [[0x010f, 2, 4, 0]])), expected)
  assert.deepEqual(withExif(tiff('MM', [])), expected)
  assert.deepEqual(withExif(tiff('MM', [[0x0112, 3, 1, 6]], [], 43)), expected)
  assert.deepEqual(withExif(join(text('XX'), [0, 42, 0, 0, 0, 8])), expected)
  assert.deepEqual(withExif(text('MM')), expected)
  // IFD0 outside the TIFF data, and an entry cut short.
  assert.deepEqual(withExif(join(text('MM'), [0, 42, 0, 0, 0, 200])), expected)
  assert.deepEqual(withExif(join(text('MM'), [0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12])), expected)
})

test('stripImageMetadata keeps the first orientation, standalone markers and fill bytes', () => {
  const input = join(
    SOI,
    [0xff, 0xff],
    cameraExif('MM', 8),
    exifSegment(tiff('II', [[0x0112, 3, 1, 3]])),
    [0xff, 0x01],
    [0xff, 0xd3],
    DQT,
    SCAN,
    EOI,
  )
  assert.deepEqual(strip(input, 'jpeg'), join(SOI, MINIMAL_EXIF(8), [0xff, 0x01], [0xff, 0xd3], DQT, SCAN, EOI))
  assert.deepEqual(
    strip(join(SOI, exifSegment(tiff('II', [[0x0112, 3, 1, 2]])), SCAN, EOI), 'jpeg'),
    join(SOI, MINIMAL_EXIF(2), SCAN, EOI),
  )
})

test('stripImageMetadata drops everything after the end of image of a JPEG', () => {
  // A Motion Photo clip with a GPS atom, and an MPF/Ultra HDR secondary JPEG with its own EXIF, after the primary EOI.
  const motionClip = text('\0\0\0\x18ftypmp42SECRET-MP4-GPS')
  const secondary = join(SOI, cameraExif('MM', 6), DQT, SCAN, EOI)
  const input = join(SOI, APP0, cameraExif('II', 1), DQT, SCAN, EOI, secondary, motionClip)
  const output = strip(input, 'jpeg')
  assert.deepEqual(output, join(SOI, APP0, DQT, SCAN, EOI))
  assert.equal(has(output, 'SECRET'), false)
})

test('stripImageMetadata filters the segments between the scans of a progressive JPEG', () => {
  const DHT = segment(0xc4, [0x00, ...Array(16).fill(0)])
  const SECOND_SCAN = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x01, 0x3f, 0x00, 0x78, 0xff, 0x00, 0x9a]
  const input = join(SOI, APP0, DQT, SCAN, COM, XMP, DHT, [0xff, 0xff], SECOND_SCAN, EOI)
  const output = strip(input, 'jpeg')
  assert.deepEqual(output, join(SOI, APP0, DQT, SCAN, DHT, SECOND_SCAN, EOI))
  assert.equal(has(output, 'SECRET'), false)
})

test('stripImageMetadata refuses a malformed JPEG', () => {
  const malformed = (...parts) => assert.deepEqual(stripImageMetadata(join(...parts), 'jpeg'), MALFORMED)
  malformed([0xff, 0xd9], SCAN)
  malformed([0x00, 0xd8], SCAN)
  malformed(SOI) // no start of scan
  malformed(SOI, APP0) // no start of scan
  malformed(SOI, [0x12], SCAN) // not a marker
  malformed(SOI, [0xff, 0xff]) // fill bytes up to the end
  malformed(SOI, [0xff, 0x00], SCAN)
  malformed(SOI, [0xff, 0xd8], SCAN)
  malformed(SOI, [0xff, 0xd9])
  malformed(SOI, [0xff, 0xdb]) // no length
  malformed(SOI, [0xff, 0xdb, 0x00]) // half a length
  malformed(SOI, [0xff, 0xdb, 0x00, 0x01], SCAN) // length below 2
  malformed(SOI, APP0.slice(0, 8)) // truncated segment
  malformed(SOI, APP0, SCAN) // no end of image after the scan
  malformed(SOI, APP0, SCAN, [0xff]) // the scan ends on a lone 0xFF
})

// --- PNG fixtures ---

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const CRC = [0xde, 0xad, 0xbe, 0xef] // never checked or recomputed: kept chunks are copied as they are
const chunk = (type, data) => {
  const length = [data.length >>> 24, (data.length >> 16) & 0xff, (data.length >> 8) & 0xff, data.length & 0xff]
  return [...length, ...text(type), ...data, ...CRC]
}
const IHDR = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])
const ICCP = chunk('iCCP', text('sRGB\0\0profile'))
const IDAT = chunk('IDAT', [0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])
const IEND = chunk('IEND', [])

test('stripImageMetadata removes the text, EXIF and time chunks of a PNG', () => {
  const input = join(
    PNG_SIGNATURE,
    IHDR,
    chunk('eXIf', text('MM\0*SECRET-GPS')),
    chunk('tEXt', text('Author\0SECRET-NAME')),
    ICCP,
    chunk('iTXt', text('XML:com.adobe.xmp\0\0\0\0\0SECRET-XMP')),
    chunk('zTXt', text('Comment\0\0SECRET')),
    chunk('tIME', [0x07, 0xea, 11, 27, 12, 0, 0]),
    IDAT,
    IEND,
  )
  const output = strip(input, 'png')
  assert.deepEqual(output, join(PNG_SIGNATURE, IHDR, ICCP, IDAT, IEND))
  assert.equal(has(output, 'SECRET'), false)
  // Bytes after IEND are not part of the image.
  assert.deepEqual(
    strip(join(PNG_SIGNATURE, IHDR, IDAT, IEND, text('SECRET')), 'png'),
    join(PNG_SIGNATURE, IHDR, IDAT, IEND),
  )
})

test('stripImageMetadata refuses a malformed PNG', () => {
  const malformed = (...parts) => assert.deepEqual(stripImageMetadata(join(...parts), 'png'), MALFORMED)
  malformed([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b], IHDR, IEND)
  malformed(PNG_SIGNATURE, IHDR, IDAT) // no IEND
  malformed(PNG_SIGNATURE, IHDR, IDAT.slice(0, 15)) // truncated chunk
  malformed(PNG_SIGNATURE, [0xff, 0xff, 0xff, 0xff], text('IDAT'), CRC) // length beyond the file
})

// --- WebP fixtures ---

const le32 = (value) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24]
const riffChunk = (fourCc, data) => [...text(fourCc), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])]
const webp = (...chunks) => {
  const body = chunks.flat()
  return join(text('RIFF'), le32(4 + body.length), text('WEBP'), body)
}
const vp8x = (flags) => riffChunk('VP8X', [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0])
const VP8L = riffChunk('VP8L', [0x2f, 0x00, 0x00, 0x00, 0x00]) // odd size: one padding byte
const VP8 = riffChunk('VP8 ', [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a])
const ICCP_WEBP = riffChunk('ICCP', [1, 2, 3])
const EXIF_WEBP = riffChunk('EXIF', text('MM\0*SECRET-GPS'))
const XMP_WEBP = riffChunk('XMP ', text('<x:xmpmeta>SECRET-XMP</x:xmpmeta>')) // odd size

test('stripImageMetadata removes the EXIF and XMP chunks of a WebP and clears their VP8X flags', () => {
  const output = strip(webp(vp8x(0x20 | 0x10 | 0x08 | 0x04 | 0x02), ICCP_WEBP, VP8L, EXIF_WEBP, XMP_WEBP), 'webp')
  assert.deepEqual(output, webp(vp8x(0x20 | 0x10 | 0x02), ICCP_WEBP, VP8L))
  assert.equal(has(output, 'SECRET'), false)
  assert.deepEqual(new DataView(output.buffer).getUint32(4, true), output.length - 8)
  // A simple WebP has nothing to remove; bytes after the RIFF data are dropped.
  assert.deepEqual(strip(webp(VP8), 'webp'), webp(VP8))
  assert.deepEqual(strip(join(webp(VP8L), text('SECRET')), 'webp'), webp(VP8L))
})

test('stripImageMetadata refuses a malformed WebP', () => {
  const malformed = (bytes) => assert.deepEqual(stripImageMetadata(bytes, 'webp'), MALFORMED)
  malformed(text('RIFF\0\0\0\0WEB'))
  malformed(join(text('RIFX'), le32(4), text('WEBP')))
  malformed(join(text('RIFF'), le32(4), text('WAVE')))
  malformed(join(text('RIFF'), le32(100), text('WEBP'), VP8)) // RIFF size beyond the file
  malformed(webp(VP8, [0x41, 0x42, 0x43, 0x44])) // a chunk header cut short
  malformed(webp(VP8.slice(0, 10))) // chunk data beyond the RIFF data
  malformed(webp(VP8L.slice(0, 13))) // missing padding byte
  malformed(webp(riffChunk('VP8X', [0x08, 0, 0, 0]), VP8L)) // VP8X shorter than its 10 bytes
})
