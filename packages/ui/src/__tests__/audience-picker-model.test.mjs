// P-32 (foundation III REQ-M05, DD-M16): the logic of `AudiencePicker` — reducer, request keys, debounced effects that
// drop stale answers, handlers and the texts of the view.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AUDIENCE_PICKER_DEBOUNCE_MS,
  AUDIENCE_PICKER_INITIAL_STATE,
  audiencePickerDescribedBy,
  audiencePickerIds,
  audiencePickerReducer,
  audiencePreviewEffect,
  audiencePreviewEffectDeps,
  audiencePreviewKey,
  audiencePreviewLine,
  audiencePreviewView,
  audienceSpecOf,
  audienceTargetsEffect,
  audienceTargetsEffectDeps,
  audienceTargetsMessage,
  audienceTargetsRequest,
  audienceTargetsView,
  createAudiencePickerHandlers,
} from '../admin/audience-picker-model.ts'
import { fakeTimers, flush } from './admin-test-helpers.mjs'

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
const counts = { recipients: 38, withoutEmail: 2, unreachable: 0 }
const formatCounts = (value) => `${value.recipients} recipients · ${value.withoutEmail} without e-mail`
const reduce = (...actions) => actions.reduce(audiencePickerReducer, AUDIENCE_PICKER_INITIAL_STATE)
const group = (id, label = id) => ({ id, label })

test('the reducer keeps the query, resets it on a new kind and records answers per request key', () => {
  assert.equal(AUDIENCE_PICKER_DEBOUNCE_MS, 300)
  assert.equal(reduce({ type: 'queryChanged', query: 'roc' }).query, 'roc')
  assert.equal(reduce({ type: 'queryChanged', query: 'roc' }, { type: 'kindChanged' }).query, '')

  const loaded = reduce(
    { type: 'targetsLoaded', key: 'group\n', items: [group('g1'), group('g2')] },
    { type: 'targetsLoaded', key: 'group\nx', items: [group('g3')] },
  )
  assert.deepEqual(loaded.targets, { key: 'group\nx', items: [group('g3')], attempt: 0 })
  assert.deepEqual(Object.keys(loaded.known), ['g1', 'g2', 'g3'])

  const failed = audiencePickerReducer(loaded, { type: 'targetsFailed', key: 'group\ny' })
  assert.deepEqual(failed.targets, { key: 'group\ny', items: null, attempt: 0 })
  assert.equal(failed.known, loaded.known)
  assert.deepEqual(audiencePickerReducer(failed, { type: 'targetsRetried' }).targets, {
    key: null,
    items: null,
    attempt: 1,
  })

  const previewed = reduce({ type: 'previewLoaded', key: 'club\n', counts })
  assert.deepEqual(previewed.preview, { key: 'club\n', counts, attempt: 0 })
  assert.deepEqual(audiencePickerReducer(previewed, { type: 'previewFailed', key: 'group\ng1' }).preview, {
    key: 'group\ng1',
    counts: null,
    attempt: 0,
  })
  assert.deepEqual(audiencePickerReducer(previewed, { type: 'previewRetried' }).preview, {
    key: null,
    counts: null,
    attempt: 1,
  })
})

test('only kinds other than club search targets; a complete audience is club or a kind with a target', () => {
  assert.equal(audienceTargetsRequest(null, 'x'), null)
  assert.equal(audienceTargetsRequest('club', 'x'), null)
  assert.deepEqual(audienceTargetsRequest('group', '  Rocznik '), {
    key: 'group\nRocznik',
    kind: 'group',
    query: 'Rocznik',
  })

  assert.deepEqual(audienceSpecOf({ kind: 'club', ids: ['ignored'] }), { kind: 'club', ids: [] })
  assert.equal(audienceSpecOf({ kind: null, ids: [] }), null)
  assert.equal(audienceSpecOf({ kind: 'group', ids: [] }), null)
  const ids = ['g1']
  const spec = audienceSpecOf({ kind: 'group', ids })
  assert.deepEqual(spec, { kind: 'group', ids: ['g1'] })
  assert.notEqual(spec.ids, ids)

  assert.equal(audiencePreviewKey({ kind: 'group', ids: [] }), null)
  assert.equal(audiencePreviewKey({ kind: 'club', ids: [] }), 'club\n')
  assert.equal(audiencePreviewKey({ kind: 'section', ids: ['s1'] }), 'section\ns1')
})

