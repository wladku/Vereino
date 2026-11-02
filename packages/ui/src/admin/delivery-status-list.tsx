// `DeliveryStatusList` (foundation III P-32, REQ-M05, DD-M16): the per-recipient delivery status of a message for staff —
// recipient, reason, channel, status (`StatusBadge`; "not delivered" for a failed delivery, the reason next to a skipped
// one), last attempt — with a "problems only" filter and previous/next paging over the consumer's `load`. Built on the
// platform's table primitive instead of `DataTable`, which imports `next/navigation` and so cannot render outside the
// app. The empty state is rendered outside the table, and the horizontally scrolling table wrapper is a focusable named
// region (axe `scrollable-region-focusable` at 375 px). All logic lives in `delivery-status-model.ts`.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@open-mercato/ui/primitives/table'
import {
  DELIVERY_STATUS_LIST_INITIAL_STATE,
  createDeliveryStatusListHandlers,
  deliveryLoadEffect,
  deliveryLoadEffectDeps,
  deliveryPagination,
  deliveryRowCells,
  deliveryStatusListReducer,
  deliveryListViewState,
  deliveryStatusMessage,
} from '#src/admin/delivery-status-model'
import type {
  DeliveryFilter,
  DeliveryPage,
  DeliveryRow,
  DeliveryStatusListHandlers,
  DeliveryStatusListLabels,
  DeliveryStatusListState,
} from '#src/admin/delivery-status-model'

export type DeliveryStatusListProps = {
  /** Loads one page; `filter.problemsOnly` keeps failed and skipped deliveries only. */
  load: (page: number, filter: DeliveryFilter) => Promise<DeliveryPage>
  labels: DeliveryStatusListLabels
  formatTime: (iso: string) => string
  /** Page size passed to `load` in `filter.pageSize` (default 50). */
  pageSize?: number
  /** A change reloads the current page (e.g. after a retry was queued or a new delivery arrived). */
  refreshKey?: string | number
}

export type DeliveryStatusListViewProps = Pick<
  DeliveryStatusListProps,
  'labels' | 'formatTime' | 'pageSize' | 'refreshKey'
> & {
  /** Base id of the field's elements (the "problems only" checkbox). */
  id: string
  state: DeliveryStatusListState
  handlers: DeliveryStatusListHandlers
}

type RowProps = Pick<DeliveryStatusListProps, 'labels' | 'formatTime'> & { row: DeliveryRow }

function DeliveryStatusRow({ row, labels, formatTime }: RowProps) {
  const cells = deliveryRowCells(row, labels, formatTime)
  return (
    <TableRow data-testid="delivery-row" data-status={row.status} data-delivery-id={row.id}>
      <TableCell className="font-medium">{cells.recipient}</TableCell>
      <TableCell>{cells.reason}</TableCell>
      <TableCell>{cells.channel}</TableCell>
      <TableCell>
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={cells.badge.variant} appearance={cells.badge.appearance}>
            {cells.status}
          </StatusBadge>
          {cells.detail !== null ? <span className="text-muted-foreground text-xs">{cells.detail}</span> : null}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">{cells.lastAttempt}</TableCell>
    </TableRow>
  )
}

/** The stateless view: renders one state of the list; `DeliveryStatusList` owns the state and the requests. */
export function DeliveryStatusListView({
  id,
  labels,
  formatTime,
  pageSize,
  refreshKey,
  state,
  handlers,
}: DeliveryStatusListViewProps) {
  const view = deliveryListViewState(state, { pageSize, refreshKey })
  const message = deliveryStatusMessage(view, state, labels)
  const data = view.status === 'loading' || view.status === 'loaded' ? view.data : null
  const pagination = data === null ? null : deliveryPagination(data, view.status === 'loading', labels)
  const problemsOnlyId = `${id}-problems-only`
  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      data-testid="delivery-status-list"
      data-status={view.status}
      aria-busy={view.status === 'loading'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{labels.title}</h2>
        <div className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            id={problemsOnlyId}
            className="accent-primary size-4"
            checked={state.problemsOnly}
            onChange={handlers.onProblemsOnlyChange}
            data-testid="delivery-problems-only"
          />
          <label htmlFor={problemsOnlyId} className="text-sm">
            {labels.problemsOnly}
          </label>
        </div>
      </div>
      <div aria-live="polite" className="flex flex-wrap items-center gap-2">
        {message !== null ? (
          <p
            className={view.status === 'error' ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}
            data-testid={`delivery-${view.status}`}
          >
            {message}
          </p>
        ) : null}
        {view.status === 'error' ? (
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={handlers.onRetry}>
            {labels.retry}
          </Button>
        ) : null}
      </div>
      {data !== null ? (
        <div
          role="region"
          aria-label={labels.tableLabel}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally scrolling region must be keyboard-focusable (WCAG 2.1.1, axe `scrollable-region-focusable` at 375 px)
          tabIndex={0}
          className="focus-visible:shadow-focus overflow-x-auto rounded-md border outline-none"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.columns.recipient}</TableHead>
                <TableHead scope="col">{labels.columns.reason}</TableHead>
                <TableHead scope="col">{labels.columns.channel}</TableHead>
                <TableHead scope="col">{labels.columns.status}</TableHead>
                <TableHead scope="col">{labels.columns.lastAttempt}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((row) => (
                <DeliveryStatusRow key={row.id} row={row} labels={labels} formatTime={formatTime} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {pagination?.visible ? (
        <div className="flex flex-wrap items-center justify-between gap-2" data-testid="delivery-pagination">
          <p className="text-muted-foreground text-sm">{pagination.text}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={!pagination.canPrevious}
              onClick={handlers.onPrevious}
            >
              {labels.previous}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={!pagination.canNext}
              onClick={handlers.onNext}
            >
              {labels.next}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** The list: owns page, filter and requests, renders `DeliveryStatusListView`. */
export function DeliveryStatusList({ load, ...viewProps }: DeliveryStatusListProps) {
  const id = React.useId()
  const [state, dispatch] = React.useReducer(deliveryStatusListReducer, DELIVERY_STATUS_LIST_INITIAL_STATE)
  const options = { pageSize: viewProps.pageSize, refreshKey: viewProps.refreshKey }
  React.useEffect(deliveryLoadEffect({ state, load, dispatch, ...options }), deliveryLoadEffectDeps(state, options))
  const handlers = createDeliveryStatusListHandlers(dispatch)
  return <DeliveryStatusListView {...viewProps} id={id} state={state} handlers={handlers} />
}
