// TEST-L14 (unit part, people life-cycle spec REQ-L14): the empty-picker hint says what is missing and offers one
// way on — in place, by link, or "ask the club administrator" without the creating feature.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PickerEmptyHint } from '../admin/picker-empty-hint.tsx'
import {
  browserFocusTarget,
  pickerEmptyHintView,
  pickerEmptyState,
  pickerHintClick,
  reloadOnFocusEffect,
} from '../admin/picker-empty-hint-model.ts'

const h = React.createElement
const labels = {
  none: 'No institution yet.',
  noMatch: 'No institution found.',
  add: 'Add an institution',
  addTerm: (term) => `Add '${term}'`,
  askAdmin: 'Ask the club administrator to add one.',
}
const inline = { kind: 'inline' }
const link = { kind: 'link', href: '/backend/club/sections/create' }

test('the empty state: none without options, no-match after a search that found nothing, null otherwise', () => {
  assert.equal(pickerEmptyState(0), 'none')
  assert.equal(pickerEmptyState(0, null), 'none')
  assert.equal(pickerEmptyState(0, '  '), 'none')
  assert.equal(pickerEmptyState(0, 'Kasia'), 'no-match')
  assert.equal(pickerEmptyState(2, 'Kasia'), null)
})

test('no option at all: "No … yet." and "Add …" with the feature, "Ask the club administrator" without', () => {
  assert.deepEqual(pickerEmptyHintView({ state: 'none', canCreate: true, create: inline, labels }), {
    message: 'No institution yet.',
    action: { kind: 'inline', label: 'Add an institution', term: null },
    askAdmin: null,
  })
  assert.deepEqual(pickerEmptyHintView({ state: 'none', canCreate: false, create: inline, labels }), {
    message: 'No institution yet.',
    action: null,
    askAdmin: 'Ask the club administrator to add one.',
  })
})

test('a search with no match offers "Add \'{term}\'" in place, and the plain add without a term label', () => {
  assert.deepEqual(
    pickerEmptyHintView({ state: 'no-match', term: ' Kasia Kowalska ', canCreate: true, create: inline, labels }),
    {
      message: 'No institution found.',
      action: { kind: 'inline', label: "Add 'Kasia Kowalska'", term: 'Kasia Kowalska' },
      askAdmin: null,
    },
  )
  const withoutTermLabel = { ...labels, addTerm: undefined }
  assert.deepEqual(
    pickerEmptyHintView({ state: 'no-match', term: 'Kasia', canCreate: true, create: inline, labels: withoutTermLabel })
      .action,
    { kind: 'inline', label: 'Add an institution', term: null },
  )
  assert.deepEqual(pickerEmptyHintView({ state: 'no-match', canCreate: true, create: inline, labels }).action, {
    kind: 'inline',
    label: 'Add an institution',
    term: null,
  })
})

test('a link create path and a record without one', () => {
  assert.deepEqual(pickerEmptyHintView({ state: 'none', canCreate: true, create: link, labels }).action, {
    kind: 'link',
    label: 'Add an institution',
    href: '/backend/club/sections/create',
  })
  assert.deepEqual(pickerEmptyHintView({ state: 'none', canCreate: true, create: null, labels }), {
    message: 'No institution yet.',
    action: null,
    askAdmin: null,
  })
})

test('the in-place click hands the term to the opener and tolerates a missing opener', () => {
  const calls = []
  pickerHintClick((term) => calls.push(term), 'Kasia')()
  pickerHintClick((term) => calls.push(term), null)()
  pickerHintClick(undefined, 'x')()
  assert.deepEqual(calls, ['Kasia', null])
})

test('the reload listens to the window focus until cleaned up, and does nothing without a window', () => {
  const listeners = new Set()
  const target = {
    addEventListener: (type, listener) => {
      assert.equal(type, 'focus')
      listeners.add(listener)
    },
    removeEventListener: (type, listener) => {
      assert.equal(type, 'focus')
      listeners.delete(listener)
    },
  }
  let reloads = 0
  const cleanup = reloadOnFocusEffect(target, () => {
    reloads += 1
  })()
  for (const listener of listeners) listener()
  assert.equal(reloads, 1)
  cleanup()
  assert.equal(listeners.size, 0)
  assert.equal(reloadOnFocusEffect(null, () => undefined)(), undefined)
})

test('the focus target is the window in a browser and null on the server', () => {
  assert.equal(browserFocusTarget(), null)
  const fakeWindow = { addEventListener() {}, removeEventListener() {} }
  globalThis.window = fakeWindow
  try {
    assert.equal(browserFocusTarget(), fakeWindow)
  } finally {
    delete globalThis.window
  }
})

test('renders the text with an in-place button the keyboard reaches after the control', () => {
  const calls = []
  const html = renderToStaticMarkup(
    h(PickerEmptyHint, {
      id: 'owner-hint',
      state: 'none',
      canCreate: true,
      create: inline,
      labels,
      onCreate: (term) => calls.push(term),
    }),
  )
  assert.match(
    html,
    /^<div id="owner-hint" class="[^"]*sm:flex-row[^"]*" data-testid="picker-empty-hint" data-state="none">/,
  )
  assert.match(html, /<p class="text-muted-foreground text-sm" aria-live="polite">No institution yet.<\/p>/)
  assert.match(
    html,
    /<button data-slot="button" class="[^"]*min-h-11 w-full sm:w-auto" type="button" data-testid="picker-empty-hint-create">Add an institution<\/button>/,
  )
  const tree = PickerEmptyHint({
    state: 'none',
    canCreate: true,
    create: inline,
    labels,
    onCreate: (term) => calls.push(term),
  })
  const button = React.Children.toArray(tree.props.children).find((child) => child.props?.onClick)
  button.props.onClick()
  assert.deepEqual(calls, [null])
})

test('renders a link that opens the create page in a new tab', () => {
  const html = renderToStaticMarkup(
    h(PickerEmptyHint, { state: 'none', canCreate: true, create: link, labels, testId: 'section-hint' }),
  )
  assert.match(
    html,
    /<a[^>]*href="\/backend\/club\/sections\/create" target="_blank" rel="noopener noreferrer" data-testid="section-hint-link" data-slot="button" class="[^"]*min-h-11 w-full sm:w-auto">Add an institution<\/a>/,
  )
  assert.doesNotMatch(html, /<button/)
})

test('without the feature: the text names who can add the record and there is no action', () => {
  const html = renderToStaticMarkup(
    h(PickerEmptyHint, { state: 'no-match', term: 'x', canCreate: false, create: inline, labels }),
  )
  assert.match(html, /data-state="no-match"/)
  assert.match(html, />No institution found. Ask the club administrator to add one.<\/p><\/div>$/)
  assert.doesNotMatch(html, /<button|<a /)
})
