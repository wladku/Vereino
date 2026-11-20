'use client'
// `/backend/payments/orders/[id]` — B-32 the order campaign (UX concept README B-32; payments spec REQ-032; issue
// #115; payments parity REQ-C05, REQ-C02, DD-C04, #293): the stages draft → open (collecting) → closed → ordered →
// delivered → completed with one "next" action ("Close orders" names the children without an order, the payment
// deadline and the automatic closing date; "Complete" with kits not handed over is a danger dialog with their number),
// the tiles Orders, Paid (of the value, due date) and Handed over (the supplier), the Messenger text, and the tabs:
// - Orders (with their count): the child and group, who ordered (name, phone, channel; hidden under 768 px), the items
//   with the notes, the print (hidden under 768 px), the amount, the payment (to pay / partially paid / paid, overdue
//   in the error variant, each payment's method and who took it), the handover (who, the time in the title) and the
//   row actions Cash (the shared dialog with the orderer and that order's charge), Hand over (only once delivered; an
//   unpaid kit asks first and names the amount — the coach's `payments.orders.hand_over`, DD-C04) and Charge (B-22);
// - Supplier summary: units per product and size with those ordered in sets, the prints with the child, CSV download,
//   and a warning while orders are still collected;
// - No order (with their count): the children with their guardians, "(no e-mail)" and "no guardian"; "Remind everyone".
// Every transition sends the campaign's lock token; a stale token surfaces the platform conflict and refreshes the page.
import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { useConfirmDialog, type ConfirmDialogOptions } from '@open-mercato/ui/backend/confirm-dialog'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useIsMobile } from '@open-mercato/ui/hooks/useIsMobile'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { StepIndicator, type StepIndicatorStep } from '@open-mercato/ui/primitives/step-indicator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@open-mercato/ui/primitives/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { TableLoadError } from '@vereino/ui'
import { CAMPAIGN_STATUSES, isCampaignEditable, type CampaignAction } from '../../lib/order-campaigns'
import { AcceptCashButton } from '../AcceptCashButton'
import { ChargeStatusBadge } from '../ChargesTable'
import { chargeHref, errorMessage, formatMoney, personName, type TableColumns, type Translate } from '../client-helpers'
import { handOverKit } from '../club/coach/coach-client'
import { CampaignStageBadge } from './OrderCampaignsTable'
import {
  ORDERS_HREF,
  campaignApi,
  campaignHref,
  pluralKey,
  type CampaignDetail,
  type CampaignOrderRow,
  type MissingChildRow,
  type SupplierSummaryView,
} from './orders-client'
import { DialogContent } from '@/components/ui/dialog'

type CampaignLoad = { status: 'ok'; campaign: CampaignDetail } | { status: 'not_found' } | { status: 'denied' }

type Confirm = (options?: ConfirmDialogOptions) => Promise<boolean>

/** The charge statuses a payment can still be taken for (the "Cash" row action). */
const PAYABLE = new Set(['open', 'partially_paid'])

/** A calendar date (`YYYY-MM-DD`) in the user's locale. */
function formatDay(value: string | null, locale: string): string {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  )
}

