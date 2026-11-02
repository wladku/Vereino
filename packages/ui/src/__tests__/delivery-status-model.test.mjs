// P-32 (foundation III REQ-M05, DD-M16): the logic of `DeliveryStatusList` — reducer, request key, load effect that
// drops stale answers, view state, pagination, row texts and handlers.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DELIVERY_PAGE_SIZE,
  DELIVERY_STATUS_LIST_INITIAL_STATE,
  createDeliveryStatusListHandlers,
  deliveryListViewState,
  deliveryLoadEffect,
  deliveryLoadEffectDeps,
  deliveryPagination,
  deliveryRequest,
  deliveryRowCells,
  deliveryStatusBadge,
  deliveryStatusListReducer,
  deliveryStatusMessage,
} from '../admin/delivery-status-model.ts'
import { deliveryLabels, deliveryPage, deliveryRow } from './delivery-fixtures.mjs'
import { fakeTimers, flush } from './admin-test-helpers.mjs'

const reduce = (...actions) => actions.reduce(deliveryStatusListReducer, DELIVERY_STATUS_LIST_INITIAL_STATE)
const keyOf = (state, options = {}) => deliveryRequest(state, options).key

test('the reducer pages, filters (back to page 1), retries and keeps the last loaded page', () => {
  assert.equal(reduce({ type: 'pageStepped', delta: 1 }, { type: 'pageStepped', delta: 1 }).page, 3)
  assert.equal(reduce({ type: 'pageStepped', delta: -1 }).page, 1)
  const filtered = reduce({ type: 'pageStepped', delta: 1 }, { type: 'problemsOnlyChanged', problemsOnly: true })
  assert.deepEqual([filtered.page, filtered.problemsOnly], [1, true])
  assert.equal(reduce({ type: 'retried' }).attempt, 1)

  const page = deliveryPage()
  const loaded = reduce({ type: 'loaded', key: 'k1', data: page })
  assert.deepEqual([loaded.result, loaded.last], [{ key: 'k1', data: page }, page])
  const failed = deliveryStatusListReducer(loaded, { type: 'failed', key: 'k2' })
  assert.deepEqual([failed.result, failed.last], [{ key: 'k2', data: null }, page])
})

test('the request carries the page, the filter and the page size; its key also covers retries and refreshes', () => {
  assert.equal(DELIVERY_PAGE_SIZE, 50)
  const request = deliveryRequest(DELIVERY_STATUS_LIST_INITIAL_STATE, {})
  assert.deepEqual(request, { key: '1\nfalse\n50\n0\n', page: 1, filter: { problemsOnly: false, pageSize: 50 } })
  const state = reduce({ type: 'problemsOnlyChanged', problemsOnly: true }, { type: 'retried' })
  assert.deepEqual(deliveryRequest(state, { pageSize: 10, refreshKey: 7 }), {
    key: '1\ntrue\n10\n1\n7',
    page: 1,
    filter: { problemsOnly: true, pageSize: 10 },
  })
  assert.deepEqual(deliveryLoadEffectDeps(state, { refreshKey: 'r' }), ['1\ntrue\n50\n1\nr'])
})

test('the load effect requests the page and records the answer or the failure for its key', async () => {
  const timers = fakeTimers()
  const actions = []
  const calls = []
  const data = deliveryPage()
  deliveryLoadEffect({
    state: DELIVERY_STATUS_LIST_INITIAL_STATE,
    load: async (page, filter) => {
      calls.push([page, filter])
      return data
    },
    dispatch: (action) => actions.push(action),
    timers,
    refreshKey: 3,
  })()
  deliveryLoadEffect({
    state: reduce({ type: 'pageStepped', delta: 1 }),
    load: async () => {
      throw new Error('500')
    },
    dispatch: (action) => actions.push(action),
    timers,
    pageSize: 5,
  })()
  assert.deepEqual(timers.delays(), [0, 0])
  timers.runAll()
  await flush()
  assert.deepEqual(calls, [[1, { problemsOnly: false, pageSize: 50 }]])
  assert.deepEqual(actions, [
    { type: 'loaded', key: '1\nfalse\n50\n0\n3', data },
    { type: 'failed', key: '2\nfalse\n5\n0\n' },
  ])
})

test('a late answer for a page the list left is dropped', async () => {
  const timers = fakeTimers()
  const actions = []
  let resolve
  const cleanup = deliveryLoadEffect({
    state: DELIVERY_STATUS_LIST_INITIAL_STATE,
    load: () => new Promise((ok) => (resolve = ok)),
    dispatch: (action) => actions.push(action),
    timers,
  })()
  timers.runAll()
  await flush()
  cleanup()
  resolve(deliveryPage())
  await flush()
  assert.deepEqual(actions, [])
})

