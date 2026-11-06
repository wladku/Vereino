// `DeclarationControls` (foundation P-19, phase C; D-022, D-026; M-14): the buttons follow the session's kind, the
// status line is announced, a closed or saving declaration disables the buttons, an error is an alert.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DeclarationControls } from '../member/declaration-controls.tsx'
import { declarationActions, declarationStatusText } from '../member/declaration-controls-model.ts'
import { findElements } from './admin-test-helpers.mjs'

const h = React.createElement
const labels = {
  attending: 'Attending',
  notAttending: 'Not attending',
  reportAbsence: 'Report absence',
  undoAbsence: 'Undo',
  expected: 'Expected',
  absent: 'Absence reported',
  noAnswer: 'No answer yet',
}

test('an absence-only session offers "Report absence", then its undo', () => {
  assert.deepEqual(declarationActions('absence_only', 'unknown', labels), [
    { value: 'no', label: 'Report absence', pressed: null },
  ])
  assert.deepEqual(declarationActions('absence_only', 'yes', labels), [
    { value: 'no', label: 'Report absence', pressed: null },
  ])
  assert.deepEqual(declarationActions('absence_only', 'no', labels), [
    { value: 'unknown', label: 'Undo', pressed: null },
  ])
  assert.equal(declarationStatusText('absence_only', 'unknown', labels), 'Expected')
  assert.equal(declarationStatusText('absence_only', 'no', labels), 'Absence reported')
})

test('a confirm session offers the pressed pair and names the answer', () => {
  assert.deepEqual(declarationActions('confirm', 'yes', labels), [
    { value: 'yes', label: 'Attending', pressed: true },
    { value: 'no', label: 'Not attending', pressed: false },
  ])
  assert.deepEqual(
    declarationActions('confirm', 'no', labels).map((action) => action.pressed),
    [false, true],
  )
  assert.equal(declarationStatusText('confirm', 'yes', labels), 'Attending')
  assert.equal(declarationStatusText('confirm', 'no', labels), 'Not attending')
  assert.equal(declarationStatusText('confirm', 'unknown', labels), 'No answer yet')
})

test('renders the name, the announced status and the pressed buttons of a confirm session', () => {
  const html = renderToStaticMarkup(
    h(DeclarationControls, { id: 'p1', name: 'Zuzia', kind: 'confirm', declared: 'yes', labels, onDeclare: () => {} }),
  )
  assert.match(
    html,
    /^<div role="group" aria-labelledby="p1-name" aria-describedby="p1-status" class="flex flex-col gap-2" data-testid="declaration-controls" data-declared="yes">/,
  )
  assert.match(html, /<p id="p1-name" class="font-medium">Zuzia<\/p>/)
  assert.match(html, /<p id="p1-status" aria-live="polite"[^>]*>Attending<\/p>/)
  assert.match(html, /aria-pressed="true"[^>]*data-testid="declaration-action-yes"/)
  assert.match(html, /aria-pressed="false"[^>]*data-testid="declaration-action-no"/)
  assert.doesNotMatch(html, /disabled=""|aria-busy|role="alert"/)
})

test('a saving or closed declaration disables the buttons; an error is an alert', () => {
  const busy = renderToStaticMarkup(
    h(DeclarationControls, {
      id: 'p2',
      name: 'Kuba',
      kind: 'absence_only',
      declared: 'no',
      labels,
      onDeclare: () => {},
      busy: true,
      error: 'Declarations are closed',
    }),
  )
  assert.match(busy, /aria-busy="true"/)
  assert.match(busy, /<button[^>]*disabled=""[^>]*data-testid="declaration-action-unknown"[^>]*>Undo<\/button>/)
  assert.doesNotMatch(busy, /aria-pressed/)
  assert.match(busy, /<p id="p2-error" role="alert"[^>]*>Declarations are closed<\/p>/)
  const closed = renderToStaticMarkup(
    h(DeclarationControls, {
      id: 'p3',
      name: 'Ola',
      kind: 'absence_only',
      declared: 'unknown',
      labels,
      onDeclare: () => {},
      disabled: true,
    }),
  )
  assert.match(closed, /<button[^>]*disabled=""[^>]*>Report absence<\/button>/)
  assert.doesNotMatch(closed, /aria-busy/)
})

test('a button declares its value', () => {
  const declared = []
  const tree = DeclarationControls({
    id: 'p4',
    name: 'Zuzia',
    kind: 'confirm',
    declared: 'unknown',
    labels,
    onDeclare: (value) => declared.push(value),
  })
  const buttons = findElements(tree, (node) => typeof node.props.onClick === 'function')
  for (const button of buttons) button.props.onClick()
  assert.deepEqual(declared, ['yes', 'no'])
})
