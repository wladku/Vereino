'use client'
// `/backend/payments/orders/[id]` — B-32 the order campaign (UX concept README B-32; payments spec REQ-032; issue
// #115): the stages draft → open (collecting) → closed → ordered → delivered → completed with one "next" action (the
// "Close orders" dialog counts the children without an order), the KPIs, the Messenger text, and the tabs Orders,
// Supplier summary (units per product and size, prints, CSV download) and No order ("Remind everyone"). Every
// transition sends the campaign's lock token; a stale token surfaces the platform conflict and refreshes the page.
import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { StepIndicator, type StepIndicatorStep } from '@open-mercato/ui/primitives/step-indicator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@open-mercato/ui/primitives/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { CAMPAIGN_STATUSES, isCampaignEditable, type CampaignAction } from '../../lib/order-campaigns'
import { ChargeStatusBadge } from '../ChargesTable'
import { chargeHref, errorMessage, formatMoney, personName, type TableColumns, type Translate } from '../client-helpers'
import { CampaignStageBadge } from './OrderCampaignsTable'
import {
  ORDERS_HREF,
  campaignApi,
  campaignHref,
  type CampaignDetail,
  type CampaignOrderRow,
  type MissingChildRow,
  type SupplierSummaryView,
} from './orders-client'

type CampaignLoad = { status: 'ok'; campaign: CampaignDetail } | { status: 'not_found' } | { status: 'denied' }

