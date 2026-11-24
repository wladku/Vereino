import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BLACK,
  WHITE,
  accentForeground,
  clubAccent,
  contrastRatio,
  normalizeHexColor,
  relativeLuminance,
} from '../club-accent.ts'

const round2 = (value) => Math.round(value * 100) / 100

test('normalizeHexColor stores six lower-case digits with #', () => {
  assert.equal(normalizeHexColor('#1B8F3A'), '#1b8f3a')
  assert.equal(normalizeHexColor('1b8f3a'), '#1b8f3a')
  assert.equal(normalizeHexColor('  #ffd400 '), '#ffd400')
  assert.equal(normalizeHexColor('#FD0'), '#ffdd00')
  assert.equal(normalizeHexColor('abc'), '#aabbcc')
})

test('normalizeHexColor rejects anything that is not a hex colour', () => {
  assert.equal(normalizeHexColor(''), null)
  assert.equal(normalizeHexColor('#12345'), null)
  assert.equal(normalizeHexColor('#1234567'), null)
  assert.equal(normalizeHexColor('#gggggg'), null)
  assert.equal(normalizeHexColor('red'), null)
  assert.equal(normalizeHexColor('rgb(0,0,0)'), null)
  assert.equal(normalizeHexColor('##123456'), null)
})

test('relativeLuminance follows WCAG 2.2 at both ends and both channel branches', () => {
  assert.equal(relativeLuminance(BLACK), 0)
  assert.equal(relativeLuminance(WHITE), 1)
  // A channel at or under 0.04045 uses the linear part: 0x0a / 255 = 0.0392.
  assert.equal(round2(relativeLuminance('#0a0a0a') * 1000), round2((10 / 255 / 12.92) * 1000))
  assert.throws(() => relativeLuminance('not a colour'), /Not a hex colour: not a colour/)
})

test('contrastRatio is symmetric and spans 1 to 21', () => {
  assert.equal(contrastRatio(BLACK, WHITE), 21)
  assert.equal(contrastRatio(WHITE, BLACK), 21)
  assert.equal(contrastRatio('#767676', '#767676'), 1)
})

test('accentForeground matches the tokens.md table and always reaches 4.5:1', () => {
  const table = [
    ['#1b8f3a', BLACK, 5.04],
    ['#ffd400', BLACK, 14.67],
    ['#6ec6ff', BLACK, 11.18],
    ['#e53935', BLACK, 4.97],
    ['#0b2a5b', WHITE, 14.03],
    ['#767676', BLACK, 4.62],
  ]
  for (const [color, foreground, ratio] of table) {
    assert.equal(accentForeground(color), foreground, color)
    assert.equal(round2(contrastRatio(color, foreground)), ratio, color)
  }
  // Every grey: the better of black and white never drops under 4.58:1.
  for (let level = 0; level <= 255; level += 1) {
    const hex = `#${level.toString(16).padStart(2, '0').repeat(3)}`
    assert.ok(contrastRatio(hex, accentForeground(hex)) >= 4.58, hex)
  }
})

test('clubAccent pairs a stored colour with its text colour; nothing stored or a bad value is null', () => {
  assert.deepEqual(clubAccent('#0B2A5B'), { color: '#0b2a5b', foreground: WHITE })
  assert.deepEqual(clubAccent('#ffd400'), { color: '#ffd400', foreground: BLACK })
  assert.equal(clubAccent(null), null)
  assert.equal(clubAccent(undefined), null)
  assert.equal(clubAccent(''), null)
  assert.equal(clubAccent('blue'), null)
})
