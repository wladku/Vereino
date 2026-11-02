// TEST-M05 (unit part, foundation III P-32, REQ-M05): `DeliveryStatusList` renders loading, error, empty and loaded
// states, the status badges with "not delivered", the "problems only" filter and the paging buttons.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DeliveryStatusList, DeliveryStatusListView } from '../admin/delivery-status-list.tsx'
import {
  DELIVERY_STATUS_LIST_INITIAL_STATE,
  createDeliveryStatusListHandlers,
  deliveryRequest,
  deliveryStatusListReducer,
} from '../admin/delivery-status-model.ts'
import { deliveryLabels, deliveryPage, deliveryRow } from './delivery-fixtures.mjs'
import { findElements } from './admin-test-helpers.mjs'

const h = React.createElement
const formatTime = (iso) => iso.slice(0, 10)
const handlers = createDeliveryStatusListHandlers(() => undefined)
const reduce = (...actions) => actions.reduce(deliveryStatusListReducer, DELIVERY_STATUS_LIST_INITIAL_STATE)
const current = (state, options = {}) => deliveryRequest(state, options).key
const loadedState = (data, base = DELIVERY_STATUS_LIST_INITIAL_STATE) =>
  deliveryStatusListReducer(base, { type: 'loaded', key: current(base), data })
const viewProps = (props) => ({
  id: 'deliveries',
  labels: deliveryLabels,
  formatTime,
  state: DELIVERY_STATUS_LIST_INITIAL_STATE,
  handlers,
  ...props,
})
const renderView = (props) => renderToStaticMarkup(h(DeliveryStatusListView, viewProps(props)))

test('the list starts loading, with the title and the labelled "problems only" checkbox', () => {
  const html = renderToStaticMarkup(
    h(DeliveryStatusList, { load: async () => deliveryPage(), labels: deliveryLabels, formatTime }),
  )
  assert.match(
    html,
    /^<section class="flex min-w-0 flex-col gap-4" data-testid="delivery-status-list" data-status="loading" aria-busy="true">/,
  )
  assert.match(html, /<h2 class="text-lg font-semibold">Recipients<\/h2>/)
  const id = /<input type="checkbox" id="([^"]+)"/.exec(html)[1]
  assert.match(html, new RegExp(`<label for="${id}" class="text-sm">Problems only</label>`))
  assert.match(html, /data-testid="delivery-problems-only"/)
  assert.match(
    html,
    /<div aria-live="polite" class="flex flex-wrap items-center gap-2"><p class="text-muted-foreground text-sm" data-testid="delivery-loading">Loading deliveries…<\/p><\/div><\/section>$/,
  )
  assert.doesNotMatch(html, /<table|role="region"/)
})

test('a loaded page renders the table in a focusable named scroll region with one row per delivery', () => {
  const rows = [
    deliveryRow(),
    deliveryRow({ id: 'd2', name: null, status: 'failed', failureCode: 'bounced', lastAttemptAt: null }),
    deliveryRow({ id: 'd3', channel: 'in_app', status: 'skipped', skipReason: 'no_account', reasons: ['coach'] }),
    deliveryRow({ id: 'd4', status: 'queued' }),
  ]
  const html = renderView({ state: loadedState(deliveryPage({ items: rows, total: 4 })) })
  assert.match(html, /data-status="loaded" aria-busy="false">/)
  assert.match(
    html,
    /<div role="region" aria-label="Delivery status" tabindex="0" class="focus-visible:shadow-focus overflow-x-auto rounded-md border outline-none"><table/,
  )
  for (const column of ['Recipient', 'Reason', 'Channel', 'Status', 'Last attempt']) {
    assert.match(html, new RegExp(`<th[^>]*scope="col"[^>]*>${column}</th>`))
  }
  assert.equal((html.match(/data-testid="delivery-row"/g) ?? []).length, 4)
  assert.match(
    html,
    /<tr[^>]*data-testid="delivery-row" data-status="sent" data-delivery-id="d1"><td[^>]*>Anna Nowak<\/td><td[^>]*>Guardian, Participant<\/td><td[^>]*>E-mail<\/td><td[^>]*><span class="flex flex-wrap items-center gap-2"><div[^>]*data-variant="success"[^>]*>Sent<\/div><\/span><\/td><td[^>]*>2026-11-02<\/td><\/tr>/,
  )
  assert.match(
    html,
    /data-status="failed" data-delivery-id="d2"><td[^>]*>Unknown recipient<\/td>.*?<div[^>]*data-variant="error"[^>]*>Not delivered<\/div><span class="text-muted-foreground text-xs">Failure: bounced<\/span><\/span><\/td><td[^>]*><\/td><\/tr>/,
  )
  assert.match(
    html,
    /data-status="skipped" data-delivery-id="d3">.*?<td[^>]*>Coach<\/td><td[^>]*>In app<\/td>.*?<div[^>]*data-variant="neutral"[^>]*data-appearance="stroke"[^>]*>Skipped<\/div><span class="text-muted-foreground text-xs">Skipped: no_account<\/span>/,
  )
  assert.match(html, /data-status="queued" data-delivery-id="d4">.*?data-variant="neutral"[^>]*>Queued<\/div><\/span>/)
  assert.doesNotMatch(html, /delivery-pagination|delivery-loading/)
})