function Kpi({ label, value, testId }: { label: string; value: React.ReactNode; testId: string }) {
  return (
    <section className="bg-card flex min-w-0 flex-col gap-1 rounded-lg border p-4" data-testid={testId}>
      <h2 className="text-muted-foreground text-sm font-medium">{label}</h2>
      <p className="text-xl font-semibold break-words">{value}</p>
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

function orderColumns(t: Translate, locale: string): TableColumns<CampaignOrderRow> {
  return [
    {
      id: 'participant',
      header: t('payments.orders.orders.columns.child'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => personName(row.original.participant) || '—',
    },
    {
      accessorKey: 'groupName',
      header: t('payments.orders.orders.columns.group'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.groupName ?? '—',
    },
    {
      id: 'lines',
      header: t('payments.orders.orders.columns.products'),
      enableSorting: false,
      meta: { priority: 2, truncate: true, maxWidth: '20rem' },
      cell: ({ row }) =>
        row.original.lines
          .map((line) => [line.productName, line.sizes ?? line.size].filter(Boolean).join(' — '))
          .join('; '),
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
      id: 'status',
      header: t('payments.orders.orders.columns.payment'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <Link href={chargeHref(row.original.chargeId)} className="underline-offset-2 hover:underline">
          <ChargeStatusBadge status={row.original.chargeStatus} t={t} />
        </Link>
      ),
    },
    {
      id: 'handedOver',
      header: t('payments.orders.orders.columns.handedOver'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => (row.original.handedOver ? t('payments.common.yes') : t('payments.common.no')),
    },
  ]
}

function OrdersTab({ campaignId, t, locale }: { campaignId: string; t: Translate; locale: string }) {
  const [page, setPage] = React.useState(1)
  const query = useQuery({
    queryKey: ['payments-order-campaign-orders', campaignId, page],
    queryFn: async () => {
      const call = await apiCall<{ items: CampaignOrderRow[]; total: number; totalPages: number }>(
        `/api/payments/orders?campaignId=${encodeURIComponent(campaignId)}&page=${String(page)}&pageSize=50`,
      )
      if (!call.ok || !call.result) throw new Error(t('payments.orders.orders.error'))
      return call.result
    },
  })
  const columns = React.useMemo(() => orderColumns(t, locale), [t, locale])
  return (
    <DataTable<CampaignOrderRow>
      title={t('payments.orders.tabs.orders')}
      extensionTableId="payments.order-campaign-orders"
      columns={columns}
      data={query.data?.items ?? []}
      isLoading={query.isLoading}
      error={query.error ? t('payments.orders.orders.error') : null}
      emptyState={<p className="text-muted-foreground text-sm">{t('payments.orders.orders.empty')}</p>}
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

function SummaryTab({ campaignId, t }: { campaignId: string; t: Translate }) {
  const query = useQuery({
    queryKey: ['payments-order-campaign-summary', campaignId],
    queryFn: async () => {
      const call = await apiCall<SupplierSummaryView>(campaignApi(campaignId, '/summary'))
      if (!call.ok || !call.result) throw new Error(t('payments.orders.summary.error'))
      return call.result
    },
  })
  if (query.isLoading) return <LoadingMessage label={t('payments.orders.summary.loading')} />
  if (query.error || !query.data) return <ErrorMessage label={t('payments.orders.summary.error')} />
  const summary = query.data
  return (
    <div className="flex flex-col gap-4" data-testid="order-campaign-summary">
      <div className="flex justify-end">
        <Button asChild variant="outline">
          <a href={campaignApi(campaignId, '/summary?format=csv')} download data-testid="order-campaign-summary-csv">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.units.map((unit) => (
                  <TableRow key={`${unit.productId}-${unit.size ?? ''}`}>
                    <TableCell>{unit.productName}</TableCell>
                    <TableCell>{unit.size ?? '—'}</TableCell>
                    <TableCell className="text-right">{unit.quantity}</TableCell>
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
                  <TableHead>{t('payments.orders.csv.printName')}</TableHead>
                  <TableHead>{t('payments.orders.csv.printNumber')}</TableHead>
                  <TableHead>{t('payments.orders.csv.group')}</TableHead>
                  <TableHead>{t('payments.orders.csv.sizes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.prints.map((print, index) => (
                  <TableRow key={`${String(index)}-${print.printName ?? ''}`}>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.personId}>
                  <TableCell>{personName(item.participant) || '—'}</TableCell>
                  <TableCell>{item.groupName ?? '—'}</TableCell>
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

export function OrderCampaignPage({ id }: { id: string }) {
  const t = useT()
  const locale = useLocale()
  const searchParams = useSearchParams()
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
    const confirmed = await confirm({
      title: t(`payments.orders.next.${action}.title`),
      text:
        action === 'close'
          ? t('payments.orders.next.close.text', { count: campaign.kpis.missing })
          : t(`payments.orders.next.${action}.text`),
      confirmText: t(`payments.orders.next.${action}.action`),
    })
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
              t('payments.orders.deadlines', { closesOn: campaign.closesOn, paymentDueOn: campaign.paymentDueOn }),
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
            <Button
              type="button"
              variant="outline"
              data-testid="order-campaign-share"
              onClick={() => {
                setSharing(true)
              }}
            >
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={t('payments.orders.kpi.orders')}
          value={t('payments.orders.kpi.ordersOf', { orders: campaign.kpis.orders, children: campaign.kpis.children })}
          testId="order-campaign-kpi-orders"
        />
        <Kpi
          label={t('payments.orders.kpi.value')}
          value={formatMoney(campaign.kpis.value, locale)}
          testId="order-campaign-kpi-value"
        />
        <Kpi
          label={t('payments.orders.kpi.paid')}
          value={formatMoney(campaign.kpis.paid, locale)}
          testId="order-campaign-kpi-paid"
        />
        <Kpi
          label={t('payments.orders.kpi.handedOver')}
          value={campaign.kpis.handedOver}
          testId="order-campaign-kpi-handed-over"
        />
      </div>
      <Tabs defaultValue="orders" variant="underline">
        <div className="overflow-x-auto">
          <TabsList aria-label={t('payments.orders.tabs.label')}>
            <TabsTrigger value="orders">{t('payments.orders.tabs.orders')}</TabsTrigger>
            <TabsTrigger value="summary">{t('payments.orders.tabs.summary')}</TabsTrigger>
            <TabsTrigger value="missing">{t('payments.orders.tabs.missing')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="orders" className="pt-4">
          <OrdersTab campaignId={campaign.id} t={t} locale={locale} />
        </TabsContent>
        <TabsContent value="summary" className="pt-4">
          <SummaryTab campaignId={campaign.id} t={t} />
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
