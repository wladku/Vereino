'use client'
// `/backend/payments/charges/[id]` — B-22 Charge (UX concept README B-22; payments spec REQ-011, REQ-012; issue #109):
// the tiles "To pay", "Remaining and status" and "Payer and payee", the payments table (date, method, title or receipt,
// received by, amount) with "Reverse" on a cash or transfer payment, and the actions "Record payment" (open or
// partially paid) and "Cancel charge" (open and unpaid, with a required reason). Every action sends the charge's lock
// token and refreshes the record afterwards.
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@open-mercato/ui/primitives/table'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MANUAL_PAYMENT_METHODS, OPEN_CHARGE_STATUSES } from '../lib/charge-ledger'
import type { ChargeStatus } from '../lib/payments-rules'
import { ChargeStatusBadge, OverdueBadge } from './ChargesTable'
import { ReasonDialog } from './ReasonDialog'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import { CHARGES_HREF, formatMoney, personName, type ChargeDetail, type PaymentRow } from './client-helpers'

type ChargeLoad = { status: 'ok'; charge: ChargeDetail } | { status: 'not_found' } | { status: 'denied' }

function Tile({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <section className="bg-card flex min-w-0 flex-col gap-1 rounded-lg border p-4" data-testid={testId}>
      <h2 className="text-muted-foreground text-sm font-medium">{label}</h2>
      <div className="flex min-w-0 flex-col gap-1 break-words">{children}</div>
    </section>
  )
}

function reversible(payment: PaymentRow): boolean {
  return (
    payment.reversesPaymentId === null &&
    !payment.reversed &&
    (MANUAL_PAYMENT_METHODS as readonly string[]).includes(payment.method)
  )
}

