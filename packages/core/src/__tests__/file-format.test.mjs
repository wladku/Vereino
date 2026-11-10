import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FILE_FORMATS, FORMAT_MIME_TYPES, checkFileBytes, detectFileFormat, storedFileName } from '../file-format.ts'

const bytes = (...values) => new Uint8Array(values)
const text = (value) => new Uint8Array(Array.from(value, (char) => char.charCodeAt(0)))
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0)
const WEBP = text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')
const PDF = text('%PDF-1.7')

test('detectFileFormat reads the magic bytes, never the name', () => {
  assert.equal(detectFileFormat(PNG), 'png')
  assert.equal(detectFileFormat(JPEG), 'jpeg')
  assert.equal(detectFileFormat(WEBP), 'webp')
  assert.equal(detectFileFormat(PDF), 'pdf')
  assert.equal(detectFileFormat(text('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
  assert.equal(detectFileFormat(text('RIFF\u0000\u0000\u0000\u0000WAVE')), null)
  assert.equal(detectFileFormat(bytes(0x89, 0x50)), null)
  assert.equal(detectFileFormat(bytes()), null)
  assert.deepEqual([...FILE_FORMATS], ['pdf', 'png', 'jpeg', 'webp'])
  assert.equal(FORMAT_MIME_TYPES.webp, 'image/webp')
})

test('checkFileBytes refuses an empty, too large or unlisted file', () => {
  assert.deepEqual(checkFileBytes(PNG, ['png', 'jpeg'], 100), {
    ok: true,
    file: { format: 'png', mimeType: 'image/png', size: PNG.length },
  })
  assert.deepEqual(checkFileBytes(bytes(), ['png'], 100), { ok: false, problem: 'empty' })
  assert.deepEqual(checkFileBytes(PNG, ['png'], 4), { ok: false, problem: 'too_large' })
  assert.deepEqual(checkFileBytes(PDF, ['png'], 100), { ok: false, problem: 'format_unsupported' })
  assert.deepEqual(checkFileBytes(text('hello'), ['png'], 100), { ok: false, problem: 'format_unsupported' })
})

test('storedFileName keeps the last path segment, drops control characters and sets the extension', () => {
  assert.equal(storedFileName('C:\\fakepath\\Herb klubu.PNG', 'png', 'logo'), 'Herb klubu.png')
  assert.equal(storedFileName('../../etc/regulamin.pdf', 'pdf', 'material'), 'regulamin.pdf')
  assert.equal(storedFileName('photo\u0000\u0007.jpeg', 'jpeg', 'logo'), 'photo.jpg')
  assert.equal(storedFileName('', 'png', 'photo'), 'photo.png')
  assert.equal(storedFileName(null, 'pdf', 'material'), 'material.pdf')
  assert.equal(storedFileName('x'.repeat(200) + '.pdf', 'pdf', 'material'), 'x'.repeat(120) + '.pdf')
})
