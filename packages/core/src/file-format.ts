// The upload checks shared by the modules that store files (engineering standards S8.11): `club_core` (logos, section
// materials, place files) and `facilities` (incident photos, #126). The format is read from the file's magic bytes,
// never from its name or declared type, so an SVG or HTML file renamed to `.png` is still refused.

/** The formats a Vereino upload may have: PDF and the raster image formats (no SVG: script risk). */
export const FILE_FORMATS = ['pdf', 'png', 'jpeg', 'webp'] as const

export type FileFormat = (typeof FILE_FORMATS)[number]

export const FORMAT_MIME_TYPES: Readonly<Record<FileFormat, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0))

/** The format of a file from its first bytes, or null for anything Vereino does not accept. */
export function detectFileFormat(bytes: Uint8Array): FileFormat | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'webp'
  if (startsWith(bytes, ascii('%PDF-'))) return 'pdf'
  return null
}

export type FileProblem = 'format_unsupported' | 'too_large' | 'empty'

export type CheckedFile = { format: FileFormat; mimeType: string; size: number }

export type FileCheck = { ok: true; file: CheckedFile } | { ok: false; problem: FileProblem }

/** An upload of one of `formats` up to `maxBytes`, checked by its bytes. */
export function checkFileBytes(bytes: Uint8Array, formats: readonly FileFormat[], maxBytes: number): FileCheck {
  if (bytes.length === 0) return { ok: false, problem: 'empty' }
  if (bytes.length > maxBytes) return { ok: false, problem: 'too_large' }
  const format = detectFileFormat(bytes)
  if (!format || !formats.includes(format)) return { ok: false, problem: 'format_unsupported' }
  return { ok: true, file: { format, mimeType: FORMAT_MIME_TYPES[format], size: bytes.length } }
}

/** A stored file name for a format: the uploaded name without path or control characters, with the format's extension. */
export function storedFileName(uploaded: string | null | undefined, format: FileFormat, fallback: string): string {
  const lastSegment = (uploaded ?? '').split(/[\\/]/).slice(-1).join('')
  const printable = Array.from(lastSegment)
    .filter((char) => char.charCodeAt(0) >= 0x20 && char.charCodeAt(0) !== 0x7f)
    .join('')
  const base = printable
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 120)
  const extension = format === 'jpeg' ? 'jpg' : format
  return `${base || fallback}.${extension}`
}
