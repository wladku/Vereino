'use client'
// "Hand over cash" on M-18 next to "Cash with you" (payments spec REQ-033a, DD-31a, J-010a; D-042, #791): the coach's
// held cash payments with their KP receipts, all preselected (the coach may untick some), and "Send handover"; the
// pending handover with its `RG` number, "Waiting for confirmation" and "Withdraw"; the latest decided one — a
// rejection with its reason, a confirmation, or cash the club settled without the coach. Payments of a pending
// handover are still the coach's but cannot be sent again. A caller the route refuses (no `payments.groups.collect`)
// and a caller with nothing held and no handover see nothing.
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusTag } from '@vereino/ui'
import { errorMessage, formatMoney, personName, type Translate } from '../../client-helpers'
import {
  COACH_PAYMENTS_QUERY_KEY,
  sendHandover,
  useMyCashHandovers,
  withdrawHandover,
  type HeldCashPayment,
  type MyHandover,
} from './coach-client'

function formatDay(day: string, locale: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' })
}

function SendForm({
  payments,
  t,
  locale,
  onSent,
  onRefresh,
  onCancel,
}: {
  payments: HeldCashPayment[]
  t: Translate
  locale: string
  onSent: () => Promise<void>
  onRefresh: () => Promise<void>
  onCancel: () => void
}) {
  const problemId = React.useId()
  // Every free payment starts selected; the coach unticks what they keep.
  const [deselected, setDeselected] = React.useState<string[]>([])
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const selected = payments.map((payment) => payment.paymentId).filter((id) => !deselected.includes(id))
  const total = payments
    .filter((payment) => selected.includes(payment.paymentId))
    .reduce((sum, payment) => sum + payment.amount, 0)

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (selected.length === 0) {
      setProblem(t('payments.coach.handover.selectOne'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const sent = await sendHandover(selected, t('payments.coach.handover.errors.send'))
      flash(t('payments.coach.handover.sent', { number: sent.number }), 'success')
      await onSent()
    } catch (error: unknown) {
      // A coded refusal (409 `cash_handover_payment_pending`, …) stays in the form; the list is read again.
      setProblem(errorMessage(error, t('payments.coach.handover.errors.send')))
      await onRefresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)} data-testid="coach-handover-form">
      <fieldset className="flex flex-col gap-2" aria-describedby={problem ? problemId : undefined}>
        <legend className="mb-1 text-sm font-medium">{t('payments.coach.handover.payments')}</legend>
        <ul className="flex flex-col gap-1">
          {payments.map((payment) => {
            const id = `coach-handover-${payment.paymentId}`
            return (
              <li
                key={payment.paymentId}
                className="flex min-h-11 items-start gap-3"
                data-testid="coach-handover-payment"
              >
                <Checkbox
                  id={id}
                  className="mt-1"
                  checked={selected.includes(payment.paymentId)}
                  disabled={pending}
                  onCheckedChange={() => {
                    setDeselected((current) =>
                      current.includes(payment.paymentId)
                        ? current.filter((paymentId) => paymentId !== payment.paymentId)
                        : [...current, payment.paymentId],
                    )
                  }}
                />
                <label htmlFor={id} className="flex flex-1 flex-wrap justify-between gap-x-3 text-sm">
                  <span>
                    <span className="font-medium">{payment.receiptNumber}</span>
                    {' · '}
                    {formatDay(payment.paidOn, locale)}
                    {payment.payer ? ` · ${personName(payment.payer)}` : ''}
                    {payment.description ? (
                      <span className="text-muted-foreground block">{payment.description}</span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">{formatMoney(payment.amount, locale)}</span>
                </label>
              </li>
            )
          })}
        </ul>
        <p className="flex justify-between border-t pt-2 text-sm font-medium">
          <span>{t('payments.coach.handover.selectedTotal')}</span>
          <span className="tabular-nums" data-testid="coach-handover-total">
            {formatMoney(total, locale)}
          </span>
        </p>
        {problem ? (
          <p id={problemId} className="text-destructive text-sm" role="alert" data-testid="coach-handover-problem">
            {problem}
          </p>
        ) : null}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" disabled={pending} data-testid="coach-handover-send">
          {t('payments.coach.handover.send')}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={onCancel}>
          {t('payments.common.cancel')}
        </Button>
      </div>
    </form>
  )
}

function PendingHandover({
  handover,
  t,
  locale,
  onDone,
}: {
  handover: MyHandover
  t: Translate
  locale: string
  onDone: () => Promise<void>
}) {
  const [pending, setPending] = React.useState(false)
  const withdraw = async () => {
    setPending(true)
    try {
      await withdrawHandover(handover.id, t('payments.coach.handover.errors.withdraw'))
      flash(t('payments.coach.handover.withdrawn', { number: handover.number }), 'success')
    } catch (error: unknown) {
      flash(errorMessage(error, t('payments.coach.handover.errors.withdraw')), 'error')
    } finally {
      setPending(false)
      await onDone()
    }
  }
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3" data-testid="coach-handover-pending">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium" data-testid="coach-handover-number">
          {handover.number}
        </span>
        <StatusTag status="warning">{t('payments.coach.handover.status.pending')}</StatusTag>
      </div>
      <p className="text-sm">
        {t('payments.coach.handover.summary', {
          amount: formatMoney(handover.amount, locale),
          count: handover.paymentCount,
        })}
      </p>
      <p className="text-muted-foreground text-sm">{handover.receiptNumbers.join(', ')}</p>
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          data-testid="coach-handover-withdraw"
          onClick={() => void withdraw()}
        >
          {t('payments.coach.handover.withdraw')}
        </Button>
      </div>
    </li>
  )
}

const DECIDED_KEYS = {
  confirmed: 'payments.coach.handover.decided.confirmed',
  rejected: 'payments.coach.handover.decided.rejected',
  withdrawn: 'payments.coach.handover.decided.withdrawn',
  settled: 'payments.coach.handover.decided.settled',
} as const

function LatestDecision({ handover, t, locale }: { handover: MyHandover; t: Translate; locale: string }) {
  const kind = handover.status === 'confirmed' && !handover.sentByCollector ? 'settled' : handover.status
  if (kind === 'pending') return null
  const values = {
    number: handover.number,
    amount: formatMoney(handover.amount, locale),
    name: personName(handover.decidedBy),
  }
  return (
    <Alert
      style="light"
      status={kind === 'rejected' ? 'warning' : 'information'}
      data-testid="coach-handover-latest"
      data-status={kind}
    >
      <div className="flex flex-col gap-1">
        <p>{t(DECIDED_KEYS[kind], values)}</p>
        {kind === 'rejected' && handover.rejectionReason ? (
          <p data-testid="coach-handover-reason">
            {t('payments.coach.handover.reason', { reason: handover.rejectionReason })}
          </p>
        ) : null}
      </div>
    </Alert>
  )
}

export function CashHandoverSection() {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const query = useMyCashHandovers()
  const [open, setOpen] = React.useState(false)
  const refresh = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: [COACH_PAYMENTS_QUERY_KEY] }),
    [queryClient],
  )
  const view = query.data
  if (!view) return null
  const free = view.held.filter((payment) => payment.pendingHandoverId === null)
  const pending = view.handovers.filter((handover) => handover.status === 'pending')
  const latest = view.handovers.find((handover) => handover.status !== 'pending') ?? null
  if (view.held.length === 0 && view.handovers.length === 0) return null
  return (
    <section
      className="flex flex-col gap-3 rounded-md border p-4"
      aria-labelledby="coach-handover-heading"
      data-testid="coach-handover"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="coach-handover-heading" className="font-medium">
          {t('payments.coach.handover.title')}
        </h2>
        {free.length > 0 && !open ? (
          <Button
            type="button"
            className="min-h-11"
            data-testid="coach-handover-start"
            onClick={() => {
              setOpen(true)
            }}
          >
            {t('payments.coach.handover.start')}
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">{t('payments.coach.handover.help')}</p>
      {latest ? <LatestDecision handover={latest} t={t} locale={locale} /> : null}
      {pending.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={t('payments.coach.handover.pendingList')}>
          {pending.map((handover) => (
            <PendingHandover key={handover.id} handover={handover} t={t} locale={locale} onDone={refresh} />
          ))}
        </ul>
      ) : null}
      {open && free.length > 0 ? (
        <SendForm
          // A new list after a refresh starts fully selected again.
          key={free.map((payment) => payment.paymentId).join(',')}
          payments={free}
          t={t}
          locale={locale}
          onSent={async () => {
            setOpen(false)
            await refresh()
          }}
          onRefresh={async () => {
            await refresh()
          }}
          onCancel={() => {
            setOpen(false)
          }}
        />
      ) : null}
    </section>
  )
}