test('more than one page shows the page text and previous/next buttons, disabled at the edges', () => {
  const first = renderView({ state: loadedState(deliveryPage({ page: 1, totalPages: 2, total: 60 })) })
  assert.match(
    first,
    /<div class="flex flex-wrap items-center justify-between gap-2" data-testid="delivery-pagination">/,
  )
  assert.match(first, /<p class="text-muted-foreground text-sm">Page 1 of 2<\/p>/)
  assert.match(first, /<button[^>]*class="[^"]*min-h-11[^"]*"[^>]*disabled=""[^>]*>Previous<\/button>/)
  assert.match(first, /<button(?![^>]*disabled="")[^>]*>Next<\/button>/)
  const base = reduce({ type: 'pageStepped', delta: 1 })
  const second = renderView({ state: loadedState(deliveryPage({ page: 2, totalPages: 2, total: 60 }), base) })
  assert.match(second, /<button(?![^>]*disabled="")[^>]*>Previous<\/button>/)
  assert.match(second, /<button[^>]*disabled=""[^>]*>Next<\/button>/)
})

test('while the next page loads the previous rows stay with the loading line and disabled paging', () => {
  const state = deliveryStatusListReducer(loadedState(deliveryPage({ page: 1, totalPages: 2, total: 60 })), {
    type: 'pageStepped',
    delta: 1,
  })
  const html = renderView({ state })
  assert.match(html, /data-status="loading" aria-busy="true">/)
  assert.match(html, /data-testid="delivery-loading">Loading deliveries…<\/p>/)
  assert.match(html, /data-testid="delivery-row"/)
  assert.equal((html.match(/<button[^>]*disabled=""/g) ?? []).length, 2)
})

test('a failed load shows the error with a retry button', () => {
  const html = renderView({ state: reduce({ type: 'failed', key: current(DELIVERY_STATUS_LIST_INITIAL_STATE) }) })
  assert.match(
    html,
    /<p class="text-destructive text-sm" data-testid="delivery-error">Deliveries could not be loaded<\/p><button[^>]*type="button"[^>]*>Try again<\/button>/,
  )
  assert.doesNotMatch(html, /<table/)
})

test('an empty page renders the empty text outside any table, matching the filter', () => {
  const empty = renderView({ state: loadedState(deliveryPage({ items: [], total: 0 })) })
  assert.match(empty, /data-testid="delivery-empty">No deliveries yet<\/p>/)
  assert.doesNotMatch(empty, /<table|role="region"/)
  const base = reduce({ type: 'problemsOnlyChanged', problemsOnly: true })
  const problems = renderView({ state: loadedState(deliveryPage({ items: [], total: 0 }), base), pageSize: 50 })
  assert.match(problems, /data-testid="delivery-empty">Every message was delivered<\/p>/)
  assert.match(problems, /<input type="checkbox"[^>]*checked=""/)
})

test('the refresh key and page size take part in the request: a new refresh key shows the reload', () => {
  const state = loadedState(deliveryPage())
  assert.match(renderView({ state, refreshKey: 'next' }), /data-status="loading"/)
  assert.match(renderView({ state, pageSize: 10 }), /data-status="loading"/)
})

test('the controls call the model handlers', () => {
  const tree = DeliveryStatusListView(viewProps({ state: loadedState(deliveryPage({ page: 2, totalPages: 3 })) }))
  const [checkbox] = findElements(tree, (node) => node.props['data-testid'] === 'delivery-problems-only')
  assert.equal(checkbox.props.onChange, handlers.onProblemsOnlyChange)
  const clicks = findElements(tree, (node) => node.props.onClick !== undefined).map((node) => node.props.onClick)
  assert.deepEqual(clicks, [handlers.onPrevious, handlers.onNext])
  const errorTree = DeliveryStatusListView(
    viewProps({ state: reduce({ type: 'failed', key: current(DELIVERY_STATUS_LIST_INITIAL_STATE) }) }),
  )
  const [retry] = findElements(errorTree, (node) => node.props.onClick !== undefined)
  assert.equal(retry.props.onClick, handlers.onRetry)
})
