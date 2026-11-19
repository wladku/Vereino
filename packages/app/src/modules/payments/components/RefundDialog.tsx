'use client'
// "Refund" of an online payment on B-22 (payments parity REQ-C08, DD-C10; J-C05 step 4; issue #296), modelled on
// `ReasonDialog`: the amount (proposed: what is still refundable) and a required reason, sent to the unchanged
// `POST /api/payments/payments/{id}/refund` with the charge's lock token. One operation id per opening, so a retry
// returns the same refund instead of a second one. A refund above the refundable part (422) marks the amount field; a
// gateway refusal (502) books nothing, keeps the dialog open with the message and refreshes the record, whose lock
// token the command renewed before calling the gateway. The caller mounts it only while it is open.
import * as React from 'react'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
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
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MAX_REASON_LENGTH } from '../lib/charge-ledger'
import { errorCode, errorMessage, formatMoney, fromGrosz, toGrosz, type PaymentRow } from './client-helpers'

type Field = 'amount' | 'reason'

export function RefundDialog({
  payment,
  lockToken,
  open,
  onOpenChange,
  onDone,
}: {
  payment: PaymentRow
  /** The charge's current lock token (`updatedAt`); read at every attempt, so a refreshed record is used. */
  lockToken: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const locale = useLocale()
  const ids = { amount: React.useId(), reason: React.useId(), problem: React.useId() }
  const [operationId] = React.useState(() => crypto.randomUUID())
  const [amount, setAmount] = React.useState(() => fromGrosz(payment.refundable))
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [invalid, setInvalid] = React.useState<Field | null>(null)

  const submit = async () => {
    const grosz = toGrosz(amount)
    if (grosz === null || grosz <= 0) {
      setInvalid('amount')
      setProblem(t('payments.ledger.refund.amountInvalid'))
      return
    }
    if (!reason.trim()) {
      setInvalid('reason')
      setProblem(t('payments.ledger.reasonRequired'))
      return
    }
    setPending(true)
    setProblem(null)
    setInvalid(null)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
        apiCallOrThrow(
          `/api/payments/payments/${encodeURIComponent(payment.id)}/refund`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ amount: grosz, reason: reason.trim(), operationId }),
          },
          { errorMessage: t('payments.ledger.refund.error') },
        ),
      )
      flash(t('payments.ledger.refund.done', { amount: formatMoney(grosz, locale) }), 'success')
      onOpenChange(false)
      await onDone()
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) {
        onOpenChange(false)
        return
      }
      const code = errorCode(error)
      if (code === 'refund_exceeds_remaining') {
        setInvalid('amount')
        setProblem(t('payments.ledger.refund.exceeds', { amount: formatMoney(payment.refundable, locale) }))
      } else if (code === 'gateway_unavailable') {
        // Nothing was booked, but the command renewed the charge's lock token: refresh it for the next attempt.
        setProblem(t('payments.ledger.refund.gatewayRefused'))
        await onDone()
      } else {
        setProblem(errorMessage(error, t('payments.ledger.refund.error')))
      }
    } finally {
      setPending(false)
    }
  }

  const describedBy = (field: Field) => (invalid === field && problem ? ids.problem : undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('payments.common.close')}
        data-testid="refund-payment-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('payments.ledger.refund.title')}</DialogTitle>
          <DialogDescription>
            {t('payments.ledger.refund.help', {
              amount: formatMoney(payment.amount, locale),
              date: payment.paidOn,
              refundable: formatMoney(payment.refundable, locale),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.amount}>{t('payments.ledger.refund.amount')}</Label>
            <Input
              id={ids.amount}
              inputMode="decimal"
              data-testid="refund-payment-amount"
              required
              aria-required
              aria-invalid={invalid === 'amount' ? true : undefined}
              aria-describedby={describedBy('amount')}
              value={amount}
              disabled={pending}
              onChange={(event) => {
                setAmount(event.target.value)
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.reason}>{t('payments.ledger.reason')}</Label>
            <Textarea
              id={ids.reason}
              data-testid="refund-payment-reason"
              required
              aria-required
              aria-invalid={invalid === 'reason' ? true : undefined}
              aria-describedby={describedBy('reason')}
              maxLength={MAX_REASON_LENGTH}
              rows={3}
              value={reason}
              disabled={pending}
              onChange={(event) => {
                setReason(event.target.value)
              }}
            />
          </div>
          {problem ? (
            <p id={ids.problem} className="text-destructive text-sm" role="alert" data-testid="refund-payment-problem">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('payments.common.back')}
          </Button>
          <Button
            type="button"
            variant="destructive-solid"
            data-testid="refund-payment-confirm"
            disabled={pending}
            onClick={() => {
              void submit()
            }}
          >
            {t('payments.ledger.refund.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
