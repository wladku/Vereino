// TEST-L14 (unit part, people life-cycle spec REQ-L14): the picker select loads its options, shows the empty-picker
// hint without any, selects a record created in place and reloads after a create link.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { InlineCreateDialog } from '../admin/inline-create-dialog.tsx'
import { PickerSelect, PickerSelectView, pickerSelectField } from '../admin/picker-select.tsx'
import {
  PICKER_SELECT_INITIAL_STATE,
  createPickerSelectHandlers,
  pickerSelectDescribedBy,
  pickerSelectIds,
  pickerSelectLoadDeps,
  pickerSelectLoadEffect,
  pickerSelectReducer,
} from '../admin/picker-select-model.ts'
import { fakeTimers, findElements, flush } from './admin-test-helpers.mjs'

const h = React.createElement
const noop = () => undefined
const options = [
  { value: 'i-1', label: 'Gmina Miasto' },
  { value: 'i-2', label: 'Szkoła 5' },
]
const labels = {
  label: 'Owner',
  emptyOption: 'No owner',
  loading: 'Loading…',
  loadError: 'Options could not be loaded',
  retry: 'Try again',
  hint: {
    none: 'No institution yet.',
    noMatch: 'No institution found.',
    add: 'Add an institution',
    askAdmin: 'Ask the club administrator to add one.',
  },
}
const inlineCreate = {
  title: 'Add an institution',
  fields: [{ id: 'name', label: 'Name', type: 'text', required: true }],
  labels: { submit: 'Add', saving: 'Saving…', cancel: 'Cancel', close: 'Close', required: 'Required' },
  onCreate: async (values) => ({ value: 'i-9', label: values.name }),
  describeError: () => ({ message: 'Failed' }),
  initialValues: (term) => ({ name: term ?? '' }),
}
const reduce = (...actions) => actions.reduce(pickerSelectReducer, PICKER_SELECT_INITIAL_STATE)

test('the reducer: loaded, failed, reload, dialog and a created option replacing a known one', () => {
  const loaded = reduce({ type: 'loaded', options })
  assert.equal(loaded.status, 'loaded')
  assert.deepEqual(loaded.options, options)
  assert.equal(reduce({ type: 'failed' }).status, 'error')
  assert.equal(reduce({ type: 'reload' }, { type: 'reload' }).reload, 2)
  const open = reduce({ type: 'openDialog', term: 'Gmina' })
  assert.deepEqual([open.dialogOpen, open.term], [true, 'Gmina'])
  assert.equal(pickerSelectReducer(open, { type: 'closeDialog' }).dialogOpen, false)
  const created = pickerSelectReducer(
    { ...loaded, dialogOpen: true },
    { type: 'created', option: { value: 'i-1', label: 'Gmina Miasto (new)' } },
  )
  assert.equal(created.dialogOpen, false)
  assert.deepEqual(created.options, [options[1], { value: 'i-1', label: 'Gmina Miasto (new)' }])
})

test('the load effect reports the options or the failure; the deps follow reload and the loader', async () => {
  const timers = fakeTimers()
  const actions = []
  pickerSelectLoadEffect({ load: async () => options, dispatch: (action) => actions.push(action), timers })()
  pickerSelectLoadEffect({
    load: async () => {
      throw new Error('down')
    },
    dispatch: (action) => actions.push(action),
    timers,
  })()
  timers.runAll()
  await flush()
  assert.deepEqual(actions, [{ type: 'loaded', options }, { type: 'failed' }])
  const load = async () => []
  assert.deepEqual(pickerSelectLoadDeps(reduce({ type: 'reload' }), load), [1, load])
})

test('the handlers change the value, open and close the dialog, select a created option and reload', () => {
  const actions = []
  const values = []
  const handlers = createPickerSelectHandlers({
    dispatch: (action) => actions.push(action),
    onChange: (value) => values.push(value),
  })
  handlers.onSelectChange({ target: { value: 'i-2' } })
  handlers.onCreate('Gmina')
  handlers.onDialogOpenChange(true)
  handlers.onDialogOpenChange(false)
  handlers.onCreated({ value: 'i-9', label: 'Nowa' })
  handlers.onReload()
  assert.deepEqual(values, ['i-2', 'i-9'])
  assert.deepEqual(actions, [
    { type: 'openDialog', term: 'Gmina' },
    { type: 'closeDialog' },
    { type: 'created', option: { value: 'i-9', label: 'Nowa' } },
    { type: 'reload' },
  ])
})

