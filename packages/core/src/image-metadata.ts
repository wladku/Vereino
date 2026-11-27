// Removes the metadata of a stored picture (REQ-I02 and DD-I08 of
// `.ai/specs/implemented/2026-11-26-vereino-event-photos-and-image-consent.md`): phone photos carry EXIF with the GPS position,
// the device and the time, plus XMP, IPTC and comments. The function walks the file's segments or chunks and copies
// every one that is not metadata byte for byte, so the image data is never re-encoded and needs no image library.
// Input is a file already accepted by `checkFileBytes`; anything that does not parse is refused as `malformed`.
// - JPEG: drops APP1 (EXIF, XMP), APP13 (IPTC), COM and every other APPn segment except APP0 (JFIF), APP2 ICC
//   profiles and APP14 Adobe (colour transform). A non-default EXIF Orientation is kept in a new minimal EXIF segment
//   holding that one tag. Everything from the start of scan onwards is copied unchanged.
// - PNG: drops the `eXIf`, `tEXt`, `iTXt`, `zTXt` and `tIME` chunks; kept chunks keep their CRCs.
// - WebP: drops the `EXIF` and `XMP ` chunks and clears their flags in `VP8X`. The orientation is not kept: WebP has
//   no orientation outside EXIF and phone cameras write JPEG, so a rotated WebP is rare.

import type { FileFormat } from '#src/file-format'

export type StrippableImageFormat = Exclude<FileFormat, 'pdf'>

export type ImageStripResult = { ok: true; bytes: Uint8Array } | { ok: false; problem: 'malformed' }

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0))

/** Whether `text` stands at `offset`; a byte past the end reads as undefined and never matches. */
function hasAscii(bytes: Uint8Array, text: string, offset: number): boolean {
  return ascii(text).every((byte, index) => bytes[offset + index] === byte)
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

const viewOf = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

// --- JPEG ---

const JPEG_SOS = 0xda
const JPEG_COM = 0xfe
const JPEG_APP0 = 0xe0
const JPEG_APP1 = 0xe1
const JPEG_APP2 = 0xe2
const JPEG_APP14 = 0xee
const ORIENTATION_TAG = 0x0112

/** The EXIF Orientation (2–8) of a TIFF structure, or null when it is absent, the default (1) or unreadable. */
function readExifOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null
  const littleEndian = hasAscii(tiff, 'II', 0)
  if (!littleEndian && !hasAscii(tiff, 'MM', 0)) return null
  const view = viewOf(tiff)
  if (view.getUint16(2, littleEndian) !== 42) return null
  const ifd = view.getUint32(4, littleEndian)
  if (ifd + 2 > tiff.length) return null
  const count = view.getUint16(ifd, littleEndian)
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12
    if (entry + 12 > tiff.length) return null
    if (view.getUint16(entry, littleEndian) !== ORIENTATION_TAG) continue
    const value = view.getUint16(entry + 8, littleEndian)
    return value >= 2 && value <= 8 ? value : null
  }
  return null
}

/** A minimal big-endian APP1 EXIF segment whose only tag is the Orientation. */
function orientationSegment(orientation: number): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0xff, JPEG_APP1, 0x00, 0x22, // marker and length (34 = 2 + 6 + 26)
    ...ascii('Exif\0\0'),
    ...ascii('MM'), 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF header, IFD0 at offset 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1 value
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ])
}

/** Whether a JPEG segment survives: the structural segments and the APPn segments that hold no personal data. */
function keepJpegSegment(marker: number, payload: Uint8Array): boolean {
  if (marker === JPEG_APP0) return true
  if (marker === JPEG_APP2) return hasAscii(payload, 'ICC_PROFILE\0', 0)
  if (marker === JPEG_APP14) return hasAscii(payload, 'Adobe', 0)
  return marker !== JPEG_COM && (marker < JPEG_APP0 || marker > 0xef)
}

