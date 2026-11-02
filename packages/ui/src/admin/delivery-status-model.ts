// The logic of `DeliveryStatusList` (foundation III P-32, REQ-M05, DD-M16): page, "problems only" filter and the loaded
// page as a reducer, the request key that decides which answer belongs to which page/filter/refresh, the load effect
// that drops stale answers, the event handlers and the texts and badge variants of a row. Framework-free so
// `node --test` covers every branch; `delivery-status-list.tsx` only renders what these return.
import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { requestEffect } from '#src/admin/request-effect'
import type { EffectCallback, Timers } from '#src/admin/request-effect'

export type DeliveryChannel = 'in_app' | 'email'
export type DeliveryStatus = 'queued' | 'sent' | 'failed' | 'skipped'

/** One recipient × channel delivery as the consumer's deliveries route returns it. */
export type DeliveryRow = {
  id: string
  personId: string | null
  name: string | null
  channel: DeliveryChannel
  reasons: string[]
  status: DeliveryStatus
  skipReason: string | null
  failureCode: string | null
  attempts: number
  lastAttemptAt: string | null
}

/** A page of deliveries in the list response shape of the engineering standards (S6.4). */
export type DeliveryPage = { items: DeliveryRow[]; total: number; page: number; pageSize: number; totalPages: number }

/** What `load` is asked for besides the page: the "problems only" filter (failed + skipped) and the page size. */
export type DeliveryFilter = { problemsOnly: boolean; pageSize: number }

export type DeliveryStatusListLabels = {
  title: string
  problemsOnly: string
  columns: { recipient: string; reason: string; channel: string; status: string; lastAttempt: string }
  /** `failed` is the "Not delivered" text. */
  status: Record<DeliveryStatus, string>
  channel: Record<DeliveryChannel, string>
  reason: (reason: string) => string
  skipReason: (code: string) => string
  failureCode: (code: string) => string
  unknownRecipient: string
  empty: string
  emptyProblems: string
  loading: string
  error: string
  retry: string
  previous: string
  next: string
  pageOf: (page: number, totalPages: number) => string
  /** Accessible name of the horizontally scrolling table region. */
  tableLabel: string
}

/** Default page size asked of `load`. */
export const DELIVERY_PAGE_SIZE = 50

export type DeliveryStatusListState = {
  readonly page: number
  readonly problemsOnly: boolean
  /** Grows with every retry so the same page is requested again. */
  readonly attempt: number
  /** The answer for `key` (`data: null` = the request failed). */
  readonly result: { readonly key: string; readonly data: DeliveryPage | null } | null
  /** The last page that loaded, kept on screen while the next one loads. */
  readonly last: DeliveryPage | null
}

export type DeliveryStatusListAction =
  | { readonly type: 'loaded'; readonly key: string; readonly data: DeliveryPage }
  | { readonly type: 'failed'; readonly key: string }
  | { readonly type: 'pageStepped'; readonly delta: number }
  | { readonly type: 'problemsOnlyChanged'; readonly problemsOnly: boolean }
  | { readonly type: 'retried' }

export const DELIVERY_STATUS_LIST_INITIAL_STATE: DeliveryStatusListState = {
  page: 1,
  problemsOnly: false,
  attempt: 0,
  result: null,
  last: null,
}

export function deliveryStatusListReducer(
  state: DeliveryStatusListState,
  action: DeliveryStatusListAction,
): DeliveryStatusListState {
  switch (action.type) {
    case 'loaded':
      return { ...state, result: { key: action.key, data: action.data }, last: action.data }
    case 'failed':
      return { ...state, result: { key: action.key, data: null } }
    case 'pageStepped':
      return { ...state, page: Math.max(1, state.page + action.delta) }
    case 'problemsOnlyChanged':
      return { ...state, problemsOnly: action.problemsOnly, page: 1 }
    case 'retried':
      return { ...state, attempt: state.attempt + 1 }
  }
}

/** The consumer-controlled inputs of a request: a new `refreshKey` reloads the current page. */
export type DeliveryRequestOptions = { readonly refreshKey?: string | number; readonly pageSize?: number }

export type DeliveryRequest = { readonly key: string; readonly page: number; readonly filter: DeliveryFilter }

export function deliveryRequest(state: DeliveryStatusListState, options: DeliveryRequestOptions): DeliveryRequest {
  const filter = { problemsOnly: state.problemsOnly, pageSize: options.pageSize ?? DELIVERY_PAGE_SIZE }
  const key = [
    String(state.page),
    String(filter.problemsOnly),
    String(filter.pageSize),
    String(state.attempt),
    String(options.refreshKey ?? ''),
  ].join('\n')
  return { key, page: state.page, filter }
}

export type DeliveryLoadEffectInput = DeliveryRequestOptions & {
  readonly state: DeliveryStatusListState
  readonly load: (page: number, filter: DeliveryFilter) => Promise<DeliveryPage>
  readonly dispatch: (action: DeliveryStatusListAction) => void
  readonly timers?: Timers
}

/** Loads the requested page; an answer arriving after the page, filter or refresh key changed is dropped. */
export function deliveryLoadEffect({
  state,
  load,
  dispatch,
  timers,
  ...options
}: DeliveryLoadEffectInput): EffectCallback {
  const request = deliveryRequest(state, options)
  return requestEffect({
    delayMs: 0,
    timers,
    request: () => load(request.page, request.filter),
    onSuccess: (data) => {
      dispatch({ type: 'loaded', key: request.key, data })
    },
    onFailure: () => {
      dispatch({ type: 'failed', key: request.key })
    },
  })
}

