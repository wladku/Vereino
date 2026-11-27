// `ConsentToggle` (foundation primitives phase A2, built with #871): the switch row with its state line, the locked
// reason, the saving announcement and the error alert; `changeConsent` asks before a withdrawal and turns a failed save
// into an outcome while the switch keeps the stored value.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConsentToggle } from '../member/consent-toggle.tsx'
import { changeConsent } from '../member/consent-toggle-model.ts'

const h = React.createElement

test('renders the switch with its state line, the page lines and no error by default', () => {
  const html = renderToStaticMarkup(
    h(
      ConsentToggle,
      { id: 'image', label: 'Image', status: 'Not given', checked: false, onChange: () => {}, testId: 'row' },
      h('p', null, 'Effect line'),
    ),
  )
  assert.match(html, /^<div class="flex flex-col gap-1" aria-busy="false" data-testid="row">/)
  assert.match(html, /<span id="image-label"[^>]*>Image<\/span>/)
  assert.match(html, /<span id="image-description"[^>]*>Not given<\/span>/)
  assert.match(html, /<p>Effect line<\/p>/)
  assert.match(html, /<span class="sr-only" aria-live="polite"><\/span>/)
  assert.doesNotMatch(html, /role="alert"/)
  assert.doesNotMatch(html, /image-locked/)
  assert.doesNotMatch(html, /disabled=""/)
})

test('saving disables and announces; a locked switch says why; an error is an alert', () => {
  const html = renderToStaticMarkup(
    h(ConsentToggle, {
      id: 'image',
      label: 'Image',
      status: 'Given',
      checked: true,
      saving: true,
      savingLabel: 'Saving…',
      locked: true,
      lockedReason: 'Only a guardian can give this consent',
      error: 'Could not save',
      onChange: () => {},
    }),
  )
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /disabled=""/)
  assert.match(html, /<p id="image-locked"[^>]*>Only a guardian can give this consent<\/p>/)
  assert.match(html, /aria-live="polite">Saving…<\/span>/)
  assert.match(html, /<p id="image-error" role="alert"[^>]*>Could not save<\/p>/)
})

test('a locked switch without a reason shows none', () => {
  const html = renderToStaticMarkup(
    h(ConsentToggle, { id: 'x', label: 'X', status: 'S', checked: false, locked: true, onChange: () => {} }),
  )
  assert.match(html, /disabled=""/)
  assert.doesNotMatch(html, /x-locked/)
})

test('changeConsent saves a grant without asking', async () => {
  const saved = []
  let asked = false
  const outcome = await changeConsent({
    next: true,
    confirmWithdrawal: async () => {
      asked = true
      return false
    },
    save: async (next) => {
      saved.push(next)
    },
  })
  assert.deepEqual(outcome, { status: 'saved' })
  assert.deepEqual(saved, [true])
  assert.equal(asked, false)
})

test('changeConsent asks before a withdrawal and stops on a refusal', async () => {
  const saved = []
  const save = async (next) => {
    saved.push(next)
  }
  assert.deepEqual(await changeConsent({ next: false, confirmWithdrawal: async () => false, save }), {
    status: 'cancelled',
  })
  assert.deepEqual(await changeConsent({ next: false, confirmWithdrawal: async () => true, save }), {
    status: 'saved',
  })
  assert.deepEqual(await changeConsent({ next: false, save }), { status: 'saved' })
  assert.deepEqual(saved, [false, false])
})

test('changeConsent turns a failed save into an outcome', async () => {
  const error = new Error('409')
  const outcome = await changeConsent({
    next: true,
    save: async () => {
      throw error
    },
  })
  assert.deepEqual(outcome, { status: 'failed', error })
})