export function ChargeRecord({ id }: { id: string }) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const [recording, setRecording] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const [reversing, setReversing] = React.useState<PaymentRow | null>(null)
  const query = useQuery({
    queryKey: ['payments-charge', id],
    queryFn: async (): Promise<ChargeLoad> => {
      const call = await apiCall<ChargeDetail>(`/api/payments/charges/${encodeURIComponent(id)}`)
      if (call.status === 404) return { status: 'not_found' }
      if (call.status === 403) return { status: 'denied' }
      if (!call.ok || !call.result) throw new Error(t('payments.ledger.errors.load'))
      return { status: 'ok', charge: call.result }
    },
  })
  const refresh = React.useCallback(async () => {
    await query.refetch()
    await queryClient.invalidateQueries({ queryKey: ['payments-charges'] })
  }, [query, queryClient])

  if (query.isLoading) return <LoadingMessage label={t('payments.ledger.loading')} />
  if (query.error) return <ErrorMessage label={t('payments.ledger.errors.load')} />
  const load = query.data
  if (!load || load.status === 'not_found') {
    return (
      <RecordNotFoundState
        label={t('payments.ledger.errors.notFound')}
        backHref={CHARGES_HREF}
        backLabel={t('payments.ledger.back')}
      />
    )
  }
  if (load.status === 'denied') return <AccessDeniedMessage label={t('payments.ledger.errors.denied')} />

  const charge = load.charge
  const status = (charge.status ?? 'open') as ChargeStatus
  const canRecord = OPEN_CHARGE_STATUSES.includes(status) && charge.remaining > 0
  const canCancel = status === 'open' && charge.paid === 0
  const lockHeader = () => buildOptimisticLockHeader(charge.updatedAt)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={CHARGES_HREF} className="text-muted-foreground text-sm underline-offset-2 hover:underline">
            ← {t('payments.ledger.back')}
          </Link>
          <h1 className="text-2xl font-semibold break-words" data-testid="charge-title">
            {charge.description}
          </h1>
          <span className="text-muted-foreground text-sm break-words">
            {[
              personName(charge.person),
              charge.periodLabel === 'one_off' ? t('payments.fees.period.one_off') : charge.periodLabel,
              t('payments.ledger.dueOn', { date: charge.dueDate ?? '' }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRecord ? (
            <Button
              type="button"
              data-testid="record-payment-open"
              onClick={() => {
                setRecording(true)
              }}
            >
              {t('payments.ledger.record.action')}
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              variant="destructive"
              data-testid="cancel-charge-open"
              onClick={() => {
                setCancelling(true)
              }}
            >
              {t('payments.ledger.cancel.action')}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Tile label={t('payments.ledger.tiles.toPay')} testId="charge-tile-to-pay">
          <span className="text-xl font-semibold">{formatMoney(charge.amountDue, locale)}</span>
          {charge.discountAmount > 0 ? (
            <span className="text-muted-foreground text-sm">
              {t('payments.ledger.tiles.discount', {
                amount: formatMoney(charge.amount, locale),
                discount: formatMoney(charge.discountAmount, locale),
                rule: charge.discountRuleName ?? '',
              })}
            </span>
          ) : null}
        </Tile>
        <Tile label={t('payments.ledger.tiles.remaining')} testId="charge-tile-remaining">
          <span className="text-xl font-semibold" data-testid="charge-remaining">
            {formatMoney(charge.remaining, locale)}
          </span>
          <span className="flex flex-wrap items-center gap-1">
            <span data-testid="charge-status">
              <ChargeStatusBadge status={charge.status} t={t} />
            </span>
            {charge.overdue ? <OverdueBadge t={t} /> : null}
          </span>
          {charge.status === 'cancelled' && charge.cancelReason ? (
            <span className="text-muted-foreground text-sm" data-testid="charge-cancel-reason">
              {t('payments.ledger.cancelledBecause', { reason: charge.cancelReason })}
            </span>
          ) : null}
        </Tile>
        <Tile label={t('payments.ledger.tiles.parties')} testId="charge-tile-parties">
          <span>
            {t('payments.ledger.tiles.payer')}:{' '}
            {charge.payerMissing ? (
              <span className="text-status-warning-text font-medium">{t('payments.charges.payerMissing')}</span>
            ) : (
              personName(charge.payer) || '—'
            )}
          </span>
          <span>
            {t('payments.ledger.tiles.payee')}: {t(`payments.charges.payee.${charge.payee ?? 'club'}`)}
          </span>
        </Tile>
      </div>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="text-lg font-semibold">{t('payments.ledger.payments.title')}</h2>
        {charge.payments.length === 0 ? (
          <p className="text-muted-foreground text-sm" data-testid="charge-payments-empty">
            {t('payments.ledger.payments.empty')}
          </p>
        ) : (
          <div className="relative max-w-full min-w-0 overflow-x-auto rounded-lg border">
            <Table data-testid="charge-payments">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('payments.ledger.payments.date')}</TableHead>
                  <TableHead>{t('payments.ledger.payments.method')}</TableHead>
                  <TableHead>{t('payments.ledger.payments.reference')}</TableHead>
                  <TableHead>{t('payments.ledger.payments.receivedBy')}</TableHead>
                  <TableHead className="text-right">{t('payments.ledger.payments.amount')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('payments.ledger.payments.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charge.payments.map((payment) => (
                  <TableRow key={payment.id} data-testid="charge-payment-row">
                    <TableCell>{payment.paidOn}</TableCell>
                    <TableCell>
                      <span className="flex flex-wrap items-center gap-1">
                        {t(`payments.ledger.method.${payment.method}`)}
                        {payment.reversesPaymentId ? (
                          <StatusBadge variant="neutral">{t('payments.ledger.payments.reversal')}</StatusBadge>
                        ) : null}
                        {payment.reversed ? (
                          <StatusBadge variant="warning">{t('payments.ledger.payments.reversed')}</StatusBadge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="break-words">{payment.reference ?? '—'}</TableCell>
                    <TableCell>{personName(payment.receivedBy) || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(payment.amount, locale)}</TableCell>
                    <TableCell className="text-right">
                      {reversible(payment) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid="reverse-payment-open"
                          onClick={() => {
                            setReversing(payment)
                          }}
                        >
                          {t('payments.ledger.reverse.action')}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {recording ? (
        <RecordPaymentDialog charge={charge} open={recording} onOpenChange={setRecording} onDone={refresh} />
      ) : null}
      <ReasonDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title={t('payments.ledger.cancel.title')}
        help={t('payments.ledger.cancel.help')}
        confirmLabel={t('payments.ledger.cancel.confirm')}
        errorFallback={t('payments.ledger.cancel.error')}
        testId="cancel-charge"
        onRefresh={refresh}
        onSubmit={async (reason) => {
          await withScopedApiRequestHeaders(lockHeader(), () =>
            apiCallOrThrow(
              `/api/payments/charges/${encodeURIComponent(charge.id)}/cancel`,
              { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) },
              { errorMessage: t('payments.ledger.cancel.error') },
            ),
          )
          flash(t('payments.ledger.cancel.done'), 'success')
          await refresh()
        }}
      />
      <ReasonDialog
        open={reversing !== null}
        onOpenChange={(open) => {
          if (!open) setReversing(null)
        }}
        title={t('payments.ledger.reverse.title')}
        help={t('payments.ledger.reverse.help', {
          amount: reversing ? formatMoney(reversing.amount, locale) : '',
          date: reversing?.paidOn ?? '',
        })}
        confirmLabel={t('payments.ledger.reverse.confirm')}
        errorFallback={t('payments.ledger.reverse.error')}
        testId="reverse-payment"
        onRefresh={refresh}
        onSubmit={async (reason) => {
          if (!reversing) return
          await withScopedApiRequestHeaders(lockHeader(), () =>
            apiCallOrThrow(
              `/api/payments/payments/${encodeURIComponent(reversing.id)}/reverse`,
              { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) },
              { errorMessage: t('payments.ledger.reverse.error') },
            ),
          )
          flash(t('payments.ledger.reverse.done'), 'success')
          await refresh()
        }}
      />
    </div>
  )
}
