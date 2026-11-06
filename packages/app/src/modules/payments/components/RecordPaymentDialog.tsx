'use client'
// "Record payment" of B-22 (UX concept README B-22; payments spec REQ-012; issue #109): the amount (proposed: what
// remains), the method (cash or transfer), the day the money arrived (today or earlier) and the title or receipt.
// The request sends the charge's lock token; the answer's status picks the toast "Charge paid" or "Recorded — charge
// partially paid". The server's refusals ("The amount exceeds the remaining 50 zł", a future date) show in the dialog.
// The caller mounts it only while it is open, so every opening starts from what remains and today.
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
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MANUAL_PAYMENT_METHODS, MAX_REFERENCE_LENGTH, type ManualPaymentMethod } from '../lib/charge-ledger'
import { errorMessage, fromGrosz, localToday, toGrosz, type ChargeDetail } from './client-helpers'

type RecordResult = { chargeStatus?: string }

export function RecordPaymentDialog({
  charge,
  open,
  onOpenChange,
  onDone,
}: {
  charge: ChargeDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const ids = { amount: React.useId(), date: React.useId(), reference: React.useId(), problem: React.useId() }
  const [amount, setAmount] = React.useState(() => fromGrosz(charge.remaining))
  const [method, setMethod] = React.useState<ManualPaymentMethod>('cash')
  const [paidOn, setPaidOn] = React.useState(localToday)
  const [reference, setReference] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [invalid, setInvalid] = React.useState<'amount' | 'date' | null>(null)

  const submit = async () => {
    const grosz = toGrosz(amount)
    if (grosz === null || grosz <= 0) {
      setInvalid('amount')
      setProblem(t('payments.ledger.record.amountInvalid'))
      return
    }
    if (!paidOn) {
      setInvalid('date')
      setProblem(t('payments.ledger.record.dateRequired'))
      return
    }
    setPending(true)
    setProblem(null)
    setInvalid(null)
    try {
      const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(charge.updatedAt), () =>
        apiCallOrThrow<RecordResult>(
          `/api/payments/charges/${encodeURIComponent(charge.id)}/payments`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ amount: grosz, method, paidOn, reference: reference.trim() || null }),
          },
          { errorMessage: t('payments.ledger.record.error') },
        ),
      )
      flash(
        call.result?.chargeStatus === 'paid'
          ? t('payments.ledger.record.donePaid')
          : t('payments.ledger.record.donePartial'),
        'success',
      )
      setReference('')
      onOpenChange(false)
      await onDone()
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) onOpenChange(false)
      else setProblem(errorMessage(error, t('payments.ledger.record.error')))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('payments.common.close')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('payments.ledger.record.title')}</DialogTitle>
          <DialogDescription>{t('payments.ledger.record.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.amount}>{t('payments.ledger.record.amount')}</Label>
            <Input
              id={ids.amount}
              inputMode="decimal"
              data-testid="record-payment-amount"
              required
              aria-required
              aria-invalid={invalid === 'amount' ? true : undefined}
              aria-describedby={problem ? ids.problem : undefined}
              value={amount}
              disabled={pending}
              onChange={(event) => {
                setAmount(event.target.value)
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium" id={`${ids.amount}-method`}>
              {t('payments.ledger.record.method')}
            </span>
            <SegmentedControl
              value={method}
              aria-labelledby={`${ids.amount}-method`}
              disabled={pending}
              onValueChange={(value: string) => {
                setMethod(value as ManualPaymentMethod)
              }}
            >
              {MANUAL_PAYMENT_METHODS.map((value) => (
                <SegmentedControlItem key={value} value={value} data-testid={`record-payment-method-${value}`}>
                  {t(`payments.ledger.method.${value}`)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.date}>{t('payments.ledger.record.date')}</Label>
            <Input
              id={ids.date}
              type="date"
              data-testid="record-payment-date"
              required
              aria-required
              aria-invalid={invalid === 'date' ? true : undefined}
              max={localToday()}
              value={paidOn}
              disabled={pending}
              onChange={(event) => {
                setPaidOn(event.target.value)
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.reference}>{t('payments.ledger.record.reference')}</Label>
            <Input
              id={ids.reference}
              data-testid="record-payment-reference"
              maxLength={MAX_REFERENCE_LENGTH}
              value={reference}
              disabled={pending}
              onChange={(event) => {
                setReference(event.target.value)
              }}
            />
          </div>
          {problem ? (
            <p id={ids.problem} className="text-destructive text-sm" role="alert" data-testid="record-payment-problem">
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
            data-testid="record-payment-confirm"
            disabled={pending}
            onClick={() => {
              void submit()
            }}
          >
            {t('payments.ledger.record.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