/** The `useEffect` dependencies of `deliveryLoadEffect`: a new page, filter, retry or refresh starts a new request. */
export function deliveryLoadEffectDeps(state: DeliveryStatusListState, options: DeliveryRequestOptions): unknown[] {
  return [deliveryRequest(state, options).key]
}

export type DeliveryListViewState =
  | { readonly status: 'loading'; readonly data: DeliveryPage | null }
  | { readonly status: 'error' | 'empty' }
  | { readonly status: 'loaded'; readonly data: DeliveryPage }

/** What the list shows: loading (with the previous page, if it had rows), the error, the empty text or the page. */
export function deliveryListViewState(
  state: DeliveryStatusListState,
  options: DeliveryRequestOptions,
): DeliveryListViewState {
  const { key } = deliveryRequest(state, options)
  if (state.result?.key !== key) {
    return { status: 'loading', data: state.last !== null && state.last.items.length > 0 ? state.last : null }
  }
  if (state.result.data === null) return { status: 'error' }
  if (state.result.data.items.length === 0) return { status: 'empty' }
  return { status: 'loaded', data: state.result.data }
}

/** The status line above the table; `null` when the table speaks for itself. */
export function deliveryStatusMessage(
  view: DeliveryListViewState,
  state: DeliveryStatusListState,
  labels: DeliveryStatusListLabels,
): string | null {
  switch (view.status) {
    case 'loading':
      return labels.loading
    case 'error':
      return labels.error
    case 'empty':
      return state.problemsOnly ? labels.emptyProblems : labels.empty
    case 'loaded':
      return null
  }
}

export type DeliveryPagination = {
  readonly visible: boolean
  readonly text: string
  readonly canPrevious: boolean
  readonly canNext: boolean
}

/** Previous/next state: shown for more than one page, both disabled while a page loads. */
export function deliveryPagination(
  data: DeliveryPage,
  loading: boolean,
  labels: DeliveryStatusListLabels,
): DeliveryPagination {
  return {
    visible: data.totalPages > 1,
    text: labels.pageOf(data.page, data.totalPages),
    canPrevious: !loading && data.page > 1,
    canNext: !loading && data.page < data.totalPages,
  }
}

/** The status badge: sent = success, queued = neutral, failed = error ("Not delivered"), skipped = muted neutral. */
export type DeliveryStatusBadge = { readonly variant: StatusBadgeVariant; readonly appearance?: 'stroke' }

const STATUS_BADGES: Record<DeliveryStatus, DeliveryStatusBadge> = {
  sent: { variant: 'success' },
  queued: { variant: 'neutral' },
  failed: { variant: 'error' },
  skipped: { variant: 'neutral', appearance: 'stroke' },
}

export function deliveryStatusBadge(status: DeliveryStatus): DeliveryStatusBadge {
  return STATUS_BADGES[status]
}

export type DeliveryRowCells = {
  readonly recipient: string
  readonly reason: string
  readonly channel: string
  readonly status: string
  /** The skip reason of a skipped row or the failure code of a failed one, as text; `null` otherwise. */
  readonly detail: string | null
  readonly lastAttempt: string
  readonly badge: DeliveryStatusBadge
}

function deliveryDetail(row: DeliveryRow, labels: DeliveryStatusListLabels): string | null {
  if (row.status === 'skipped' && row.skipReason) return labels.skipReason(row.skipReason)
  if (row.status === 'failed' && row.failureCode) return labels.failureCode(row.failureCode)
  return null
}

/** The texts of one row; a recipient without a name shows `unknownRecipient`, a row never attempted an empty cell. */
export function deliveryRowCells(
  row: DeliveryRow,
  labels: DeliveryStatusListLabels,
  formatTime: (iso: string) => string,
): DeliveryRowCells {
  return {
    recipient: row.name?.trim() ? row.name : labels.unknownRecipient,
    reason: row.reasons.map((reason) => labels.reason(reason)).join(', '),
    channel: labels.channel[row.channel],
    status: labels.status[row.status],
    detail: deliveryDetail(row, labels),
    lastAttempt: row.lastAttemptAt ? formatTime(row.lastAttemptAt) : '',
    badge: deliveryStatusBadge(row.status),
  }
}

/** The part of a checkbox change event the handler reads. */
export type CheckedChangeEvent = { readonly target: { readonly checked: boolean } }

export type DeliveryStatusListHandlers = {
  readonly onProblemsOnlyChange: (event: CheckedChangeEvent) => void
  readonly onPrevious: () => void
  readonly onNext: () => void
  readonly onRetry: () => void
}

export function createDeliveryStatusListHandlers(
  dispatch: (action: DeliveryStatusListAction) => void,
): DeliveryStatusListHandlers {
  return {
    onProblemsOnlyChange: (event) => {
      dispatch({ type: 'problemsOnlyChanged', problemsOnly: event.target.checked })
    },
    onPrevious: () => {
      dispatch({ type: 'pageStepped', delta: -1 })
    },
    onNext: () => {
      dispatch({ type: 'pageStepped', delta: 1 })
    },
    onRetry: () => {
      dispatch({ type: 'retried' })
    },
  }
}