test('the view: loading (keeping a previous page with rows), error, empty or the loaded page', () => {
  const page = deliveryPage()
  assert.deepEqual(deliveryListViewState(DELIVERY_STATUS_LIST_INITIAL_STATE, {}), { status: 'loading', data: null })
  const current = keyOf(DELIVERY_STATUS_LIST_INITIAL_STATE)
  const loaded = reduce({ type: 'loaded', key: current, data: page })
  assert.deepEqual(deliveryListViewState(loaded, {}), { status: 'loaded', data: page })
  // A refresh keeps the loaded rows on screen while the page reloads.
  assert.deepEqual(deliveryListViewState(loaded, { refreshKey: 1 }), { status: 'loading', data: page })
  const empty = reduce({ type: 'loaded', key: current, data: deliveryPage({ items: [], total: 0 }) })
  assert.deepEqual(deliveryListViewState(empty, {}), { status: 'empty' })
  assert.deepEqual(deliveryListViewState(empty, { refreshKey: 1 }), { status: 'loading', data: null })
  assert.deepEqual(deliveryListViewState(reduce({ type: 'failed', key: current }), {}), { status: 'error' })
})

test('the status message names loading, error and the empty text matching the filter', () => {
  const state = DELIVERY_STATUS_LIST_INITIAL_STATE
  const problems = reduce({ type: 'problemsOnlyChanged', problemsOnly: true })
  assert.equal(deliveryStatusMessage({ status: 'loading', data: null }, state, deliveryLabels), 'Loading deliveries…')
  assert.equal(deliveryStatusMessage({ status: 'error' }, state, deliveryLabels), 'Deliveries could not be loaded')
  assert.equal(deliveryStatusMessage({ status: 'empty' }, state, deliveryLabels), 'No deliveries yet')
  assert.equal(deliveryStatusMessage({ status: 'empty' }, problems, deliveryLabels), 'Every message was delivered')
  assert.equal(deliveryStatusMessage({ status: 'loaded', data: deliveryPage() }, state, deliveryLabels), null)
})

test('pagination shows for more than one page and disables both buttons while loading', () => {
  assert.deepEqual(deliveryPagination(deliveryPage(), false, deliveryLabels), {
    visible: false,
    text: 'Page 1 of 1',
    canPrevious: false,
    canNext: false,
  })
  assert.deepEqual(deliveryPagination(deliveryPage({ page: 2, totalPages: 3 }), false, deliveryLabels), {
    visible: true,
    text: 'Page 2 of 3',
    canPrevious: true,
    canNext: true,
  })
  assert.deepEqual(deliveryPagination(deliveryPage({ page: 2, totalPages: 3 }), true, deliveryLabels), {
    visible: true,
    text: 'Page 2 of 3',
    canPrevious: false,
    canNext: false,
  })
})

test('status badges: sent success, queued neutral, failed error, skipped muted neutral', () => {
  assert.deepEqual(deliveryStatusBadge('sent'), { variant: 'success' })
  assert.deepEqual(deliveryStatusBadge('queued'), { variant: 'neutral' })
  assert.deepEqual(deliveryStatusBadge('failed'), { variant: 'error' })
  assert.deepEqual(deliveryStatusBadge('skipped'), { variant: 'neutral', appearance: 'stroke' })
})

test('row cells: name or unknown recipient, reasons, channel, status with its detail, last attempt', () => {
  const formatTime = (iso) => `at ${iso}`
  assert.deepEqual(deliveryRowCells(deliveryRow(), deliveryLabels, formatTime), {
    recipient: 'Anna Nowak',
    reason: 'Guardian, Participant',
    channel: 'E-mail',
    status: 'Sent',
    detail: null,
    lastAttempt: 'at 2026-11-02T10:00:00Z',
    badge: { variant: 'success' },
  })
  const failed = deliveryRowCells(
    deliveryRow({ name: null, status: 'failed', failureCode: 'bounced', channel: 'in_app', lastAttemptAt: null }),
    deliveryLabels,
    formatTime,
  )
  assert.deepEqual(
    [failed.recipient, failed.channel, failed.status, failed.detail, failed.lastAttempt],
    ['Unknown recipient', 'In app', 'Not delivered', 'Failure: bounced', ''],
  )
  const cells = (overrides) => deliveryRowCells(deliveryRow(overrides), deliveryLabels, formatTime)
  assert.equal(cells({ name: '  ' }).recipient, 'Unknown recipient')
  assert.equal(cells({ status: 'failed', failureCode: null }).detail, null)
  assert.equal(cells({ status: 'skipped', skipReason: 'no_email' }).detail, 'Skipped: no_email')
  assert.equal(cells({ status: 'skipped', skipReason: null }).detail, null)
  assert.equal(cells({ status: 'queued', skipReason: 'ignored', failureCode: 'ignored' }).detail, null)
  assert.equal(cells({ reasons: [] }).reason, '')
})

test('the handlers dispatch the filter, the page steps and the retry', () => {
  const actions = []
  const handlers = createDeliveryStatusListHandlers((action) => actions.push(action))
  handlers.onProblemsOnlyChange({ target: { checked: true } })
  handlers.onPrevious()
  handlers.onNext()
  handlers.onRetry()
  assert.deepEqual(actions, [
    { type: 'problemsOnlyChanged', problemsOnly: true },
    { type: 'pageStepped', delta: -1 },
    { type: 'pageStepped', delta: 1 },
    { type: 'retried' },
  ])
})
