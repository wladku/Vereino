'use client'
// "Handovers to confirm" (payments spec REQ-033a, DD-31a, J-010a; D-042, #791): the pending cash handovers the
// collectors sent, oldest first — who sent it, the `RG` number, the receipts with their payers and the total — with
// "Confirm" (the whole handover; no partial acceptance) and "Reject", which asks for the difference before it is sent.
// Shared by the phone page M-18a (`/club/cash-handovers`) and B-33 "Cash to settle" in the panel. A coded refusal (409
// `cash_handover_not_pending`: someone decided it first) is shown on the card and the list is read again.
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorMessage, formatMoney, personName, type Translate } from '../client-helpers'
import { MAX_REJECTION_REASON } from '../../lib/cash-handovers'
import { CASH_CUSTODY_QUERY_KEY, decideHandover, usePendingHandovers, type HandoverRow } from './cash-custody-client'

function PendingCard({
  handover,
  t,
  locale,
  onDecided,
}: {
  handover: HandoverRow
  t: Translate
  locale: string
  onDecided: () => Promise<void>
}) {
  const reasonId = React.useId()
  const problemId = React.useId()
  const [rejecting, setRejecting] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  const decide = async (decision: { kind: 'confirm' } | { kind: 'reject'; reason: string }) => {
    setPending(true)
    setProblem(null)
    try {
      const decided = await decideHandover(handover.id, decision, t('payments.cashHandovers.errors.decide'))
      flash(
        t(decision.kind === 'confirm' ? 'payments.cashHandovers.confirmed' : 'payments.cashHandovers.rejected', {
          number: decided.number,
        }),
        'success',
      )
      await onDecided()
    } catch (error: unknown) {
      setProblem(errorMessage(error, t('payments.cashHandovers.errors.decide')))
      await onDecided()
    } finally {
      setPending(false)
    }
  }

  const submitReject = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (!reason.trim()) {
      setProblem(t('payments.cashHandovers.reasonRequired'))
      return
    }
    await decide({ kind: 'reject', reason: reason.trim() })
  }

  return (
    <li className="bg-card flex flex-col gap-3 rounded-md border p-4" data-testid="pending-handover">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold" data-testid="pending-handover-collector">
          {personName(handover.collector) || t('payments.cashCustody.unknownPerson')}
        </span>
        <span className="text-lg font-semibold tabular-nums" data-testid="pending-handover-amount">
          {formatMoney(handover.amount, locale)}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        <span className="font-medium" data-testid="pending-handover-number">
          {handover.number}
        </span>
        {handover.sentAt ? ` · ${new Date(handover.sentAt).toLocaleString(locale)}` : ''}
      </p>
      <ul className="flex flex-col gap-0.5 text-sm" aria-label={t('payments.cashHandovers.receipts')}>
        {handover.payments.map((payment) => (
          <li key={payment.paymentId} className="flex flex-wrap justify-between gap-x-3">
            <span>
              <span className="font-medium">{payment.receiptNumber}</span>
              {payment.payer ? <span className="text-muted-foreground"> · {personName(payment.payer)}</span> : null}
            </span>
            <span className="tabular-nums">{formatMoney(payment.amount, locale)}</span>
          </li>
        ))}
      </ul>
      {rejecting ? (
        <form className="flex flex-col gap-2" onSubmit={(event) => void submitReject(event)}>
          <Label htmlFor={reasonId}>{t('payments.cashHandovers.reason')}</Label>
          <Textarea
            id={reasonId}
            value={reason}
            maxLength={MAX_REJECTION_REASON}
            disabled={pending}
            aria-invalid={problem !== null && !reason.trim() ? true : undefined}
            aria-describedby={problem ? problemId : undefined}
            data-testid="pending-handover-reason"
            onChange={(event) => {
              setReason(event.target.value)
            }}
          />
          <p className="text-muted-foreground text-sm">{t('payments.cashHandovers.reasonHelp')}</p>
          {problem ? (
            <p id={problemId} className="text-destructive text-sm" role="alert" data-testid="pending-handover-problem">
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              data-testid="pending-handover-reject-send"
            >
              {t('payments.cashHandovers.rejectSend')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => {
                setRejecting(false)
                setProblem(null)
              }}
            >
              {t('payments.common.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="pending-handover-problem">
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={pending}
              data-testid="pending-handover-confirm"
              onClick={() => void decide({ kind: 'confirm' })}
            >
              {t('payments.cashHandovers.confirm')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              data-testid="pending-handover-reject"
              onClick={() => {
                setRejecting(true)
                setProblem(null)
              }}
            >
              {t('payments.cashHandovers.reject')}
            </Button>
          </div>
        </>
      )}
    </li>
  )
}

/** The pending handovers with their decisions; `emptyText` null hides the list when nothing waits (B-33). */
export function PendingHandovers({ headingLevel, emptyText }: { headingLevel: 1 | 2; emptyText: string | null }) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const query = usePendingHandovers()
  const refresh = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: [CASH_CUSTODY_QUERY_KEY] }),
    [queryClient],
  )
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  const items = query.data?.items ?? []
  if (query.data && items.length === 0 && emptyText === null) return null
  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="pending-handovers-heading"
      data-testid="pending-handovers"
    >
      <div className="flex flex-col gap-1">
        <Heading
          id="pending-handovers-heading"
          className={headingLevel === 1 ? 'text-xl font-semibold' : 'text-lg font-semibold'}
        >
          {t('payments.cashHandovers.title')}
        </Heading>
        <p className="text-muted-foreground text-sm">{t('payments.cashHandovers.help')}</p>
      </div>
      {query.isLoading ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t('payments.cashHandovers.loading')}
        </p>
      ) : query.error ? (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-destructive text-sm">{t('payments.cashHandovers.errors.load')}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('payments.common.retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm" data-testid="pending-handovers-empty">
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((handover) => (
            <PendingCard key={handover.id} handover={handover} t={t} locale={locale} onDecided={refresh} />
          ))}
        </ul>
      )}
    </section>
  )
}
