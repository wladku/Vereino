'use client'
// B-33 "Cash to settle" (UX concept README B-33, flow F-14; payments spec REQ-033, TEST-046; issue #118): the people
// holding the club's cash — their payments with the KP numbers, the oldest day and the total — with "Accept handover"
// per person, and the handover history with the `RG` numbers. When nobody holds cash: "All accepted cash is with the
// treasurer". The club administrator's until the treasurer role (#245). An empty list is a heading and a sentence, not
// an empty `DataTable`, and each history row links to the collector's record, so no table is a scroll region without
// anything focusable at 375 px (lesson `empty-datatable-axe-at-375`). Since D-042 (REQ-033a, #791) the handovers the
// collectors sent wait under "Handovers to confirm" (Confirm / Reject), a payment of a pending handover is marked and
// cannot be accepted one-sided, and the history shows each handover's state.
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { TableLoadError } from '@vereino/ui'
import { formatMoney, personName, type TableColumns, type Translate } from '../client-helpers'
import { usePeopleRecordAccess } from '../useRecordLinks'
import { StatusTag } from '@vereino/ui'
import { AcceptHandoverDialog, formatDay } from './AcceptHandoverDialog'
import { PendingHandovers } from './PendingHandovers'
import {
  CASH_CUSTODY_QUERY_KEY,
  HANDOVER_PAGE_SIZE,
  useCashCustody,
  useHandovers,
  type CustodyCollector,
  type HandoverRow,
} from './cash-custody-client'

