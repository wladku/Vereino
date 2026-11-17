// TEST-L14 (unit part, people life-cycle spec REQ-L14): the in-place create takes at most four fields, validates the
// required ones, creates through the consumer, selects the new option and closes; a failure stays in the dialog.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InlineCreateDialog, InlineCreateForm, InlineCreateFormView } from '../admin/inline-create-dialog.tsx'
import {
  INLINE_CREATE_MAX_FIELDS,
  assertInlineCreateFields,
  createInlineCreateHandlers,
  inlineCreateErrors,
  inlineCreateIds,
  inlineCreateInitialState,
  inlineCreatePayload,
  inlineCreateReducer,
  returnFocusTo,
} from '../admin/inline-create-dialog-model.ts'
import { findElements, flush } from './admin-test-helpers.mjs'

const h = React.createElement
const fields = [
  { id: 'name', label: 'Name', type: 'text', required: true, maxLength: 200 },
  {
    id: 'kind',
    label: 'Kind',
    type: 'select',
    options: [
      { value: 'municipality', label: 'Municipality' },
      { value: 'school', label: 'School' },
    ],
  },
]
const labels = { submit: 'Add', saving: 'Saving…', cancel: 'Cancel', close: 'Close', required: 'Required' }
const noop = () => undefined

test('an in-place create takes one to four fields', () => {
  assert.equal(INLINE_CREATE_MAX_FIELDS, 4)
  assert.throws(() => assertInlineCreateFields([]), /1 to 4 fields, got 0/)
  assert.throws(
    () => assertInlineCreateFields(Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, label: 'F', type: 'text' }))),
    /got 5/,
  )
  assert.doesNotThrow(() => assertInlineCreateFields(fields))
})

test('the first state prefills the given values and leaves the others empty', () => {
  assert.deepEqual(inlineCreateInitialState(fields, { name: 'Gmina', other: 'x' }), {
    values: { name: 'Gmina', kind: '' },
    errors: {},
    problem: null,
    pending: false,
  })
  assert.deepEqual(inlineCreateInitialState(fields).values, { name: '', kind: '' })
})

test('the reducer: a change clears its field error; submitting, invalid and failed', () => {
  const start = {
    values: { name: '', kind: '' },
    errors: { name: 'Required', kind: 'Bad' },
    problem: 'Old',
    pending: false,
  }
  const changed = inlineCreateReducer(start, { type: 'change', id: 'name', value: 'Gmina' })
  assert.deepEqual(changed.values, { name: 'Gmina', kind: '' })
  assert.deepEqual(changed.errors, { kind: 'Bad' })
  const submitting = inlineCreateReducer(changed, { type: 'submitting' })
  assert.equal(submitting.pending, true)
  assert.equal(submitting.problem, null)
  assert.deepEqual(inlineCreateReducer(submitting, { type: 'invalid', errors: { name: 'Required' } }).errors, {
    name: 'Required',
  })
  const failedOnField = inlineCreateReducer(submitting, {
    type: 'failed',
    problem: { message: 'Taken', field: 'name' },
  })
  assert.deepEqual(failedOnField, {
    values: changed.values,
    errors: { name: 'Taken' },
    problem: 'Taken',
    pending: false,
  })
  assert.deepEqual(inlineCreateReducer(submitting, { type: 'failed', problem: { message: 'Down' } }).errors, {})
})

test('required fields left blank get the message; the payload is trimmed without empty optional fields', () => {
  assert.deepEqual(inlineCreateErrors(fields, { name: '  ', kind: '' }, 'Required'), { name: 'Required' })
  assert.deepEqual(inlineCreateErrors(fields, {}, 'Required'), { name: 'Required' })
  assert.deepEqual(inlineCreateErrors(fields, { name: 'Gmina' }, 'Required'), {})
  assert.deepEqual(inlineCreatePayload(fields, { name: ' Gmina ', kind: '' }), { name: 'Gmina' })
  assert.deepEqual(inlineCreatePayload(fields, { name: 'Gmina', kind: 'school' }), { name: 'Gmina', kind: 'school' })
  assert.deepEqual(inlineCreatePayload(fields, {}), {})
})

function harness(stateOverrides = {}, onCreate = async (values) => ({ value: 'i-1', label: values.name })) {
  const log = []
  const state = { ...inlineCreateInitialState(fields, { name: 'Gmina' }), ...stateOverrides }
  const handlers = createInlineCreateHandlers({
    fields,
    state,
    dispatch: (action) => log.push(['dispatch', action]),
    requiredMessage: 'Required',
    onCreate,
    onCreated: (option) => log.push(['created', option]),
    onOpenChange: (open) => log.push(['open', open]),
    describeError: (error) => ({ message: `Failed: ${error.message}`, field: 'name' }),
  })
  return { log, handlers }
}

const submitEvent = () => {
  const event = {
    prevented: false,
    stopped: false,
    preventDefault: () => (event.prevented = true),
    stopPropagation: () => (event.stopped = true),
  }
  return event
}

test('submit creates, hands the option to the picker and closes', async () => {
  const { log, handlers } = harness()
  const event = submitEvent()
  handlers.onSubmit(event)
  await flush()
  assert.equal(event.prevented, true)
  // The submit never reaches the form around the picker (React bubbles portal events through the tree).
  assert.equal(event.stopped, true)
  assert.deepEqual(log, [
    ['dispatch', { type: 'submitting' }],
    ['created', { value: 'i-1', label: 'Gmina' }],
    ['open', false],
  ])
})

test('submit with a blank required field stays and shows the error; a pending form ignores a second submit', async () => {
  const blank = harness({ values: { name: ' ', kind: '' } })
  await blank.handlers.submit()
  assert.deepEqual(blank.log, [['dispatch', { type: 'invalid', errors: { name: 'Required' } }]])
  const pending = harness({ pending: true })
  await pending.handlers.submit()
  assert.deepEqual(pending.log, [])
})