test('the targets effect loads a new kind at once, debounces typing and records the answer for its key', async () => {
  const timers = fakeTimers()
  const actions = []
  const calls = []
  const loadTargets = async (kind, query) => {
    calls.push([kind, query])
    return [group('g1')]
  }
  const effect = (kind, query, debounceMs) =>
    audienceTargetsEffect({ kind, query, loadTargets, dispatch: (action) => actions.push(action), debounceMs, timers })

  assert.equal(effect('club', '')(), undefined)
  assert.equal(effect(null, 'x')(), undefined)

  effect('group', '')()
  effect('group', ' roc ')()
  effect('group', 'roc', 50)()
  assert.deepEqual(timers.delays(), [0, 300, 50])
  timers.runAll()
  await flush()
  assert.deepEqual(calls, [
    ['group', ''],
    ['group', 'roc'],
    ['group', 'roc'],
  ])
  assert.deepEqual(actions[0], { type: 'targetsLoaded', key: 'group\n', items: [group('g1')] })
  assert.deepEqual(actions[1], { type: 'targetsLoaded', key: 'group\nroc', items: [group('g1')] })

  const failing = audienceTargetsEffect({
    kind: 'group',
    query: 'x',
    loadTargets: async () => {
      throw new Error('500')
    },
    dispatch: (action) => actions.push(action),
    timers,
  })
  failing()
  timers.runAll()
  await flush()
  assert.deepEqual(actions.at(-1), { type: 'targetsFailed', key: 'group\nx' })
})

test('a stale targets answer is dropped once the search moved on', async () => {
  const timers = fakeTimers()
  const actions = []
  let resolve
  const cleanup = audienceTargetsEffect({
    kind: 'group',
    query: '',
    loadTargets: () => new Promise((ok) => (resolve = ok)),
    dispatch: (action) => actions.push(action),
    timers,
  })()
  timers.runAll()
  await flush()
  cleanup()
  resolve([group('late')])
  await flush()
  assert.deepEqual(actions, [])
})

test('the effect dependencies change with the request key and the retry attempt', () => {
  const state = reduce({ type: 'queryChanged', query: ' a ' })
  assert.deepEqual(audienceTargetsEffectDeps({ kind: null, ids: [] }, state), [null, 0])
  assert.deepEqual(audienceTargetsEffectDeps({ kind: 'group', ids: [] }, state), ['group\na', 0])
  assert.deepEqual(audienceTargetsEffectDeps({ kind: 'group', ids: [] }, reduce({ type: 'targetsRetried' })), [
    'group\n',
    1,
  ])
  assert.deepEqual(audiencePreviewEffectDeps({ kind: 'group', ids: [] }, state), [null, 0])
  assert.deepEqual(audiencePreviewEffectDeps({ kind: 'club', ids: [] }, reduce({ type: 'previewRetried' })), [
    'club\n',
    1,
  ])
})

test('the preview effect asks for club at once, debounces a chosen target and drops a stale answer', async () => {
  const timers = fakeTimers()
  const actions = []
  const specs = []
  const preview = async (spec) => {
    specs.push(spec)
    return counts
  }
  const effect = (value, debounceMs) =>
    audiencePreviewEffect({ value, preview, dispatch: (action) => actions.push(action), debounceMs, timers })

  assert.equal(effect({ kind: 'group', ids: [] })(), undefined)
  assert.equal(effect({ kind: null, ids: [] })(), undefined)
  effect({ kind: 'club', ids: [] })()
  effect({ kind: 'group', ids: ['g1'] })()
  effect({ kind: 'group', ids: ['g2'] }, 10)()
  assert.deepEqual(timers.delays(), [0, 300, 10])
  timers.runAll()
  await flush()
  assert.deepEqual(specs, [
    { kind: 'club', ids: [] },
    { kind: 'group', ids: ['g1'] },
    { kind: 'group', ids: ['g2'] },
  ])
  assert.deepEqual(actions[0], { type: 'previewLoaded', key: 'club\n', counts })

  actions.length = 0
  audiencePreviewEffect({
    value: { kind: 'club', ids: [] },
    preview: async () => {
      throw new Error('403')
    },
    dispatch: (action) => actions.push(action),
    timers,
  })()
  let resolve
  const stale = audiencePreviewEffect({
    value: { kind: 'group', ids: ['g1'] },
    preview: () => new Promise((ok) => (resolve = ok)),
    dispatch: (action) => actions.push(action),
    timers,
  })()
  timers.runAll()
  await flush()
  stale()
  resolve(counts)
  await flush()
  assert.deepEqual(actions, [{ type: 'previewFailed', key: 'club\n' }])
})

test('the handlers change the kind (clearing ids and search), the query, the target, and retry', () => {
  const actions = []
  const changes = []
  const handlers = (value) =>
    createAudiencePickerHandlers({
      value,
      onChange: (next) => changes.push(next),
      dispatch: (action) => actions.push(action),
    })

  const picked = handlers({ kind: 'group', ids: ['g1'] })
  picked.onKindChange({ target: { value: 'section' } })
  picked.onKindChange({ target: { value: 'group' } })
  picked.onKindChange({ target: { value: 'nonsense' } })
  handlers({ kind: null, ids: [] }).onKindChange({ target: { value: '' } })
  picked.onQueryChange({ target: { value: 'roc' } })
  picked.onTargetChange({ target: { value: 'g2' } })
  picked.onRetryTargets()
  picked.onRetryPreview()
  assert.deepEqual(changes, [
    { kind: 'section', ids: [] },
    { kind: null, ids: [] },
    { kind: 'group', ids: ['g2'] },
  ])
  assert.deepEqual(actions, [
    { type: 'kindChanged' },
    { type: 'kindChanged' },
    { type: 'queryChanged', query: 'roc' },
    { type: 'targetsRetried' },
    { type: 'previewRetried' },
  ])
})

