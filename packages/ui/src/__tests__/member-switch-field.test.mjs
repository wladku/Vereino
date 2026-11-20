// `MemberSwitchField` (E20-S12, #491; R05.1): the whole row is one label at least 44 px high pointing at the switch, the
// switch is 44 × 44 px, named by the label text alone and described by the description; disabled rows look disabled.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { MemberSwitchField } from '../member/member-switch-field.tsx'
import { findElements } from './admin-test-helpers.mjs'

const h = React.createElement

test('the row is a 44 px label for the switch, named by the label and described by the description', () => {
  const html = renderToStaticMarkup(
    h(MemberSwitchField, {
      id: 'consent-image',
      label: 'Image',
      description: 'Given on 1 May',
      badge: h('em', null, 'Earlier wording'),
      checked: true,
      onCheckedChange: () => {},
    }),
  )
  assert.match(
    html,
    /^<label for="consent-image" class="flex min-h-11 items-center gap-3 select-none cursor-pointer" data-member-switch-row="">/,
  )
  assert.match(html, /<span id="consent-image-label"[^>]*>Image<\/span>/)
  assert.match(html, /<span class="inline-flex shrink-0"><em>Earlier wording<\/em><\/span>/)
  assert.match(html, /<span id="consent-image-description"[^>]*>Given on 1 May<\/span>/)
  assert.match(html, /<button type="button" role="switch" aria-checked="true"/)
  assert.match(html, /aria-labelledby="consent-image-label"/)
  assert.match(html, /aria-describedby="consent-image-description"/)
  assert.match(html, /class="[^"]*min-h-11 min-w-11[^"]*"/)
  assert.match(html, /<span class="flex min-w-0 flex-1 flex-col gap-1">/)
})

test('without a description or badge the switch has no description, and a disabled row looks disabled', () => {
  const html = renderToStaticMarkup(
    h(MemberSwitchField, {
      id: 'share',
      label: 'Share',
      description: '',
      checked: false,
      disabled: true,
      onCheckedChange: () => {},
    }),
  )
  assert.match(html, /class="flex min-h-11 items-center gap-3 select-none cursor-not-allowed"/)
  assert.match(html, /<span class="flex min-w-0 flex-1 flex-col gap-1 opacity-60">/)
  assert.doesNotMatch(html, /share-description/)
  assert.doesNotMatch(html, /aria-describedby/)
  assert.doesNotMatch(html, /inline-flex shrink-0/)
  assert.match(html, /aria-checked="false"/)
  assert.match(html, /disabled=""/)
})

test('the switch reports the new value to the page', () => {
  const changes = []
  const tree = MemberSwitchField({
    id: 'trips',
    label: 'Trips',
    checked: false,
    onCheckedChange: (checked) => changes.push(checked),
  })
  const [control] = findElements(tree, (element) => element.type === Switch)
  assert.equal(control.props.id, 'trips')
  control.props.onCheckedChange(true)
  assert.deepEqual(changes, [true])
})
