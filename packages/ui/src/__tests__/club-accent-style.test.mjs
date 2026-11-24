// The club's colour as the inline style of a frame (E20-S07 #486).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clubAccentStyle } from '../theme/club-accent-style.ts'

test('a club colour sets both accent variables', () => {
  assert.deepEqual(clubAccentStyle({ color: '#0b2a5b', foreground: '#ffffff' }), {
    '--club-accent': '#0b2a5b',
    '--club-accent-foreground': '#ffffff',
  })
})

test('no colour leaves the default tokens in place', () => {
  assert.equal(clubAccentStyle(null), undefined)
  assert.equal(clubAccentStyle(undefined), undefined)
})

test('ClubAccentRoot puts the variables on its div, and none without a colour', async () => {
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { ClubAccentRoot } = await import('../theme/club-accent-root.tsx')
  const h = React.createElement
  assert.equal(
    renderToStaticMarkup(
      h(ClubAccentRoot, { accent: { color: '#ffd400', foreground: '#000000' }, className: 'x' }, 'body'),
    ),
    '<div class="x" style="--club-accent:#ffd400;--club-accent-foreground:#000000">body</div>',
  )
  assert.equal(renderToStaticMarkup(h(ClubAccentRoot, { accent: null }, 'body')), '<div>body</div>')
})
