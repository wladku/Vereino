// #492 (E20-S13): `Notice` is an information `<Alert>` in the light style — the `--status-info-bg` background, not the
// saturated `--status-info-border` the platform default (`style="light"`) gives.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Notice } from '../status/notice.tsx'

const h = React.createElement

test('a notice is an information alert on the light info background', () => {
  const html = renderToStaticMarkup(h(Notice, { 'data-testid': 'n', className: 'mt-2' }, 'Opens at 16:30'))
  assert.match(html, /^<div role="alert" class="[^"]*bg-status-info-bg[^"]*"/)
  assert.doesNotMatch(html, /bg-status-info-border/)
  assert.match(html, /class="[^"]* mt-2"/)
  assert.match(html, /data-status="information" data-style="lighter" data-testid="n"/)
  assert.match(html, /Opens at 16:30<\/div><\/div>$/)
})

test('a caller cannot change the status or the style of a notice', () => {
  const html = renderToStaticMarkup(h(Notice, { status: 'error', style: 'filled', variant: 'destructive' }, 'x'))
  assert.match(html, /data-status="information" data-style="lighter"/)
})
