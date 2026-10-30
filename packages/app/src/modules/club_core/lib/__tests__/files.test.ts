import { describe, expect, it } from '@jest/globals'
import {
  FORMAT_MIME_TYPES,
  LOGO_FORMATS,
  LOGO_MAX_BYTES,
  MATERIAL_FORMATS,
  MATERIAL_MAX_BYTES,
  checkLogo,
  checkMaterial,
  detectFileFormat,
  effectiveLogo,
  nameInitial,
  staffLogoUrl,
  storedFileName,
} from '../files'

const bytes = (...values: number[]) => Uint8Array.from(values)
const text = (value: string) => Uint8Array.from(Buffer.from(value, 'latin1'))
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0)
const WEBP = text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')
const PDF = text('%PDF-1.7\n')
const SVG = text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')

function sized(head: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size)
  out.set(head)
  return out
}

describe('file formats by magic bytes', () => {
  it('detects PNG, JPEG, WebP and PDF and nothing else', () => {
    expect(detectFileFormat(PNG)).toBe('png')
    expect(detectFileFormat(JPEG)).toBe('jpeg')
    expect(detectFileFormat(WEBP)).toBe('webp')
    expect(detectFileFormat(PDF)).toBe('pdf')
    expect(detectFileFormat(SVG)).toBeNull()
    expect(detectFileFormat(text('RIFF\u0000\u0000\u0000\u0000WAVE'))).toBeNull()
    expect(detectFileFormat(bytes(0x89, 0x50))).toBeNull()
    expect(detectFileFormat(bytes())).toBeNull()
  })

  it('declares the accepted formats, limits and MIME types', () => {
    expect(LOGO_FORMATS).toEqual(['png', 'jpeg', 'webp'])
    expect(MATERIAL_FORMATS).toEqual(['pdf', 'png', 'jpeg', 'webp'])
    expect(LOGO_MAX_BYTES).toBe(2 * 1024 * 1024)
    expect(MATERIAL_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(FORMAT_MIME_TYPES).toEqual({
      pdf: 'application/pdf',
      png: 'image/png',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    })
  })
})

describe('logo and material checks', () => {
  it('accepts a logo image up to 2 MB', () => {
    expect(checkLogo(PNG)).toEqual({ ok: true, file: { format: 'png', mimeType: 'image/png', size: PNG.length } })
    expect(checkLogo(sized(WEBP, LOGO_MAX_BYTES))).toMatchObject({ ok: true, file: { format: 'webp' } })
  })

  it('refuses an SVG, a PDF logo, a file over 2 MB and an empty file', () => {
    expect(checkLogo(SVG)).toEqual({ ok: false, problem: 'format_unsupported' })
    expect(checkLogo(PDF)).toEqual({ ok: false, problem: 'format_unsupported' })
    expect(checkLogo(sized(PNG, LOGO_MAX_BYTES + 1))).toEqual({ ok: false, problem: 'too_large' })
    expect(checkLogo(bytes())).toEqual({ ok: false, problem: 'empty' })
  })

  it('accepts a PDF or image material up to 10 MB and refuses the rest', () => {
    expect(checkMaterial(PDF)).toEqual({
      ok: true,
      file: { format: 'pdf', mimeType: 'application/pdf', size: PDF.length },
    })
    expect(checkMaterial(JPEG)).toMatchObject({ ok: true, file: { format: 'jpeg' } })
    expect(checkMaterial(SVG)).toEqual({ ok: false, problem: 'format_unsupported' })
    expect(checkMaterial(sized(PDF, MATERIAL_MAX_BYTES + 1))).toEqual({ ok: false, problem: 'too_large' })
  })

  it('stores a file name without its path or control characters and with the format extension', () => {
    expect(storedFileName('C:\\fakepath\\Herb klubu.PNG', 'png', 'logo')).toBe('Herb klubu.png')
    expect(storedFileName('../../etc/regulamin.pdf', 'pdf', 'material')).toBe('regulamin.pdf')
    expect(storedFileName('photo\u0000\u0007.jpeg', 'jpeg', 'logo')).toBe('photo.jpg')
    expect(storedFileName('evil.svg', 'webp', 'logo')).toBe('evil.webp')
    expect(storedFileName('', 'png', 'logo')).toBe('logo.png')
    expect(storedFileName(null, 'pdf', 'material')).toBe('material.pdf')
    expect(storedFileName('x'.repeat(200) + '.pdf', 'pdf', 'material')).toBe('x'.repeat(120) + '.pdf')
  })
})

describe('effective logo', () => {
  it('takes the section logo, else the club logo, else the initial', () => {
    expect(effectiveLogo({ sectionLogoId: 's', clubLogoId: 'c' })).toEqual({ attachmentId: 's', source: 'section' })
    expect(effectiveLogo({ sectionLogoId: null, clubLogoId: 'c' })).toEqual({ attachmentId: 'c', source: 'club' })
    expect(effectiveLogo({ clubLogoId: 'c' })).toEqual({ attachmentId: 'c', source: 'club' })
    expect(effectiveLogo({ sectionLogoId: null, clubLogoId: null })).toEqual({ attachmentId: null, source: 'initial' })
  })

  it('shows the first letter or digit of a name, upper-cased', () => {
    expect(nameInitial('dev Academy')).toBe('D')
    expect(nameInitial('  „Żaki” Warszawa')).toBe('Ż')
    expect(nameInitial('1. FC')).toBe('1')
    expect(nameInitial('')).toBe('?')
    expect(nameInitial(null)).toBe('?')
    expect(nameInitial(undefined)).toBe('?')
  })

  it('builds the authenticated image URL of a logo', () => {
    expect(staffLogoUrl('abc')).toBe('/api/attachments/image/abc?width=128&height=128&cropType=contain')
    expect(staffLogoUrl('abc', 64)).toBe('/api/attachments/image/abc?width=64&height=64&cropType=contain')
    expect(staffLogoUrl(null)).toBeNull()
  })
})
