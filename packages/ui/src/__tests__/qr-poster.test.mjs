// The printable QR poster (#869): an A4 SVG document with the title, the lines, the code with its quiet zone and the
// address under it; every text escaped.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QR_QUIET_ZONE, qrMatrix, qrSvgPath } from '../member/qr-code-model.ts'
import { QR_POSTER_HEIGHT, QR_POSTER_WIDTH, escapeSvgText, qrPosterSvg } from '../member/qr-poster-model.ts'

const URL = 'https://ks-avocado.example.org/p/ks-avocado/sections/football/apply?group=0b6f'

test('escapeSvgText: the five XML specials, everything else as it is', () => {
  assert.equal(escapeSvgText(`Tom & "Jerry" <U10> 'a'`), 'Tom &amp; &quot;Jerry&quot; &lt;U10&gt; &#39;a&#39;')
  assert.equal(escapeSvgText('Żaki 2019'), 'Żaki 2019')
})

test('qrPosterSvg: an A4 page with the title, the non-empty lines, the code and the address', () => {
  const svg = qrPosterSvg({
    value: URL,
    title: 'Żaki <2019>',
    lines: ['KS Avocado · Football', ' ', 'Scan to sign up'],
  })
  const view = qrMatrix(URL).size + 2 * QR_QUIET_ZONE
  assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"'))
  assert.ok(svg.includes(`width="${QR_POSTER_WIDTH}mm" height="${QR_POSTER_HEIGHT}mm"`))
  assert.ok(svg.includes('<title>Żaki &lt;2019&gt;</title>'))
  assert.ok(svg.includes('font-weight="bold" text-anchor="middle">Żaki &lt;2019&gt;</text>'))
  assert.ok(svg.includes('y="52" font-size="7" font-weight="normal" text-anchor="middle">KS Avocado · Football</text>'))
  // The blank line is dropped, so the second line sits right under the first.
  assert.ok(svg.includes('y="61" font-size="7" font-weight="normal" text-anchor="middle">Scan to sign up</text>'))
  assert.ok(svg.includes(`<svg x="30" y="70" width="150" height="150" viewBox="0 0 ${view} ${view}"`))
  assert.ok(svg.includes(`<path d="${qrSvgPath(qrMatrix(URL))}" fill="#000000"/>`))
  assert.ok(svg.includes(`y="230" font-size="4.5" font-weight="normal" text-anchor="middle">${URL}</text>`))
  assert.ok(svg.endsWith('</svg>\n'))
})

test('qrPosterSvg: without lines the code follows the title', () => {
  const svg = qrPosterSvg({ value: 'x', title: 'Group' })
  assert.ok(svg.includes('<svg x="30" y="52" width="150" height="150"'))
  assert.ok(svg.includes('y="212" font-size="4.5"'))
})
