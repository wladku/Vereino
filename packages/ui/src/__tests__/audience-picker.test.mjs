// TEST-M05 (unit part, foundation III P-32, REQ-M05): `AudiencePicker` renders every state of the two-step field with
// native, labelled controls and a live count line the controls reference.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AudiencePicker, AudiencePickerView } from '../admin/audience-picker.tsx'
import {
  AUDIENCE_PICKER_INITIAL_STATE,
  audiencePickerReducer,
  createAudiencePickerHandlers,
} from '../admin/audience-picker-model.ts'
import { findElements } from './admin-test-helpers.mjs'

const h = React.createElement
const labels = {
  kind: 'Audience',
  kindPlaceholder: 'Choose who receives it',
  target: 'Target',
  targetSearch: 'Search',
  targetPlaceholder: 'Type a name',
  noTargets: 'Nothing found',
  loadingTargets: 'Loading targets…',
  targetsError: 'Targets could not be loaded',
  previewLoading: 'Counting recipients…',
  previewError: 'Recipients could not be counted',
  previewEmpty: 'Choose an audience to see the recipients',
  retry: 'Try again',
}
const kinds = [
  { kind: 'club', label: 'Whole club' },
  { kind: 'group', label: 'Group' },
]
const counts = { recipients: 38, withoutEmail: 2, unreachable: 0 }
const formatCounts = (value) => `${value.recipients} recipients · ${value.withoutEmail} without e-mail`
const reduce = (...actions) => actions.reduce(audiencePickerReducer, AUDIENCE_PICKER_INITIAL_STATE)
const noop = () => undefined
const handlers = createAudiencePickerHandlers({ value: { kind: null, ids: [] }, onChange: noop, dispatch: noop })
const viewProps = (props) => ({
  id: 'audience',
  value: { kind: null, ids: [] },
  kinds,
  formatCounts,
  labels,
  state: AUDIENCE_PICKER_INITIAL_STATE,
  handlers,
  ...props,
})
const renderView = (props) => renderToStaticMarkup(h(AudiencePickerView, viewProps(props)))

test('the field starts with the labelled kind select, the placeholder and the empty count line', () => {
  const html = renderToStaticMarkup(
    h(AudiencePicker, {
      id: 'audience',
      value: { kind: null, ids: [] },
      onChange: noop,
      kinds,
      loadTargets: async () => [],
      preview: async () => counts,
      formatCounts,
      labels,
    }),
  )
  assert.match(html, /^<div class="flex min-w-0 flex-col gap-4" data-testid="audience-picker">/)
  assert.match(html, /<label for="audience-kind" class="text-sm font-medium">Audience<\/label>/)
  assert.match(
    html,
    /<select id="audience-kind" class="[^"]*min-h-11[^"]*" aria-describedby="audience-count" data-testid="audience-picker-kind">/,
  )
  assert.match(html, /<option value="" disabled="" selected="">Choose who receives it<\/option>/)
  assert.match(html, /<option value="club">Whole club<\/option><option value="group">Group<\/option><\/select>/)
  assert.match(
    html,
    /<p id="audience-count" aria-live="polite" class="text-muted-foreground text-sm" data-testid="audience-picker-count" data-status="empty">Choose an audience to see the recipients<\/p>/,
  )
  assert.doesNotMatch(html, /fieldset|Try again|audience-error|aria-invalid|disabled=""[^>]*>Audience/)
})

test('club needs no target: no second step, the count line shows loading, then the counts', () => {
  const value = { kind: 'club', ids: [] }
  const loading = renderView({ value })
  assert.match(loading, /<option value="club" selected="">Whole club<\/option>/)
  assert.doesNotMatch(loading, /fieldset/)
  assert.match(loading, /data-status="loading">Counting recipients…<\/p>/)
  const loaded = renderView({ value, state: reduce({ type: 'previewLoaded', key: 'club\n', counts }) })
  assert.match(loaded, /data-status="loaded">38 recipients · 2 without e-mail<\/p>/)
})

test('a failed preview shows the error and a retry button', () => {
  const html = renderView({ value: { kind: 'club', ids: [] }, state: reduce({ type: 'previewFailed', key: 'club\n' }) })
  assert.match(
    html,
    /data-status="error">Recipients could not be counted<\/p><button[^>]*type="button"[^>]*>Try again<\/button>/,
  )
  assert.match(html, /<button[^>]*class="[^"]*min-h-11[^"]*"/)
  const disabled = renderView({
    value: { kind: 'club', ids: [] },
    state: reduce({ type: 'previewFailed', key: 'club\n' }),
    disabled: true,
  })
  assert.match(disabled, /<button[^>]*disabled=""[^>]*>Try again<\/button>/)
})

