'use client'
// `/backend/facilities/requests` — "Requests awaiting approval" (facilities spec B-25, J-007 step 4, REQ-024; E08-S05
// #125): the confirmed online requests whose 48-hour hold is still running, the soonest expiry first — place, slot,
// requester with contacts, category, purpose, indicative amount, time to expiry, collisions (count and kinds) and a
// ban-register badge — with Approve and Reject per row. States: loading, empty ("No requests awaiting approval"), error
// with retry, no permission (403), and a request decided or expired meanwhile (409, the dialog closes and the queue
// reloads). Needs `facilities.rentals.approve`.
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { AccessDeniedMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { ListEmptyState } from './FacilitiesControls'
import { ApproveRequestDialog, RejectRequestDialog } from './RequestDecisionDialogs'
import { errorMessage, type TableColumns, type Translate } from './facilities-client'
import {
  REQUESTS_KEY,
  expiryLabel,
  moneyLabel,
  queueSlotLabel,
  useRequestQueue,
  type RequestQueueItem,
} from './requests-client'

const PAGE_SIZE = 25

function buildColumns(
  t: Translate,
  locale: string,
  timeZone: string,
  currency: string,
  now: Date,
): TableColumns<RequestQueueItem> {
  const empty = t('facilities.common.empty')
  return [
    {
      id: 'slot',
      header: t('facilities.requests.columns.slot'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium whitespace-nowrap tabular-nums">
            {queueSlotLabel(row.original.startsAt, row.original.endsAt, timeZone, locale)}
          </span>
          <span className="text-muted-foreground text-xs">
            {row.original.placeName || t('facilities.common.unknownPlace')} ·{' '}
            {t('facilities.rentals.units.label', { units: row.original.units, minutes: row.original.units * 90 })}
          </span>
        </span>
      ),
    },
    {
      id: 'requester',
      header: t('facilities.requests.columns.requester'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => {
        const contact = [row.original.contactName, row.original.contactPhone, row.original.contactEmail]
          .filter(Boolean)
          .join(' · ')
        return (
          <span className="flex flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-1 font-medium">
              {row.original.renterDisplayName}
              {row.original.entryBanMatch ? (
                <span data-testid={`facilities-request-ban-${row.original.id}`}>
                  <StatusBadge variant="error">{t('facilities.requests.ban.badge')}</StatusBadge>
                </span>
              ) : null}
            </span>
            {contact ? <span className="text-muted-foreground text-xs break-all">{contact}</span> : null}
          </span>
        )
      },
    },
    {
      id: 'category',
      header: t('facilities.requests.columns.category'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => t(`facilities.rates.category.${row.original.renterCategory}`),
    },
    {
      id: 'purpose',
      header: t('facilities.requests.columns.purpose'),
      enableSorting: false,
      meta: { priority: 4, truncate: true, maxWidth: '16rem' },
      cell: ({ row }) => row.original.purpose ?? empty,
    },
    {
      id: 'amount',
      header: t('facilities.requests.columns.amount'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.amount === null
            ? t('facilities.requests.amount.none')
            : moneyLabel(row.original.amount, currency, locale)}
        </span>
      ),
    },
    {
      id: 'expiry',
      header: t('facilities.requests.columns.expiry'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums" data-testid={`facilities-request-expiry-${row.original.id}`}>
          {expiryLabel(t, row.original.holdExpiresAt, now)}
        </span>
      ),
    },
    {
      id: 'conflicts',
      header: t('facilities.requests.columns.conflicts'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => {
        const { conflicts } = row.original
        if (conflicts.length === 0) return t('facilities.requests.conflicts.none')
        const kinds = [...new Set(conflicts.map((conflict) => conflict.kind))]
          .map((kind) => t(`facilities.requests.conflicts.kind.${kind}`))
          .join(', ')
        return (
          <span
            className="flex flex-wrap items-center gap-1"
            data-testid={`facilities-request-conflicts-${row.original.id}`}
          >
            <StatusBadge variant="warning">
              {t('facilities.requests.conflicts.count', { count: conflicts.length })}
            </StatusBadge>
            <span className="text-muted-foreground text-xs">{kinds}</span>
          </span>
        )
      },
    },
  ]
}

type Decision = { kind: 'approve' | 'reject'; item: RequestQueueItem } | null

function isForbidden(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 403
}

export function RequestsQueue() {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const [page, setPage] = React.useState(1)
  const [decision, setDecision] = React.useState<Decision>(null)
  const query = useRequestQueue(page, PAGE_SIZE, [scopeVersion])
  const { data, isLoading, error } = query
  // The time to expiry is read against the moment the queue was loaded; it reloads after each decision.
  const loadedAt = query.dataUpdatedAt
  const now = React.useMemo(() => (loadedAt ? new Date(loadedAt) : new Date()), [loadedAt])
  const timeZone = data?.timeZone ?? 'UTC'
  const currency = data?.currency ?? 'PLN'

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [...REQUESTS_KEY] })
  }, [queryClient])

  const columns = React.useMemo(
    () => buildColumns(t, locale, timeZone, currency, now),
    [t, locale, timeZone, currency, now],
  )

  const title = t('facilities.requests.title')
  if (error && isForbidden(error)) {
    return (
      <section className="flex flex-col gap-4" data-testid="facilities-requests-forbidden">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <AccessDeniedMessage label={t('facilities.requests.errors.forbidden')} />
      </section>
    )
  }
  if (error) {
    return (
      <section className="flex flex-col gap-4" data-testid="facilities-requests-error">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <ErrorMessage
          label={errorMessage(error, t('facilities.requests.errors.load'))}
          action={
            <Button type="button" variant="outline" onClick={() => void query.refetch()}>
              {t('facilities.public.actions.retry')}
            </Button>
          }
        />
      </section>
    )
  }

  const empty = !isLoading && (data?.items.length ?? 0) === 0
  return (
    <div className="flex flex-col gap-6">
      {empty ? (
        <ListEmptyState title={title} message={t('facilities.requests.empty')} testId="facilities-requests-empty" />
      ) : (
        <div className="relative max-w-full min-w-0 overflow-x-auto" data-testid="facilities-requests-table">
          <DataTable<RequestQueueItem>
            title={title}
            titleHeadingLevel={1}
            entityId="facilities:rental_request"
            extensionTableId="facilities.requests"
            columns={columns}
            data={data?.items ?? []}
            isLoading={isLoading}
            rowActions={(item: RequestQueueItem) => (
              <span data-testid={`facilities-request-actions-${item.id}`}>
                <RowActions
                  items={[
                    {
                      id: 'approve',
                      label: t('facilities.requests.actions.approve'),
                      onSelect: () => {
                        setDecision({ kind: 'approve', item })
                      },
                    },
                    {
                      id: 'reject',
                      label: t('facilities.requests.actions.reject'),
                      destructive: true,
                      onSelect: () => {
                        setDecision({ kind: 'reject', item })
                      },
                    },
                  ]}
                />
              </span>
            )}
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: data?.total ?? 0,
              totalPages: data?.totalPages ?? 0,
              onPageChange: setPage,
            }}
          />
        </div>
      )}
      {decision?.kind === 'approve' ? (
        <ApproveRequestDialog
          key={`approve-${decision.item.id}`}
          item={decision.item}
          timeZone={timeZone}
          currency={currency}
          open
          onOpenChange={(open) => {
            if (!open) setDecision(null)
          }}
          onDone={refresh}
        />
      ) : null}
      {decision?.kind === 'reject' ? (
        <RejectRequestDialog
          key={`reject-${decision.item.id}`}
          item={decision.item}
          timeZone={timeZone}
          currency={currency}
          open
          onOpenChange={(open) => {
            if (!open) setDecision(null)
          }}
          onDone={refresh}
        />
      ) : null}
    </div>
  )
}