function custodyColumns(
  t: Translate,
  locale: string,
  onAccept: (row: CustodyCollector) => void,
): TableColumns<CustodyCollector> {
  return [
    {
      id: 'collector',
      header: t('payments.cashCustody.columns.person'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="font-medium" data-testid="custody-person">
          {personName(row.original.collector) || t('payments.cashCustody.unknownPerson')}
        </span>
      ),
    },
    {
      id: 'payments',
      header: t('payments.cashCustody.columns.payments'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <ul className="flex flex-col gap-0.5 text-sm" data-testid="custody-receipts">
          {row.original.payments.map((payment) => (
            <li key={payment.paymentId}>
              <span className="font-medium">{payment.receiptNumber}</span>
              {' · '}
              <span className="tabular-nums">{formatMoney(payment.amount, locale)}</span>
              {payment.payer ? <span className="text-muted-foreground"> · {personName(payment.payer)}</span> : null}
              {payment.pendingHandoverId ? (
                <span className="text-muted-foreground" data-testid="custody-receipt-pending">
                  {' · '}
                  {t('payments.cashCustody.inPendingHandover')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ),
    },
    {
      accessorKey: 'oldestPaidOn',
      header: t('payments.cashCustody.columns.oldest'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => formatDay(row.original.oldestPaidOn, locale),
    },
    {
      accessorKey: 'total',
      header: t('payments.cashCustody.columns.total'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="font-medium tabular-nums" data-testid="custody-total">
          {formatMoney(row.original.total, locale)}
        </span>
      ),
    },
    {
      id: 'accept',
      header: () => <span className="sr-only">{t('payments.cashCustody.accept.action')}</span>,
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          data-testid="custody-accept"
          onClick={() => {
            onAccept(row.original)
          }}
        >
          {t('payments.cashCustody.accept.action')}
        </Button>
      ),
    },
  ]
}

const STATUS_TONES = {
  pending: 'warning',
  confirmed: 'success',
  settled: 'success',
  rejected: 'error',
  withdrawn: 'neutral',
} as const

function historyColumns(t: Translate, locale: string, linkPersons: boolean): TableColumns<HandoverRow> {
  return [
    {
      accessorKey: 'number',
      header: t('payments.cashCustody.history.columns.number'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="font-medium" data-testid="handover-number">
          {row.original.number}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('payments.cashCustody.history.columns.status'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => {
        const { status, sentByCollector, rejectionReason } = row.original
        const key = status === 'confirmed' && !sentByCollector ? 'settled' : status
        return (
          <span className="flex flex-col gap-0.5" data-testid="handover-status" data-status={key}>
            <StatusTag status={STATUS_TONES[key]}>{t(`payments.cashCustody.history.status.${key}`)}</StatusTag>
            {status === 'rejected' && rejectionReason ? (
              <span className="text-muted-foreground text-sm">{rejectionReason}</span>
            ) : null}
          </span>
        )
      },
    },
    {
      accessorKey: 'createdAt',
      header: t('payments.cashCustody.history.columns.when'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(locale),
    },
    {
      id: 'collector',
      header: t('payments.cashCustody.history.columns.from'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => {
        const name = personName(row.original.collector) || t('payments.cashCustody.unknownPerson')
        // The treasurer opens no people record (DD-33, #245): the name stays text.
        if (!linkPersons) return name
        return (
          <Link
            className="underline-offset-4 hover:underline"
            href={`/backend/people/persons/${encodeURIComponent(row.original.collectorPersonId)}`}
          >
            {name}
          </Link>
        )
      },
    },
    {
      id: 'receipts',
      header: t('payments.cashCustody.history.columns.receipts'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => <span className="text-sm">{row.original.receiptNumbers.join(', ')}</span>,
    },
    {
      id: 'receivedBy',
      header: t('payments.cashCustody.history.columns.receivedBy'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) =>
        row.original.receivedBy ? (
          personName(row.original.receivedBy)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: 'amount',
      header: t('payments.cashCustody.history.columns.amount'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.amount, locale)}</span>,
    },
  ]
}

function EmptyList({
  title,
  level,
  testId,
  children,
}: {
  title: string
  level: 1 | 2
  testId: string
  children: React.ReactNode
}) {
  const Heading = level === 1 ? 'h1' : 'h2'
  return (
    <div className="bg-card mx-1 rounded-lg border px-4 py-3 sm:mx-2">
      <Heading className="text-lg font-semibold">{title}</Heading>
      <p className="text-muted-foreground mt-2 text-sm" data-testid={testId}>
        {children}
      </p>
    </div>
  )
}

export function CashCustodyPage() {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const custody = useCashCustody()
  const [page, setPage] = React.useState(1)
  const handovers = useHandovers(page)
  const [accepting, setAccepting] = React.useState<CustodyCollector | null>(null)
  const columns = React.useMemo(() => custodyColumns(t, locale, setAccepting), [t, locale])
  const linkPersons = usePeopleRecordAccess()
  const history = React.useMemo(() => historyColumns(t, locale, linkPersons), [t, locale, linkPersons])
  const refresh = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: [CASH_CUSTODY_QUERY_KEY] }),
    [queryClient],
  )

  return (
    <div className="flex flex-col gap-6" data-testid="cash-custody">
      <section data-testid="custody-list">
        {custody.data && custody.data.items.length === 0 ? (
          <EmptyList title={t('payments.cashCustody.title')} level={1} testId="custody-empty">
            {t('payments.cashCustody.empty')}
          </EmptyList>
        ) : (
          <DataTable<CustodyCollector>
            title={t('payments.cashCustody.title')}
            titleHeadingLevel={1}
            columns={columns}
            data={custody.data?.items ?? []}
            isLoading={custody.isLoading}
            error={
              custody.error ? (
                <TableLoadError
                  message={t('payments.cashCustody.errors.load')}
                  retryLabel={t('payments.common.retry')}
                  onRetry={() => void custody.refetch()}
                />
              ) : null
            }
          />
        )}
        {custody.data && custody.data.items.length > 0 ? (
          <p className="mt-2 text-sm" data-testid="custody-grand-total">
            {t('payments.cashCustody.grandTotal', { total: formatMoney(custody.data.total, locale) })}
          </p>
        ) : null}
      </section>
      <PendingHandovers headingLevel={2} emptyText={null} />
      <section data-testid="handover-history">
        {handovers.data && handovers.data.total === 0 ? (
          <EmptyList title={t('payments.cashCustody.history.title')} level={2} testId="handover-history-empty">
            {t('payments.cashCustody.history.empty')}
          </EmptyList>
        ) : (
          <DataTable<HandoverRow>
            title={t('payments.cashCustody.history.title')}
            titleHeadingLevel={2}
            columns={history}
            data={handovers.data?.items ?? []}
            isLoading={handovers.isLoading}
            error={
              handovers.error ? (
                <TableLoadError
                  message={t('payments.cashCustody.errors.history')}
                  retryLabel={t('payments.common.retry')}
                  onRetry={() => void handovers.refetch()}
                />
              ) : null
            }
            pagination={{
              page,
              pageSize: HANDOVER_PAGE_SIZE,
              total: handovers.data?.total ?? 0,
              totalPages: handovers.data?.totalPages ?? 0,
              onPageChange: setPage,
            }}
          />
        )}
      </section>
      <AcceptHandoverDialog
        key={accepting?.collectorPersonId ?? 'none'}
        collector={accepting}
        onOpenChange={(open) => {
          if (!open) setAccepting(null)
        }}
        onAccepted={refresh}
      />
    </div>
  )
}