test('ids and aria-describedby', () => {
  assert.deepEqual(pickerSelectIds('owner'), {
    select: 'owner',
    hint: 'owner-hint',
    error: 'owner-error',
    dialog: 'owner-create',
  })
  assert.equal(pickerSelectDescribedBy('owner', false, null), undefined)
  assert.equal(pickerSelectDescribedBy('owner', true, null), 'owner-hint')
  assert.equal(pickerSelectDescribedBy('owner', true, 'Required'), 'owner-hint owner-error')
  assert.equal(pickerSelectDescribedBy('owner', false, 'Required'), 'owner-error')
})

const handlers = createPickerSelectHandlers({ dispatch: noop, onChange: noop })
const viewProps = (props) => ({
  id: 'owner',
  value: '',
  labels,
  canCreate: true,
  create: { kind: 'inline' },
  state: PICKER_SELECT_INITIAL_STATE,
  handlers,
  ...props,
})
const renderView = (props) => renderToStaticMarkup(h(PickerSelectView, viewProps(props)))

test('loading: the select is busy and a set value keeps an option until the list answers', () => {
  const html = renderView({ value: 'i-1' })
  assert.match(html, /^<div class="flex min-w-0 flex-col gap-2" data-testid="picker-select" data-status="loading">/)
  assert.match(html, /<select id="owner" class="[^"]*min-h-11[^"]*" aria-label="Owner" aria-busy="true">/)
  assert.match(html, /<option value="">No owner<\/option><option value="i-1" selected="">Loading…<\/option><\/select>/)
  assert.doesNotMatch(html, /picker-empty-hint|data-testid="picker-select-hint"/)
})

test('loaded options render; an unknown value stays selectable by its id', () => {
  const state = reduce({ type: 'loaded', options })
  const html = renderView({ value: 'i-2', state })
  assert.match(html, /<option value="i-1">Gmina Miasto<\/option><option value="i-2" selected="">Szkoła 5<\/option>/)
  assert.doesNotMatch(html, /hint/)
  const unknown = renderView({ value: 'gone', state })
  assert.match(unknown, /<option value="gone" selected="">gone<\/option>/)
})

test('no option: the hint under the select, referenced by it, with the in-place action', () => {
  const state = reduce({ type: 'loaded', options: [] })
  const html = renderView({ state })
  assert.match(html, /<select id="owner"[^>]*aria-describedby="owner-hint">/)
  assert.match(
    html,
    /<div id="owner-hint"[^>]*data-testid="picker-select-hint" data-state="none"><p[^>]*>No institution yet.<\/p><button[^>]*data-testid="picker-select-hint-create">Add an institution<\/button>/,
  )
})

test('the in-place dialog is wired to the handlers, prefilled from the term, only with the feature and the inline path', () => {
  const ref = { current: null }
  const state = reduce({ type: 'loaded', options: [] }, { type: 'openDialog', term: 'Gmina' })
  const tree = PickerSelectView(viewProps({ state, selectRef: ref, inlineCreate }))
  const [dialog] = findElements(tree, (element) => element.type === InlineCreateDialog)
  assert.equal(dialog.props.open, true)
  assert.equal(dialog.props.id, 'owner-create')
  assert.equal(dialog.props.onCreated, handlers.onCreated)
  assert.equal(dialog.props.onOpenChange, handlers.onDialogOpenChange)
  assert.deepEqual(dialog.props.initialValues, { name: 'Gmina' })
  assert.equal(dialog.props.returnFocusRef, ref)
  const withoutPrefill = PickerSelectView(
    viewProps({ state, inlineCreate: { ...inlineCreate, initialValues: undefined } }),
  )
  assert.equal(
    findElements(withoutPrefill, (element) => element.type === InlineCreateDialog)[0].props.initialValues,
    undefined,
  )
  for (const props of [
    { canCreate: false },
    { create: { kind: 'link', href: '/x' } },
    { inlineCreate: undefined },
    { create: null },
  ]) {
    assert.equal(
      findElements(
        PickerSelectView(viewProps({ state, inlineCreate, ...props })),
        (element) => element.type === InlineCreateDialog,
      ).length,
      0,
    )
  }
})