test('a failed create stays in the dialog with the described problem', async () => {
  const { log, handlers } = harness({}, async () => {
    throw new Error('409')
  })
  await handlers.submit()
  assert.deepEqual(log, [
    ['dispatch', { type: 'submitting' }],
    ['dispatch', { type: 'failed', problem: { message: 'Failed: 409', field: 'name' } }],
  ])
})

test('a field change and cancel', () => {
  const { log, handlers } = harness()
  handlers.onFieldChange({ target: { name: 'kind', value: 'school' } })
  handlers.onCancel()
  assert.deepEqual(log, [
    ['dispatch', { type: 'change', id: 'kind', value: 'school' }],
    ['open', false],
  ])
})

test('ids and the focus return to the picker control', () => {
  const ids = inlineCreateIds('owner')
  assert.equal(ids.field('name'), 'owner-name')
  assert.equal(ids.error('name'), 'owner-name-error')
  assert.equal(ids.problem, 'owner-problem')
  let focused = 0
  let prevented = 0
  const event = { preventDefault: () => (prevented += 1) }
  returnFocusTo({ current: { focus: () => (focused += 1) } })(event)
  returnFocusTo({ current: null })(event)
  returnFocusTo(undefined)(event)
  assert.equal(focused, 1)
  assert.equal(prevented, 1)
})

const viewProps = (state) => ({
  id: 'owner',
  fields,
  labels,
  state: { ...inlineCreateInitialState(fields), ...state },
  handlers: harness().handlers,
  testId: 'owner-create',
})

test('the form renders labelled native controls, the select options and the buttons', () => {
  const html = renderToStaticMarkup(h(InlineCreateFormView, viewProps({ values: { name: 'Gmina' } })))
  assert.match(html, /<form class="flex flex-col gap-4" noValidate="" data-testid="owner-create-form">/)
  assert.match(html, /<label for="owner-name" class="text-sm font-medium">Name<\/label>/)
  assert.match(
    html,
    /<div class="[^"]*min-h-11[^"]*" data-slot="input-wrapper"><input type="text" class="[^"]*" id="owner-name" aria-required="true" maxLength="200" name="name" value="Gmina"\/>/,
  )
  assert.match(
    html,
    /<label for="owner-kind" class="text-sm font-medium">Kind<\/label><select id="owner-kind" name="kind" class="[^"]*min-h-11[^"]*"><option value="" selected=""><\/option><option value="municipality">Municipality<\/option>/,
  )
  assert.match(
    html,
    /<button[^>]*type="button"[^>]*>Cancel<\/button><button[^>]*type="submit"[^>]*data-testid="owner-create-submit">Add<\/button>/,
  )
  assert.doesNotMatch(html, /role="alert"|aria-invalid="/)
})

test('the form shows field errors, the problem and the saving state', () => {
  const html = renderToStaticMarkup(
    h(InlineCreateFormView, viewProps({ errors: { name: 'Required' }, problem: 'Taken', pending: true })),
  )
  assert.match(html, /aria-invalid="true" aria-describedby="owner-name-error"/)
  assert.match(html, /<p id="owner-name-error" class="text-destructive text-xs" role="alert">Required<\/p>/)
  assert.match(
    html,
    /<p id="owner-problem" class="text-destructive text-sm" role="alert" data-testid="owner-create-problem">Taken<\/p>/,
  )
  assert.match(html, /disabled=""[^>]*data-testid="owner-create-submit">Saving…<\/button>/)
  const withoutOptions = renderToStaticMarkup(
    h(InlineCreateFormView, {
      ...viewProps({}),
      fields: [{ id: 'kind', label: 'Kind', type: 'select' }],
      state: { values: {}, errors: {}, problem: null, pending: false },
    }),
  )
  assert.match(
    withoutOptions,
    /<select id="owner-kind" name="kind"[^>]*><option value="" selected=""><\/option><\/select>/,
  )
})

test('the stateful form starts from the prefilled values', () => {
  const html = renderToStaticMarkup(
    h(InlineCreateForm, {
      id: 'owner',
      fields,
      initialValues: { name: 'Gmina' },
      labels,
      testId: 'owner-create',
      onCreate: async () => ({ value: 'x', label: 'x' }),
      onCreated: noop,
      onOpenChange: noop,
      describeError: () => ({ message: 'x' }),
    }),
  )
  assert.match(html, /value="Gmina"/)
})

test('the dialog holds the title, the description and the form only while open', async () => {
  const props = {
    id: 'owner',
    title: 'Add an institution',
    description: 'It is selected in the place form.',
    fields,
    labels,
    onCreate: async () => ({ value: 'x', label: 'x' }),
    onCreated: noop,
    onOpenChange: noop,
    describeError: () => ({ message: 'x' }),
  }
  const open = InlineCreateDialog({ ...props, open: true })
  assert.equal(open.props.open, true)
  const content = open.props.children
  assert.equal(content.props.closeAriaLabel, 'Close')
  assert.equal(content.props['data-testid'], 'inline-create-dialog')
  assert.equal(typeof content.props.onCloseAutoFocus, 'function')
  assert.equal(findElements(content, (element) => element.type === InlineCreateForm).length, 1)
  assert.equal(
    findElements(content, (element) => element.props.children === 'It is selected in the place form.').length,
    1,
  )
  const closed = InlineCreateDialog({ ...props, description: undefined, open: false, testId: 'x' })
  assert.equal(findElements(closed.props.children, (element) => element.type === InlineCreateForm).length, 0)
  assert.equal(closed.props.children.props['data-testid'], 'x')
  await flush()
})