test('another kind shows the labelled search and the loading state of the targets', () => {
  const html = renderView({ value: { kind: 'group', ids: [] } })
  assert.match(
    html,
    /<fieldset class="flex min-w-0 flex-col gap-2" aria-describedby="audience-count" data-testid="audience-picker-targets"><legend class="text-sm font-medium">Target<\/legend>/,
  )
  assert.match(html, /<label for="audience-search" class="text-muted-foreground text-sm">Search<\/label>/)
  assert.match(
    html,
    /<input type="search" class="[^"]*" id="audience-search" autoComplete="off" placeholder="Type a name" value=""\/>/,
  )
  assert.match(html, /<div[^>]*class="[^"]*min-h-11[^"]*"[^>]*data-slot="input-wrapper"/)
  assert.match(
    html,
    /<div aria-live="polite" class="flex flex-wrap items-center gap-2"><p class="text-muted-foreground text-sm">Loading targets…<\/p><\/div>/,
  )
  assert.doesNotMatch(html, /<ul|type="radio"/)
  // No target yet: the audience is incomplete.
  assert.match(html, /data-status="empty">Choose an audience to see the recipients<\/p>/)
})

test('failed targets show the error and a retry button; no match shows the empty text', () => {
  const value = { kind: 'group', ids: [] }
  const failed = renderView({ value, state: reduce({ type: 'targetsFailed', key: 'group\n' }) })
  assert.match(
    failed,
    /<p class="text-muted-foreground text-sm">Targets could not be loaded<\/p><button[^>]*>Try again<\/button>/,
  )
  const empty = renderView({ value, state: reduce({ type: 'targetsLoaded', key: 'group\n', items: [] }) })
  assert.match(empty, /<p class="text-muted-foreground text-sm">Nothing found<\/p><\/div>/)
  assert.doesNotMatch(empty, /Try again|<ul/)
})

test('loaded targets render as a labelled radio list with hints and the chosen one checked', () => {
  const state = reduce({
    type: 'targetsLoaded',
    key: 'group\n',
    items: [
      { id: 'g1', label: 'Rocznik 2015', hint: 'Żaki' },
      { id: 'g2', label: 'Rocznik 2016', hint: null },
    ],
  })
  const html = renderView({ value: { kind: 'group', ids: ['g1'] }, state })
  assert.match(html, /<div aria-live="polite" class="flex flex-wrap items-center gap-2"><\/div>/)
  assert.match(html, /<ul id="audience-targets" class="flex max-h-72 flex-col overflow-y-auto rounded-md border">/)
  assert.match(
    html,
    /<li class="flex min-h-11[^"]*"><input type="radio" id="audience-target-0" class="[^"]*" name="audience-targets" checked="" value="g1"\/><label for="audience-target-0" class="[^"]*">Rocznik 2015<span class="text-muted-foreground text-xs">Żaki<\/span><\/label><\/li>/,
  )
  assert.match(
    html,
    /<input type="radio" id="audience-target-1" class="[^"]*" name="audience-targets" value="g2"\/><label for="audience-target-1" class="[^"]*">Rocznik 2016<\/label>/,
  )
  // A complete audience whose preview is pending.
  assert.match(html, /data-status="loading">Counting recipients…<\/p>/)
})

test('a validation error is shown under the field, marks the kind invalid and joins aria-describedby', () => {
  const html = renderView({ value: { kind: 'group', ids: [] }, error: 'Choose an audience', disabled: true })
  assert.match(
    html,
    /<select id="audience-kind"[^>]*disabled="" aria-describedby="audience-count audience-error" aria-invalid="true"/,
  )
  assert.match(html, /<fieldset[^>]*disabled=""[^>]*aria-describedby="audience-count audience-error"/)
  assert.match(
    html,
    /<p id="audience-error" class="text-destructive text-sm" data-testid="audience-picker-error">Choose an audience<\/p><\/div>$/,
  )
})

test('the controls call the model handlers', () => {
  const state = reduce({ type: 'targetsLoaded', key: 'group\n', items: [{ id: 'g1', label: 'Rocznik 2015' }] })
  const [select] = findElements(AudiencePickerView(viewProps()), (node) => node.type === 'select')
  assert.equal(select.props.onChange, handlers.onKindChange)
  const failedTree = AudiencePickerView(
    viewProps({ value: { kind: 'group', ids: [] }, state: reduce({ type: 'targetsFailed', key: 'group\n' }) }),
  )
  const [search] = findElements(failedTree, (node) => node.props.id === 'audience-search')
  assert.equal(search.props.onChange, handlers.onQueryChange)
  const [retryTargets] = findElements(failedTree, (node) => node.props.onClick !== undefined)
  assert.equal(retryTargets.props.onClick, handlers.onRetryTargets)
  const listTree = AudiencePickerView(viewProps({ value: { kind: 'group', ids: [] }, state }))
  assert.equal(findElements(listTree, (node) => node.type === 'input')[0].props.onChange, handlers.onTargetChange)
  const previewTree = AudiencePickerView(
    viewProps({ value: { kind: 'club', ids: [] }, state: reduce({ type: 'previewFailed', key: 'club\n' }) }),
  )
  const [retryPreview] = findElements(previewTree, (node) => node.props.onClick !== undefined)
  assert.equal(retryPreview.props.onClick, handlers.onRetryPreview)
})