test('without the feature the hint names who can add it; a required field has no empty choice', () => {
  const state = reduce({ type: 'loaded', options: [] })
  const html = renderView({
    state,
    canCreate: false,
    required: true,
    labels: { ...labels, emptyOption: undefined },
    testId: 'section',
  })
  assert.match(
    html,
    /<select id="owner"[^>]*aria-required="true"[^>]*><option value="" disabled="" selected=""><\/option><\/select>/,
  )
  assert.match(html, /No institution yet. Ask the club administrator to add one.<\/p><\/div>/)
  assert.doesNotMatch(html, /<button/)
})

test('a failed load shows the error and a retry; a form error is referenced by the select', () => {
  const failed = renderView({ state: reduce({ type: 'failed' }) })
  assert.match(failed, /data-status="error"/)
  assert.match(
    failed,
    /<p class="text-destructive text-sm">Options could not be loaded<\/p><button[^>]*>Try again<\/button>/,
  )
  const invalid = renderView({ state: reduce({ type: 'loaded', options }), error: 'Required', disabled: true })
  assert.match(invalid, /<select id="owner"[^>]*disabled=""[^>]*aria-invalid="true" aria-describedby="owner-error">/)
  assert.match(invalid, /<p id="owner-error" class="text-destructive text-sm">Required<\/p>/)
})

test('the stateful field renders the loading state', () => {
  const html = renderToStaticMarkup(
    h(PickerSelect, {
      id: 'owner',
      value: '',
      onChange: noop,
      loadOptions: async () => options,
      labels,
      canCreate: true,
      create: { kind: 'link', href: '/backend/club/sections/create' },
    }),
  )
  assert.match(html, /data-status="loading"/)
  const withoutCreate = renderToStaticMarkup(
    h(PickerSelect, {
      id: 'owner',
      value: '',
      onChange: noop,
      loadOptions: async () => options,
      labels,
      canCreate: false,
      create: null,
    }),
  )
  assert.match(withoutCreate, /data-status="loading"/)
})

test('the CrudForm field passes the value, the label, the error and the setter', () => {
  const field = pickerSelectField('ownerInstitutionId', 'Owner', {
    loadOptions: async () => options,
    labels: { emptyOption: 'No owner', loading: 'Loading…', loadError: 'x', retry: 'y', hint: labels.hint },
    canCreate: true,
    create: { kind: 'inline' },
    inlineCreate,
    required: true,
    description: 'Who owns the place',
    layout: 'half',
    visibleWhen: { field: 'kind', equals: 'team' },
  })
  assert.deepEqual(field.visibleWhen, { field: 'kind', equals: 'team' })
  assert.deepEqual(
    {
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      description: field.description,
      layout: field.layout,
      rendersOwnError: field.rendersOwnError,
    },
    {
      id: 'ownerInstitutionId',
      label: 'Owner',
      type: 'custom',
      required: true,
      description: 'Who owns the place',
      layout: 'half',
      rendersOwnError: true,
    },
  )
  const set = []
  const element = field.component({ value: 'i-1', setValue: (value) => set.push(value), disabled: true, error: 'Bad' })
  assert.equal(element.type, PickerSelect)
  assert.equal(element.props.id, 'picker-ownerInstitutionId')
  assert.equal(element.props.value, 'i-1')
  assert.equal(element.props.labels.label, 'Owner')
  assert.equal(element.props.disabled, true)
  assert.equal(element.props.error, 'Bad')
  assert.equal(element.props.testId, 'picker-ownerInstitutionId')
  element.props.onChange('i-2')
  assert.deepEqual(set, ['i-2'])
  assert.equal(field.component({ value: null, setValue: noop }).props.value, '')
})
