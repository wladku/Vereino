// `ErrorSummary`, `FieldErrorMessage` and their model (R04.1–R04.3; #490): the summary lists every problem as a link
// to its field and renders nothing without a problem; a field names its error message; the focus moves to the first
// field to fix, or to a link's field, and nothing breaks without a document or a field.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorSummary, FieldErrorMessage } from '../member/error-summary.tsx'
import {
  fieldErrorId,
  fieldProblemProps,
  focusField,
  focusFirstProblem,
  focusOnClick,
  problemOf,
} from '../member/error-summary-model.ts'

const h = React.createElement
const problems = [
  { fieldId: 'subject', message: 'Enter a subject' },
  { fieldId: 'body', message: 'Enter a message' },
]

/** A document with the given field ids; `focused` records what took the focus. */
function fakeRoot(ids) {
  const focused = []
  return {
    focused,
    getElementById: (id) => (ids.includes(id) ? { focus: () => focused.push(id) } : null),
  }
}

test('the summary: a section labelled by the title and one link per problem, in order', () => {
  const html = renderToStaticMarkup(h(ErrorSummary, { title: 'Check the form', problems, 'data-testid': 'summary' }))
  assert.match(
    html,
    /^<section aria-labelledby="(.+?)-title" class="border-destructive [^"]*" data-testid="summary" data-error-summary="">/,
  )
  assert.match(html, /<h2 id="[^"]+-title" class="text-base font-semibold">Check the form<\/h2>/)
  assert.ok(html.indexOf('href="#subject"') < html.indexOf('href="#body"'))
  assert.match(html, /<a href="#subject" class="text-destructive [^"]*">Enter a subject<\/a>/)
  assert.match(html, /<a href="#body" class="[^"]*">Enter a message<\/a>/)
})

test('the summary takes an extra class and renders nothing without a problem', () => {
  assert.match(renderToStaticMarkup(h(ErrorSummary, { title: 'T', problems, className: 'mb-2' })), /p-4 mb-2"/)
  assert.equal(renderToStaticMarkup(h(ErrorSummary, { title: 'T', problems: [] })), '')
})

test('the field message carries the id the field names, and nothing without a message', () => {
  assert.equal(
    renderToStaticMarkup(h(FieldErrorMessage, { fieldId: 'subject', message: 'Enter a subject', 'data-testid': 'e' })),
    '<p id="subject-error" class="text-destructive text-sm" data-testid="e">Enter a subject</p>',
  )
  assert.equal(renderToStaticMarkup(h(FieldErrorMessage, { fieldId: 'subject', message: null })), '')
  assert.equal(fieldErrorId('body'), 'body-error')
})

test('problemOf and fieldProblemProps: invalid and described by the message, else only the hint', () => {
  assert.equal(problemOf(problems, 'body'), 'Enter a message')
  assert.equal(problemOf(problems, 'about'), null)
  assert.deepEqual(fieldProblemProps(problems, 'subject'), {
    'aria-invalid': true,
    'aria-describedby': 'subject-error',
  })
  assert.deepEqual(fieldProblemProps(problems, 'body', 'hint'), {
    'aria-invalid': true,
    'aria-describedby': 'hint body-error',
  })
  assert.deepEqual(fieldProblemProps(problems, 'about', 'hint'), { 'aria-describedby': 'hint' })
  assert.deepEqual(fieldProblemProps(problems, 'about'), {})
})

test('focus: the first problem, a given field, a link; false without the field, a problem or a document', () => {
  const root = fakeRoot(['subject', 'body'])
  assert.equal(focusFirstProblem(problems, root), true)
  assert.equal(focusField('body', root), true)
  assert.equal(focusField('missing', root), false)
  assert.equal(focusFirstProblem([], root), false)
  let prevented = false
  focusOnClick('subject', root)({ preventDefault: () => (prevented = true) })
  assert.equal(prevented, true)
  assert.deepEqual(root.focused, ['subject', 'body', 'subject'])
  // Node has no `document`: the default root is missing, so nothing is focused.
  assert.equal(focusField('subject'), false)
  assert.equal(focusField('subject', undefined), false)
})
