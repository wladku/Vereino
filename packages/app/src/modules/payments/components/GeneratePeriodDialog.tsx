'use client'
// The "Generate period" dialog of B-21 (UX concept README B-21, flow F-07; payments spec REQ-011; issue #108): a month
// (`YYYY-MM`, no earlier than 12 months back), one request, and the summary "Created X, skipped Y (already existed),
// without payer Z". A generation already running answers 409 and the dialog says so; a month out of range answers 422.
import * as React from 'react'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
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
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { isBillingPeriod } from '../lib/payments-rules'
import { errorCode, errorMessage, localMonth, type GenerationSummary } from './client-helpers'

export function GeneratePeriodDialog({
  open,
  onOpenChange,
  onGenerated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated: (summary: GenerationSummary) => Promise<void>
}) {
  const t = useT()
  const periodId = React.useId()
  const problemId = React.useId()
  const [period, setPeriod] = React.useState(localMonth)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  const submit = async () => {
    if (!isBillingPeriod(period)) {
      setProblem(t('payments.charges.generate.periodInvalid'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const call = await apiCallOrThrow<GenerationSummary>(
        '/api/payments/charges/generate',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ period }),
        },
        { errorMessage: t('payments.charges.generate.error') },
      )
      onOpenChange(false)
      if (call.result) await onGenerated(call.result)
    } catch (error: unknown) {
      setProblem(
        errorCode(error) === 'generation_in_progress'
          ? t('payments.errors.generation_in_progress')
          : errorMessage(error, t('payments.charges.generate.error')),
      )
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
          <DialogTitle>{t('payments.charges.generate.title')}</DialogTitle>
          <DialogDescription>{t('payments.charges.generate.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={periodId}>{t('payments.charges.generate.period')}</Label>
          <Input
            id={periodId}
            type="month"
            data-testid="generate-period-input"
            required
            aria-required
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? problemId : undefined}
            value={period}
            disabled={pending}
            onChange={(event) => {
              setPeriod(event.target.value)
              setProblem(null)
            }}
          />
          {problem ? (
            <p id={problemId} className="text-destructive text-sm" role="alert" data-testid="generate-period-problem">
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
            data-testid="generate-period-confirm"
            disabled={pending}
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('payments.charges.generate.pending') : t('payments.charges.generate.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
