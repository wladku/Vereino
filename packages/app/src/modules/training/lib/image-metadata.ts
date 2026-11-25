// The metadata a published image must not carry (training outlines spec *API* → library image routes: "images are …
// EXIF stripped at publish"; E24-S05, #685): a photo taken on a phone holds the place it was taken (GPS), the device and
// the time. A publication copies the image into the library tenant without them, by dropping the metadata blocks of
// the file — JPEG APPn segments other than JFIF, ICC and Adobe, and comments; PNG text, time and EXIF chunks; WebP
// EXIF and XMP chunks with their VP8X flags — and keeping the picture's bytes as they are. No image library is needed
// (a dependency is Ask First). Framework-free.
import type { FileFormat } from '@vereino/core'

const JPEG_KEEP_APP = new Set([0xe0, 0xe2, 0xee])
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])
const WEBP_DROP = new Set(['EXIF', 'XMP '])
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const out: Uint8Array[] = [bytes.subarray(0, 2)]
  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff || offset + 1 >= bytes.length) return null
    const marker = bytes[offset + 1]
    // Fill bytes before a marker.
    if (marker === 0xff) {
      offset += 1
      continue
    }
    // Markers without a length: TEM and RSTn.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(bytes.subarray(offset, offset + 2))
      offset += 2
      continue
    }
    // End of image, or start of scan: the rest is the compressed picture, kept as it is.
    if (marker === 0xd9 || marker === 0xda) {
      out.push(bytes.subarray(offset))
      return concat(out)
    }
    if (offset + 4 > bytes.length) return null
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    const end = offset + 2 + length
    if (length < 2 || end > bytes.length) return null
    const isApp = marker >= 0xe0 && marker <= 0xef
    const drop = (isApp && !JPEG_KEEP_APP.has(marker)) || marker === 0xfe
    if (!drop) out.push(bytes.subarray(offset, end))
    offset = end
  }
  return null
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function stripPng(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 8 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) return null
  const out: Uint8Array[] = [bytes.subarray(0, 8)]
  let offset = 8
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return null
    const length = readUint32BE(bytes, offset)
    const type = ascii(bytes, offset + 4, 4)
    const end = offset + 12 + length
    if (end > bytes.length) return null
    if (!PNG_DROP.has(type)) out.push(bytes.subarray(offset, end))
    offset = end
    if (type === 'IEND') return concat(out)
  }
  return null
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

function stripWebp(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null
  const chunks: Uint8Array[] = []
  let offset = 12
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return null
    const type = ascii(bytes, offset, 4)
    const size = readUint32LE(bytes, offset + 4)
    const end = offset + 8 + size + (size % 2)
    if (offset + 8 + size > bytes.length) return null
    if (!WEBP_DROP.has(type)) {
      const chunk = Uint8Array.from(bytes.subarray(offset, Math.min(end, bytes.length)))
      // VP8X flags: bit 3 = EXIF, bit 2 = XMP present.
      if (type === 'VP8X' && size > 0) chunk[8] &= ~0x0c
      chunks.push(chunk)
    }
    offset = end
  }
  const body = concat(chunks)
  const header = new Uint8Array(12)
  header.set(bytes.subarray(0, 12))
  const riffSize = body.length + 4
  header[4] = riffSize & 0xff
  header[5] = (riffSize >>> 8) & 0xff
  header[6] = (riffSize >>> 16) & 0xff
  header[7] = (riffSize >>> 24) & 0xff
  return concat([header, body])
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * The image without its metadata blocks; null when the bytes are not a well-formed file of `format` (the publication
 * then leaves the image out rather than copy what it cannot clean).
 */
export function stripImageMetadata(bytes: Uint8Array, format: FileFormat): Uint8Array | null {
  if (format === 'jpeg') return stripJpeg(bytes)
  if (format === 'png') return stripPng(bytes)
  if (format === 'webp') return stripWebp(bytes)
  return null
}