function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const view = viewOf(bytes)
  const parts: Uint8Array[] = [bytes.subarray(0, 2)]
  let orientationKept = false
  let position = 2
  while (position < bytes.length) {
    if (bytes[position] !== 0xff) return null
    while (bytes[position] === 0xff) position++ // fill bytes before a marker
    if (position >= bytes.length) return null
    const marker = view.getUint8(position)
    position++
    if (marker === JPEG_SOS) {
      parts.push(new Uint8Array([0xff, JPEG_SOS]), bytes.subarray(position))
      return concat(parts)
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(new Uint8Array([0xff, marker])) // TEM and RSTn stand alone
      continue
    }
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9 || position + 2 > bytes.length) return null
    const length = view.getUint16(position)
    if (length < 2 || position + length > bytes.length) return null
    const payload = bytes.subarray(position + 2, position + length)
    if (keepJpegSegment(marker, payload)) {
      parts.push(new Uint8Array([0xff, marker]), bytes.subarray(position, position + length))
    } else if (marker === JPEG_APP1 && !orientationKept && hasAscii(payload, 'Exif\0\0', 0)) {
      const orientation = readExifOrientation(payload.subarray(6))
      if (orientation !== null) {
        parts.push(orientationSegment(orientation))
        orientationKept = true
      }
    }
    position += length
  }
  return null // no start of scan
}

// --- PNG ---

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'])

function stripPng(bytes: Uint8Array): Uint8Array | null {
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null
  const view = viewOf(bytes)
  const parts: Uint8Array[] = [bytes.subarray(0, 8)]
  let position = 8
  while (position + 12 <= bytes.length) {
    const end = position + 12 + view.getUint32(position) // length, type, data, CRC
    if (end > bytes.length) return null
    const type = String.fromCharCode(...bytes.subarray(position + 4, position + 8))
    if (!PNG_METADATA_CHUNKS.has(type)) parts.push(bytes.subarray(position, end))
    if (type === 'IEND') return concat(parts)
    position = end
  }
  return null // truncated or no IEND
}

// --- WebP ---

const VP8X_EXIF_FLAG = 0x08
const VP8X_XMP_FLAG = 0x04

function stripWebp(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12 || !hasAscii(bytes, 'RIFF', 0) || !hasAscii(bytes, 'WEBP', 8)) return null
  const view = viewOf(bytes)
  const riffEnd = 8 + view.getUint32(4, true)
  if (riffEnd > bytes.length) return null
  const chunks: Uint8Array[] = []
  let position = 12
  while (position < riffEnd) {
    if (position + 8 > riffEnd) return null
    const size = view.getUint32(position + 4, true)
    const end = position + 8 + size + (size % 2) // odd sizes are padded to an even length
    if (end > riffEnd) return null
    const fourCc = String.fromCharCode(...bytes.subarray(position, position + 4))
    if (fourCc === 'VP8X') {
      if (size < 10) return null
      const chunk = bytes.slice(position, end)
      chunk[8] = view.getUint8(position + 8) & ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG)
      chunks.push(chunk)
    } else if (fourCc !== 'EXIF' && fourCc !== 'XMP ') {
      chunks.push(bytes.subarray(position, end))
    }
    position = end
  }
  const body = concat(chunks)
  const header = new Uint8Array(12)
  header.set(ascii('RIFF'), 0)
  new DataView(header.buffer).setUint32(4, 4 + body.length, true)
  header.set(ascii('WEBP'), 8)
  return concat([header, body])
}

/** The picture without its metadata (REQ-I02); the image data is copied byte for byte, never re-encoded. */
export function stripImageMetadata(bytes: Uint8Array, format: StrippableImageFormat): ImageStripResult {
  const stripped = format === 'jpeg' ? stripJpeg(bytes) : format === 'png' ? stripPng(bytes) : stripWebp(bytes)
  return stripped ? { ok: true, bytes: stripped } : { ok: false, problem: 'malformed' }
}