test('the targets view: hidden for club, loading until the answer for the current search, then error/empty/loaded', () => {
  const value = { kind: 'group', ids: [] }
  assert.deepEqual(audienceTargetsView({ kind: 'club', ids: [] }, AUDIENCE_PICKER_INITIAL_STATE), {
    status: 'hidden',
  })
  assert.deepEqual(audienceTargetsView(value, AUDIENCE_PICKER_INITIAL_STATE), { status: 'loading', options: [] })
  assert.deepEqual(audienceTargetsView(value, reduce({ type: 'targetsFailed', key: 'group\n' })), {
    status: 'error',
    options: [],
  })
  assert.deepEqual(audienceTargetsView(value, reduce({ type: 'targetsLoaded', key: 'group\n', items: [] })), {
    status: 'empty',
    options: [],
  })
  assert.deepEqual(
    audienceTargetsView(value, reduce({ type: 'targetsLoaded', key: 'group\n', items: [group('g1'), group('g2')] })),
    { status: 'loaded', options: [group('g1'), group('g2')] },
  )
})

test('the chosen target stays first among the options while a search does not return it', () => {
  const state = reduce(
    { type: 'targetsLoaded', key: 'group\n', items: [group('g1'), group('g2')] },
    { type: 'queryChanged', query: 'zz' },
  )
  const value = { kind: 'group', ids: ['g2', 'unknown'] }
  assert.deepEqual(audienceTargetsView(value, state), { status: 'loading', options: [group('g2')] })
  const searched = audiencePickerReducer(state, { type: 'targetsLoaded', key: 'group\nzz', items: [group('g3')] })
  assert.deepEqual(audienceTargetsView(value, searched), { status: 'loaded', options: [group('g2'), group('g3')] })
  const found = audiencePickerReducer(state, { type: 'targetsLoaded', key: 'group\nzz', items: [group('g2')] })
  assert.deepEqual(audienceTargetsView(value, found), { status: 'loaded', options: [group('g2')] })
  const none = audiencePickerReducer(state, { type: 'targetsLoaded', key: 'group\nzz', items: [] })
  assert.deepEqual(audienceTargetsView(value, none), { status: 'empty', options: [group('g2')] })
})

test('the targets message names the loading, error and empty states only', () => {
  assert.equal(audienceTargetsMessage({ status: 'loading', options: [] }, labels), 'Loading targets…')
  assert.equal(audienceTargetsMessage({ status: 'error', options: [] }, labels), 'Targets could not be loaded')
  assert.equal(audienceTargetsMessage({ status: 'empty', options: [] }, labels), 'Nothing found')
  assert.equal(audienceTargetsMessage({ status: 'loaded', options: [group('g1')] }, labels), null)
  assert.equal(audienceTargetsMessage({ status: 'hidden' }, labels), null)
})

test('the preview view and line: empty before a complete audience, loading, error, then the formatted counts', () => {
  const club = { kind: 'club', ids: [] }
  const view = (value, state) => audiencePreviewView(value, state)
  assert.deepEqual(view({ kind: 'group', ids: [] }, AUDIENCE_PICKER_INITIAL_STATE), { status: 'empty' })
  assert.deepEqual(view(club, AUDIENCE_PICKER_INITIAL_STATE), { status: 'loading' })
  assert.deepEqual(view(club, reduce({ type: 'previewLoaded', key: 'group\ng1', counts })), { status: 'loading' })
  assert.deepEqual(view(club, reduce({ type: 'previewFailed', key: 'club\n' })), { status: 'error' })
  assert.deepEqual(view(club, reduce({ type: 'previewLoaded', key: 'club\n', counts })), { status: 'loaded', counts })

  assert.equal(audiencePreviewLine({ status: 'empty' }, labels, formatCounts), labels.previewEmpty)
  assert.equal(audiencePreviewLine({ status: 'loading' }, labels, formatCounts), labels.previewLoading)
  assert.equal(audiencePreviewLine({ status: 'error' }, labels, formatCounts), labels.previewError)
  assert.equal(
    audiencePreviewLine({ status: 'loaded', counts }, labels, formatCounts),
    '38 recipients · 2 without e-mail',
  )
})

test('element ids and aria-describedby derive from the base id', () => {
  const ids = audiencePickerIds('audience')
  assert.deepEqual(
    { ...ids, target: ids.target(2) },
    {
      kind: 'audience-kind',
      search: 'audience-search',
      targets: 'audience-targets',
      count: 'audience-count',
      error: 'audience-error',
      target: 'audience-target-2',
    },
  )
  assert.equal(audiencePickerDescribedBy('audience', null), 'audience-count')
  assert.equal(audiencePickerDescribedBy('audience', undefined), 'audience-count')
  assert.equal(audiencePickerDescribedBy('audience', ''), 'audience-count')
  assert.equal(audiencePickerDescribedBy('audience', 'Required'), 'audience-count audience-error')
})
