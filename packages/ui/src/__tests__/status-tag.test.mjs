// #482 (E20-S03): `StatusTag` renders every status of `docs/ux-concept/tokens.md` with its word and its icon; the icon
// is decorative (`aria-hidden`), so the word stays the accessible name.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { STATUS_TAG_KINDS, StatusTag } from '../status/status-tag.tsx'

const h = React.createElement

// Status → tone and Lucide icon, as the tokens.md `--status-*` rows name them.
const EXPECTED = {
  success: ['success', 'circle-check'],
  warning: ['warning', 'clock'],
  error: ['error', 'circle-alert'],
  canceled: ['error', 'circle-x'],
  neutral: ['neutral', 'circle-dashed'],
  declined: ['neutral', 'x'],
  closed: ['neutral', 'calendar-x'],
  info: ['info', 'info'],
  people: ['info', 'users'],
}

test('the status map covers exactly the tokens.md statuses', () => {
  assert.deepEqual(Object.keys(STATUS_TAG_KINDS).sort(), Object.keys(EXPECTED).sort())
})

for (const [status, [tone, icon]] of Object.entries(EXPECTED)) {
  test(`"${status}" renders a ${tone} pill with the ${icon} icon before the word`, () => {
    const html = renderToStaticMarkup(h(StatusTag, { status }, 'Word'))
    assert.match(html, new RegExp(`^<div data-slot="badge" data-variant="${tone}"`))
    assert.match(html, new RegExp(`data-status-tag="${status}"`))
    assert.match(
      html,
      new RegExp(
        `<span data-slot="badge-leading-icon" aria-hidden="true" [^>]*><svg [^>]*class="lucide lucide-${icon}(?: lucide-[a-z0-9-]+)* text-status-${tone}-icon"[^>]*aria-hidden="true"[^>]*>.*</svg></span>Word</div>$`,
      ),
    )
    assert.equal((html.match(/<svg/g) ?? []).length, 1)
  })
}

test('the light appearance uses the lighter tint, the stroke appearance the outlined pill', () => {
  const light = renderToStaticMarkup(h(StatusTag, { status: 'success', appearance: 'light' }, 'Paid'))
  assert.match(light, /data-appearance="light"/)
  assert.match(light, /bg-status-success-bg/)
  const stroke = renderToStaticMarkup(h(StatusTag, { status: 'neutral', appearance: 'stroke' }, 'Skipped'))
  assert.match(stroke, /data-appearance="stroke"/)
  assert.match(stroke, /border-border bg-background text-muted-foreground shadow-none/)
})

test('className and data-testid reach the pill', () => {
  const html = renderToStaticMarkup(h(StatusTag, { status: 'info', className: 'ml-2', 'data-testid': 'tag' }, 'Note'))
  assert.match(html, /data-testid="tag"/)
  assert.match(html, /class="[^"]*\bml-2"/)
})
