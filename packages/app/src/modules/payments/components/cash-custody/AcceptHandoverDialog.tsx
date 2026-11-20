'use client'
// "Accept handover" of B-33 (payments spec REQ-033; issue #118): the collector's held cash payments, all selected at
// first, the selected total and "I confirm receipt of the cash". A coded refusal (409 `cash_already_settled`) stays in
// the dialog and refreshes the list; success closes it with the toast naming the `RG` number.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorMessage, formatMoney, personName } from '../client-helpers'
import { acceptHandover, type CustodyCollector } from './cash-custody-client'

export function formatDay(day: string, locale: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' })
}

export function AcceptHandoverDialog({
  collector,
  onOpenChange,
  onAccepted,
}: {
  collector: CustodyCollector | null
  onOpenChange: (open: boolean) => void
  onAccepted: () => Promise<void>
}) {
  const t = useT()
  const locale = useLocale()
  const problemId = React.useId()
  // The parent remounts the dialog per collector (`key`), so every payment starts selected.
  const [deselected, setDeselected] = React.useState<string[]>([])
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  const payments = collector?.payments ?? []
  const selected = payments.map((payment) => payment.paymentId).filter((id) => !deselected.includes(id))
  const total = payments
    .filter((payment) => selected.includes(payment.paymentId))
    .reduce((sum, payment) => sum + payment.amount, 0)

  const submit = async () => {
    if (!collector) return
    if (selected.length === 0) {
      setProblem(t('payments.cashCustody.accept.selectOne'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const handover = await acceptHandover(
        { collectorPersonId: collector.collectorPersonId, paymentIds: selected },
        t('payments.cashCustody.errors.accept'),
      )
      flash(t('payments.cashCustody.accept.done', { number: handover.number }), 'success')
      onOpenChange(false)
      await onAccepted()
    } catch (error: unknown) {
      setProblem(errorMessage(error, t('payments.cashCustody.errors.accept')))
      await onAccepted()
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={collector !== null} onOpenChange={onOpenChange}>
      <DialogContent closeAriaLabel={t('payments.common.close')} data-testid="handover-dialog">
        <DialogHeader>
          <DialogTitle>
            {t('payments.cashCustody.accept.title', { name: personName(collector?.collector) })}
          </DialogTitle>
          <DialogDescription>{t('payments.cashCustody.accept.help')}</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2" aria-describedby={problem ? problemId : undefined}>
          <legend className="sr-only">{t('payments.cashCustody.accept.payments')}</legend>
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {payments.map((payment) => {
              const id = `handover-${payment.paymentId}`
              return (
                <li key={payment.paymentId} className="flex items-start gap-3" data-testid="handover-payment">
                  <Checkbox
                    id={id}
                    className="mt-0.5"
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
            <span>{t('payments.cashCustody.accept.selectedTotal')}</span>
            <span className="tabular-nums" data-testid="handover-total">
              {formatMoney(total, locale)}
            </span>
          </p>
          {problem ? (
            <p id={problemId} className="text-destructive text-sm" role="alert" data-testid="handover-problem">
              {problem}
            </p>
          ) : null}
        </fieldset>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('payments.common.cancel')}
          </Button>
          <Button type="button" disabled={pending} data-testid="handover-confirm" onClick={() => void submit()}>
            {t('payments.cashCustody.accept.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
