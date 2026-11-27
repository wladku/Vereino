// `QrCode` and its model (personal invitation link spec IL-D06; #868): the matrix of a text, the SVG path with the
// quiet zone, and the image named for assistive technology on a white background.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QR_QUIET_ZONE, qrMatrix, qrSvgPath } from '../member/qr-code-model.ts'
import { QrCode } from '../member/qr-code.tsx'

const URL = 'https://ks-avocado.example.org/club/i/abcdefghijklmnop'

test('qrMatrix: a square matrix whose three finder corners are dark', () => {
  const matrix = qrMatrix(URL)
  assert.ok(matrix.size >= 21)
  assert.equal((matrix.size - 17) % 4, 0)
  assert.equal(matrix.isDark(0, 0), true)
  assert.equal(matrix.isDark(0, matrix.size - 1), true)
  assert.equal(matrix.isDark(matrix.size - 1, 0), true)
  // The separator next to the top-left finder pattern is light.
  assert.equal(matrix.isDark(7, 7), false)
})

test('qrSvgPath: one unit square per dark module, offset by the quiet zone', () => {
  const matrix = { size: 2, isDark: (row, col) => row === col }
  assert.equal(qrSvgPath(matrix, 1), 'M1 1h1v1h-1zM2 2h1v1h-1z')
  assert.equal(qrSvgPath(matrix), `M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h1v1h-1zM5 5h1v1h-1z`)
  assert.equal(qrSvgPath({ size: 1, isDark: () => false }), '')
})

test('QrCode: an SVG image with its name, the view box with the quiet zone and dark modules on white', () => {
  const size = qrMatrix(URL).size + 2 * QR_QUIET_ZONE
  const html = renderToStaticMarkup(
    React.createElement(QrCode, {
      value: URL,
      label: 'QR code of the link',
      className: 'mx-auto',
      'data-testid': 'qr',
    }),
  )
  assert.match(html, /^<svg role="img" aria-label="QR code of the link"/)
  assert.ok(html.includes(`viewBox="0 0 ${size} ${size}" width="240" height="240"`))
  assert.match(html, /class="max-w-full rounded-md mx-auto" data-testid="qr">/)
  assert.ok(html.includes(`<rect width="${size}" height="${size}" fill="#ffffff"></rect>`))
  assert.match(html, /<path d="M4 4h1v1h-1z[^"]*" fill="#000000"><\/path><\/svg>$/)
  const small = renderToStaticMarkup(React.createElement(QrCode, { value: 'x', label: 'QR', size: 120 }))
  assert.match(small, /width="120" height="120" shape-rendering="crispEdges" class="max-w-full rounded-md">/)
})