function formatMoment(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function Kpi({
  label,
  value,
  hint,
  testId,
}: {
  label: string
  value: React.ReactNode
  hint: React.ReactNode
  testId: string
}) {
  return (
    <section className="bg-card flex min-w-0 flex-col gap-1 rounded-lg border p-4" data-testid={testId}>
      <h2 className="text-muted-foreground text-sm font-medium">{label}</h2>
      <p className="text-xl font-semibold break-words">{value}</p>
      <p className="text-muted-foreground text-sm break-words" data-testid={`${testId}-hint`}>
        {hint}
      </p>
    </section>
  )
}

function ShareTextDialog({
  campaignId,
  open,
  onOpenChange,
  t,
}: {
  campaignId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  t: Translate
}) {
  const textId = React.useId()
  const query = useQuery({
    queryKey: ['payments-order-campaign-share', campaignId],
    enabled: open,
    queryFn: async () => {
      const call = await apiCall<{ text: string; link: string }>(campaignApi(campaignId, '/share-text'))
      if (!call.ok || !call.result) throw new Error(t('payments.orders.share.error'))
      return call.result
    },
  })
  const copy = async () => {
    if (!query.data) return
    try {
      await navigator.clipboard.writeText(query.data.text)
      flash(t('payments.orders.share.copied'), 'success')
      onOpenChange(false)
    } catch {
      flash(t('payments.orders.share.copyFailed'), 'error')
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('payments.common.close')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void copy()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('payments.orders.share.title')}</DialogTitle>
          <DialogDescription>{t('payments.orders.share.help')}</DialogDescription>
        </DialogHeader>
        {query.error ? <ErrorMessage label={t('payments.orders.share.error')} /> : null}
        <label htmlFor={textId} className="sr-only">
          {t('payments.orders.share.title')}
        </label>
        <Textarea
          id={textId}
          readOnly
          rows={6}
          value={query.data?.text ?? ''}
          data-testid="order-campaign-share-text"
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('payments.common.close')}
          </Button>
          <Button
            type="button"
            disabled={!query.data}
            data-testid="order-campaign-share-copy"
            onClick={() => {
              void copy()
            }}
          >
            {t('payments.orders.share.copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "to pay {amount}" (error when overdue), "partially paid — {amount} left", or the charge's own status badge. */
function PaymentCell({ row, t, locale }: { row: CampaignOrderRow; t: Translate; locale: string }) {
  const amount = formatMoney(row.remaining, locale)
  const badge =
    row.chargeStatus === 'open' ? (
      <StatusBadge variant={row.overdue ? 'error' : 'info'} dot>
        {t('payments.orders.orders.toPay', { amount })}
      </StatusBadge>
    ) : row.chargeStatus === 'partially_paid' ? (
      <StatusBadge variant={row.overdue ? 'error' : 'warning'} dot>
        {t('payments.orders.orders.partlyPaid', { amount })}
      </StatusBadge>
    ) : (
      <ChargeStatusBadge status={row.chargeStatus} t={t} />
    )
  return (
    <div className="flex flex-col items-start gap-1" data-testid="order-row-payment">
      {badge}
      {row.overdue ? <span className="text-sm">{t('payments.charges.overdue')}</span> : null}
      {row.payments.length > 0 ? (
        <span className="text-muted-foreground text-sm" data-testid="order-row-payments">
          {row.payments
            .map((payment) =>
              [t(`payments.ledger.method.${payment.method}`, payment.method), personName(payment.collectedBy)]
                .filter(Boolean)
                .join(' — '),
            )
            .join(', ')}
        </span>
      ) : null}
    </div>
  )
}

function HandoverCell({ row, t, locale }: { row: CampaignOrderRow; t: Translate; locale: string }) {
  if (!row.handedOver) return <span data-testid="order-row-handover">—</span>
  return (
    <div
      className="flex flex-col items-start gap-1"
      data-testid="order-row-handover"
      title={row.handedOverAt ? formatMoment(row.handedOverAt, locale) : undefined}
    >
      <StatusBadge variant="success" dot>
        {t('payments.orders.orders.handedOver')}
      </StatusBadge>
      {row.handedOverBy ? <span className="text-muted-foreground text-sm">{personName(row.handedOverBy)}</span> : null}
    </div>
  )
}

function RowActions({
  row,
  campaign,
  t,
  onHandOver,
  onChanged,
}: {
  row: CampaignOrderRow
  campaign: CampaignDetail
  t: Translate
  onHandOver: (row: CampaignOrderRow) => void
  onChanged: () => Promise<void>
}) {
  const child = personName(row.participant)
  return (
    <div className="flex flex-wrap gap-2">
      {row.chargeStatus && PAYABLE.has(row.chargeStatus) ? (
        <AcceptCashButton
          origin="order_campaign"
          payerPersonId={row.orderedByPersonId}
          chargeIds={[row.chargeId]}
          size="sm"
          label={t('payments.orders.orders.cash')}
          ariaLabel={t('payments.orders.orders.cashFor', { child })}
          testId="order-row-cash"
          onDone={onChanged}
        />
      ) : null}
      {campaign.status === 'delivered' && !row.handedOver && row.groupId ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={t('payments.orders.orders.handOverFor', { child })}
          data-testid="order-row-hand-over"
          onClick={() => {
            onHandOver(row)
          }}
        >
          {t('payments.orders.orders.handOver')}
        </Button>
      ) : null}
      <Button asChild size="sm" variant="ghost">
        <Link
          href={chargeHref(row.chargeId)}
          aria-label={t('payments.orders.orders.chargeFor', { child })}
          data-testid="order-row-charge"
        >
          {t('payments.orders.orders.charge')}
        </Link>
      </Button>
    </div>
  )
}

function orderColumns(
  campaign: CampaignDetail,
  t: Translate,
  locale: string,
  compact: boolean,
  onHandOver: (row: CampaignOrderRow) => void,
  onChanged: () => Promise<void>,
): TableColumns<CampaignOrderRow> {
  const columns: TableColumns<CampaignOrderRow> = [
    {
      id: 'participant',
      header: t('payments.orders.orders.columns.child'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium" data-testid="order-row-child">
            {personName(row.original.participant) || '—'}
          </span>
          {row.original.groupName ? (
            <span className="text-muted-foreground text-sm">{row.original.groupName}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'orderedBy',
      header: t('payments.orders.orders.columns.orderedBy'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <div className="flex flex-col" data-testid="order-row-ordered-by">
          <span>{personName(row.original.orderedBy) || '—'}</span>
          <span className="text-muted-foreground text-sm">
            {[row.original.contactPhone, t(`payments.orders.orders.via.${row.original.submittedVia}`)]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      ),
    },
    {
      id: 'lines',
      header: t('payments.orders.orders.columns.products'),
      enableSorting: false,
      meta: { priority: 2, maxWidth: '20rem' },
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm">
            {row.original.lines.map((line, index) => (
              <React.Fragment key={`${line.productId}-${String(index)}`}>
                {index > 0 ? <br /> : null}
                {[line.productName, line.sizes ?? line.size].filter(Boolean).join(' — ')}
              </React.Fragment>
            ))}
          </span>
          {row.original.notes ? (
            <span className="text-muted-foreground text-sm" data-testid="order-row-notes">
              {t('payments.orders.orders.notes', { notes: row.original.notes })}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'print',
      header: t('payments.orders.orders.columns.print'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) =>
        [row.original.printName, row.original.printNumber].filter((value) => value !== null).join(' ') || '—',
    },
    {
      id: 'total',
      header: t('payments.orders.orders.columns.total'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => formatMoney(row.original.total, locale),
    },
    {
      id: 'payment',
      header: t('payments.orders.orders.columns.payment'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <PaymentCell row={row.original} t={t} locale={locale} />,
    },
    {
      id: 'handover',
      header: t('payments.orders.orders.columns.handedOver'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => <HandoverCell row={row.original} t={t} locale={locale} />,
    },
    {
      id: 'actions',
      header: t('payments.orders.orders.columns.actions'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <RowActions row={row.original} campaign={campaign} t={t} onHandOver={onHandOver} onChanged={onChanged} />
      ),
    },
  ]
  // "Ordered by" and "Print" give way to the actions on a phone (B-32 responsive contract).
  return compact ? columns.filter((column) => column.id !== 'orderedBy' && column.id !== 'print') : columns
}

function OrdersTab({
  campaign,
  t,
  locale,
  confirm,
  onShare,
  onCampaignChanged,
}: {
  campaign: CampaignDetail
  t: Translate
  locale: string
  confirm: Confirm
  onShare: () => void
  onCampaignChanged: () => Promise<unknown>
}) {
  const [page, setPage] = React.useState(1)
  const compact = useIsMobile()
  const query = useQuery({
    queryKey: ['payments-order-campaign-orders', campaign.id, page],
    queryFn: async () => {
      const call = await apiCall<{ items: CampaignOrderRow[]; total: number; totalPages: number }>(
        `/api/payments/orders?campaignId=${encodeURIComponent(campaign.id)}&page=${String(page)}&pageSize=50`,
      )
      if (!call.ok || !call.result) throw new Error(t('payments.orders.orders.error'))
      return call.result
    },
  })
  const { refetch } = query
  const refresh = React.useCallback(async () => {
    await Promise.all([refetch(), onCampaignChanged()])
  }, [refetch, onCampaignChanged])
  const handOver = React.useCallback(
    async (row: CampaignOrderRow) => {
      if (!row.groupId) return
      const unpaid = row.remaining > 0
      if (unpaid) {
        const confirmed = await confirm({
          title: t('payments.orders.handOver.unpaidTitle'),
          text: [
            t('payments.orders.handOver.unpaidDue', { amount: formatMoney(row.remaining, locale) }),
            row.dueDate ? t('payments.orders.handOver.unpaidText', { due: formatDay(row.dueDate, locale) }) : '',
          ]
            .filter(Boolean)
            .join(' '),
          confirmText: t('payments.orders.handOver.unpaidSubmit'),
        })
        if (!confirmed) return
      }
      try {
        await handOverKit(row.id, { groupId: row.groupId, confirmUnpaid: unpaid }, t('payments.orders.handOver.error'))
        flash(t('payments.orders.handOver.done', { child: personName(row.participant) }), 'success')
      } catch (error: unknown) {
        flash(errorMessage(error, t('payments.orders.handOver.error')), 'error')
      } finally {
        await refresh()
      }
    },
    [confirm, locale, refresh, t],
  )
  const columns = React.useMemo(
    () =>
      orderColumns(
        campaign,
        t,
        locale,
        compact,
        (row) => {
          void handOver(row)
        },
        refresh,
      ),
    [campaign, t, locale, compact, handOver, refresh],
  )
  return (
    <DataTable<CampaignOrderRow>
      title={t('payments.orders.tabs.orders')}
      extensionTableId="payments.order-campaign-orders"
      // The "… results in 53ms" footer does not wrap and outgrows 320 px with the CI font; its length changes run to
      // run (TEST-C06), as on the roster panel.
      showQueryTime={false}
      columns={columns}
      data={query.data?.items ?? []}
      isLoading={query.isLoading}
      error={
        query.error ? (
          <TableLoadError
            message={t('payments.orders.orders.error')}
            retryLabel={t('payments.common.retry')}
            onRetry={() => void refetch()}
          />
        ) : null
      }
      emptyState={
        <div className="flex flex-col items-center gap-2 text-center" data-testid="order-campaign-orders-empty">
          <p className="font-medium">{t('payments.orders.orders.empty')}</p>
          <p className="text-muted-foreground text-sm">
            {campaign.status === 'draft'
              ? t('payments.orders.orders.emptyDraft')
              : t('payments.orders.orders.emptyShare')}
          </p>
          {campaign.status !== 'draft' ? (
            <Button type="button" variant="outline" size="sm" onClick={onShare}>
              {t('payments.orders.share.action')}
            </Button>
          ) : null}
        </div>
      }
      pagination={{
        page,
        pageSize: 50,
        total: query.data?.total ?? 0,
        totalPages: query.data?.totalPages ?? 0,
        onPageChange: setPage,
      }}
    />
  )
}

function SummaryTab({ campaign, t }: { campaign: CampaignDetail; t: Translate }) {
  const query = useQuery({
    queryKey: ['payments-order-campaign-summary', campaign.id],
    queryFn: async () => {
      const call = await apiCall<SupplierSummaryView>(campaignApi(campaign.id, '/summary'))
      if (!call.ok || !call.result) throw new Error(t('payments.orders.summary.error'))
      return call.result
    },
  })
  if (query.isLoading) return <LoadingMessage label={t('payments.orders.summary.loading')} />
  if (query.error || !query.data) return <ErrorMessage label={t('payments.orders.summary.error')} />
  const summary = query.data
  return (
    <div className="flex flex-col gap-4" data-testid="order-campaign-summary">
      {campaign.status === 'open' ? (
        <Alert status="warning" data-testid="order-campaign-summary-collecting">
          <div className="flex flex-col gap-1">
            <strong>{t('payments.orders.summary.collectingTitle')}</strong>
            <span>{t('payments.orders.summary.collectingText')}</span>
          </div>
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button asChild variant="outline">
          <a href={campaignApi(campaign.id, '/summary?format=csv')} download data-testid="order-campaign-summary-csv">
            {t('payments.orders.summary.csv')}
          </a>
        </Button>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">{t('payments.orders.summary.units')}</h2>
        {summary.units.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('payments.orders.summary.empty')}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('payments.orders.csv.product')}</TableHead>
                  <TableHead>{t('payments.orders.csv.size')}</TableHead>
                  <TableHead className="text-right">{t('payments.orders.csv.quantity')}</TableHead>
                  <TableHead className="text-right">{t('payments.orders.summary.inSets')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.units.map((unit) => (
                  <TableRow key={`${unit.productId}-${unit.size ?? ''}`} data-testid="order-campaign-summary-unit">
                    <TableCell>{unit.productName}</TableCell>
                    <TableCell>{unit.size ?? '—'}</TableCell>
                    <TableCell className="text-right">{unit.quantity}</TableCell>
                    <TableCell className="text-right">{unit.inSets > 0 ? unit.inSets : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">{t('payments.orders.summary.prints')}</h2>
        {summary.prints.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('payments.orders.summary.noPrints')}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('payments.orders.orders.columns.child')}</TableHead>
                  <TableHead>{t('payments.orders.csv.printName')}</TableHead>
                  <TableHead>{t('payments.orders.csv.printNumber')}</TableHead>
                  <TableHead>{t('payments.orders.csv.group')}</TableHead>
                  <TableHead>{t('payments.orders.csv.sizes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.prints.map((print, index) => (
                  <TableRow
                    key={`${String(index)}-${print.printName ?? ''}`}
                    data-testid="order-campaign-summary-print"
                  >
                    <TableCell>{personName(print.participant) || '—'}</TableCell>
                    <TableCell>{print.printName ?? '—'}</TableCell>
                    <TableCell>{print.printNumber ?? '—'}</TableCell>
                    <TableCell>{print.groupName ?? '—'}</TableCell>
                    <TableCell>
                      {print.sizes
                        .map((entry) => (entry.size ? `${entry.productName}: ${entry.size}` : entry.productName))
                        .join('; ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}

function guardiansText(item: MissingChildRow, t: Translate): string {
  if (item.guardians.length === 0) return t('payments.orders.missing.noGuardian')
  return item.guardians
    .map((guardian) => {
      const name = personName(guardian)
      return guardian.hasEmail ? name : `${name} (${t('payments.orders.missing.noEmail')})`
    })
    .join(', ')
}

function MissingTab({ campaign, t }: { campaign: CampaignDetail; t: Translate }) {
  const [pending, setPending] = React.useState(false)
  const query = useQuery({
    queryKey: ['payments-order-campaign-missing', campaign.id],
    queryFn: async () => {
      const call = await apiCall<{ items: MissingChildRow[]; total: number }>(campaignApi(campaign.id, '/missing'))
      if (!call.ok || !call.result) throw new Error(t('payments.orders.missing.error'))
      return call.result
    },
  })
  const remind = async () => {
    setPending(true)
    try {
      const call = await apiCallOrThrow<{ children: number; recipients: number }>(
        campaignApi(campaign.id, '/remind'),
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        { errorMessage: t('payments.orders.missing.remindError') },
      )
      flash(t('payments.orders.missing.reminded', { count: call.result?.recipients ?? 0 }), 'success')
    } catch (error: unknown) {
      flash(errorMessage(error, t('payments.orders.missing.remindError')), 'error')
    } finally {
      setPending(false)
    }
  }
  if (query.isLoading) return <LoadingMessage label={t('payments.orders.missing.loading')} />
  if (query.error || !query.data) return <ErrorMessage label={t('payments.orders.missing.error')} />
  const items = query.data.items
  return (
    <div className="flex flex-col gap-3" data-testid="order-campaign-missing">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">{t('payments.orders.missing.count', { count: items.length })}</p>
        {campaign.status === 'open' && items.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            data-testid="order-campaign-remind"
            onClick={() => {
              void remind()
            }}
          >
            {t('payments.orders.missing.remind')}
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('payments.orders.missing.empty')}</p>
      ) : (
        <div className="relative overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('payments.orders.orders.columns.child')}</TableHead>
                <TableHead>{t('payments.orders.orders.columns.group')}</TableHead>
                <TableHead>{t('payments.orders.missing.guardians')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.personId} data-testid="order-campaign-missing-row">
                  <TableCell className="font-medium">{personName(item.participant) || '—'}</TableCell>
                  <TableCell>{item.groupName ?? '—'}</TableCell>
                  <TableCell data-testid="order-campaign-missing-guardians">{guardiansText(item, t)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function stageSteps(campaign: CampaignDetail, t: Translate): StepIndicatorStep[] {
  const current = CAMPAIGN_STATUSES.indexOf(campaign.status)
  return CAMPAIGN_STATUSES.map((status, index) => ({
    id: status,
    label: t(`payments.orders.stage.${status}`),
    status: index < current || campaign.status === 'completed' ? 'complete' : index === current ? 'current' : 'pending',
  }))
}

/** The confirmation of a stage move: "Close orders" and "Complete" carry what the administrator must know first. */
function advanceDialog(
  action: CampaignAction,
  campaign: CampaignDetail,
  t: Translate,
  locale: string,
): ConfirmDialogOptions {
  const base = {
    title: t(`payments.orders.next.${action}.title`),
    confirmText: t(`payments.orders.next.${action}.action`),
  }
  if (action === 'close') {
    return {
      ...base,
      text: [
        t('payments.orders.next.close.text', { count: campaign.kpis.missing }),
        t('payments.orders.next.close.due', { date: formatDay(campaign.paymentDueOn, locale) }),
        t('payments.orders.next.close.auto', { date: formatDay(campaign.closesOn, locale) }),
      ].join(' '),
    }
  }
  if (action === 'complete' && campaign.kpis.notHandedOver > 0) {
    const count = campaign.kpis.notHandedOver
    return {
      title: t('payments.orders.next.complete.title'),
      text: [
        t(`payments.orders.next.complete.notHanded.${pluralKey(locale, count)}`, { count }),
        t('payments.orders.next.complete.notHandedText'),
      ].join(' '),
      confirmText: t('payments.orders.next.complete.anyway'),
      variant: 'destructive',
    }
  }
  return { ...base, text: t(`payments.orders.next.${action}.text`) }
}

export function OrderCampaignPage({ id }: { id: string }) {
  const t = useT()
  const locale = useLocale()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [sharing, setSharing] = React.useState(() => searchParams.get('share') === '1')
  const [pending, setPending] = React.useState(false)
  const query = useQuery({
    queryKey: ['payments-order-campaign', id],
    queryFn: async (): Promise<CampaignLoad> => {
      const call = await apiCall<CampaignDetail>(campaignApi(id))
      if (call.status === 404) return { status: 'not_found' }
      if (call.status === 403) return { status: 'denied' }
      if (!call.ok || !call.result) throw new Error(t('payments.orders.errors.load'))
      return { status: 'ok', campaign: call.result }
    },
  })
  const { refetch } = query
  const refreshCampaign = React.useCallback(async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ['payments-order-campaign-summary', id] }),
      queryClient.invalidateQueries({ queryKey: ['payments-order-campaign-missing', id] }),
    ])
  }, [refetch, queryClient, id])
  const openShare = React.useCallback(() => {
    setSharing(true)
  }, [])

  if (query.isLoading) return <LoadingMessage label={t('payments.orders.loading')} />
  if (query.error) return <ErrorMessage label={t('payments.orders.errors.load')} />
  const load = query.data
  if (!load || load.status === 'not_found') {
    return (
      <RecordNotFoundState
        label={t('payments.orders.errors.notFound')}
        backHref={ORDERS_HREF}
        backLabel={t('payments.orders.actions.back')}
      />
    )
  }
  if (load.status === 'denied') return <AccessDeniedMessage label={t('payments.orders.errors.denied')} />
  const campaign = load.campaign

  const advance = async (action: CampaignAction) => {
    const confirmed = await confirm(advanceDialog(action, campaign, t, locale))
    if (!confirmed) return
    setPending(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(campaign.updatedAt), () =>
        apiCallOrThrow(
          campaignApi(campaign.id, `/${action}`),
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
          { errorMessage: t('payments.orders.next.error') },
        ),
      )
      flash(t(`payments.orders.next.${action}.done`), 'success')
      if (action === 'open') setSharing(true)
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void query.refetch() })) {
        flash(errorMessage(error, t('payments.orders.next.error')), 'error')
      }
    } finally {
      setPending(false)
      await query.refetch()
    }
  }

  const next = campaign.nextAction
  const { kpis } = campaign
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={ORDERS_HREF} className="text-muted-foreground text-sm underline-offset-2 hover:underline">
            ← {t('payments.orders.actions.back')}
          </Link>
          <h1 className="text-2xl font-semibold break-words" data-testid="order-campaign-title">
            {campaign.name}
          </h1>
          <span className="text-muted-foreground text-sm break-words">
            {[
              campaign.sectionName,
              campaign.groups.map((group) => group.name).join(', '),
              t('payments.orders.deadlines', {
                closesOn: formatDay(campaign.closesOn, locale),
                paymentDueOn: formatDay(campaign.paymentDueOn, locale),
              }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span data-testid="order-campaign-stage">
            <CampaignStageBadge status={campaign.status} t={t} />
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {isCampaignEditable(campaign.status) ? (
            <Button asChild variant="outline">
              <Link href={`${campaignHref(campaign.id)}/edit`} data-testid="order-campaign-edit">
                {t('payments.common.edit')}
              </Link>
            </Button>
          ) : null}
          {campaign.status !== 'draft' ? (
            <Button type="button" variant="outline" data-testid="order-campaign-share" onClick={openShare}>
              {t('payments.orders.share.action')}
            </Button>
          ) : null}
          {next ? (
            <Button
              type="button"
              disabled={pending}
              data-testid="order-campaign-next"
              onClick={() => {
                void advance(next)
              }}
            >
              {t(`payments.orders.next.${next}.action`)}
            </Button>
          ) : null}
        </div>
      </header>
      <div className="overflow-x-auto">
        <StepIndicator steps={stageSteps(campaign, t)} aria-label={t('payments.orders.stages')} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label={t('payments.orders.kpi.orders')}
          value={t('payments.orders.kpi.ordersOf', { orders: kpis.orders, children: kpis.children })}
          hint={t('payments.orders.kpi.ordersHint')}
          testId="order-campaign-kpi-orders"
        />
        <Kpi
          label={t('payments.orders.kpi.paid')}
          value={formatMoney(kpis.paid, locale)}
          hint={t('payments.orders.kpi.paidHint', {
            value: formatMoney(kpis.value, locale),
            date: formatDay(campaign.paymentDueOn, locale),
          })}
          testId="order-campaign-kpi-paid"
        />
        <Kpi
          label={t('payments.orders.kpi.handedOver')}
          value={t('payments.orders.kpi.handedOverOf', { handedOver: kpis.handedOver, orders: kpis.orders })}
          hint={campaign.supplierName ?? t('payments.orders.kpi.noSupplier')}
          testId="order-campaign-kpi-handed-over"
        />
      </div>
      <Tabs defaultValue="orders" variant="underline">
        <div className="overflow-x-auto">
          <TabsList aria-label={t('payments.orders.tabs.label')}>
            <TabsTrigger value="orders">{t('payments.orders.tabs.ordersCount', { count: kpis.orders })}</TabsTrigger>
            <TabsTrigger value="summary">{t('payments.orders.tabs.summary')}</TabsTrigger>
            <TabsTrigger value="missing">{t('payments.orders.tabs.missingCount', { count: kpis.missing })}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="orders" className="pt-4">
          <OrdersTab
            campaign={campaign}
            t={t}
            locale={locale}
            confirm={confirm}
            onShare={openShare}
            onCampaignChanged={refreshCampaign}
          />
        </TabsContent>
        <TabsContent value="summary" className="pt-4">
          <SummaryTab campaign={campaign} t={t} />
        </TabsContent>
        <TabsContent value="missing" className="pt-4">
          <MissingTab campaign={campaign} t={t} />
        </TabsContent>
      </Tabs>
      <ShareTextDialog campaignId={campaign.id} open={sharing} onOpenChange={setSharing} t={t} />
      {ConfirmDialogElement}
    </div>
  )
}
