'use client'
// "Assign payer" of B-22 (payments parity spec REQ-C06, J-C05 steps 1–2; #295): a charge without a payer gets one of
// `payerOptions` — the debtor's active guardians, then the debtor when adult. With no option the dialog says so and
// links to the debtor's guardianship tab, where a guardian is added or marked as primary payer (that assigns the payer
// by itself). The request sends the charge's lock token; a stale token surfaces the platform conflict and refreshes
// the record, and a coded refusal (409 already set, 422 not eligible) shows in the dialog.
import * as React from 'react'
import Link from 'next/link'
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
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorMessage, personGuardianshipHref, personName, type ChargeDetail } from './client-helpers'

export function AssignPayerDialog({
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
  const ids = { legend: React.useId(), problem: React.useId() }
  const options = charge.payerOptions
  const [payerId, setPayerId] = React.useState(options.length === 1 ? options[0].id : '')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  const submit = async () => {
    if (!payerId) {
      setProblem(t('payments.assignPayer.required'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(charge.updatedAt), () =>
        apiCallOrThrow(
          `/api/payments/charges/${encodeURIComponent(charge.id)}/payer`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ payerPersonId: payerId }),
          },
          { errorMessage: t('payments.assignPayer.error') },
        ),
      )
      flash(t('payments.assignPayer.done'), 'success')
      onOpenChange(false)
      await onDone()
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) onOpenChange(false)
      else setProblem(errorMessage(error, t('payments.assignPayer.error')))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('payments.common.close')}
        data-testid="assign-payer-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('payments.assignPayer.title')}</DialogTitle>
          <DialogDescription>
            {t('payments.assignPayer.help', { person: personName(charge.person) || '—' })}
          </DialogDescription>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-muted-foreground text-sm" data-testid="assign-payer-empty">
            {t('payments.assignPayer.empty')}
          </p>
        ) : (
          <fieldset className="flex flex-col gap-2" aria-describedby={problem ? ids.problem : undefined}>
            <legend id={ids.legend} className="mb-1 text-sm font-medium">
              {t('payments.assignPayer.label')}
            </legend>
            {options.map((option) => (
              <label
                key={option.id}
                className="hover:bg-muted flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm"
                data-testid="assign-payer-option"
              >
                <input
                  type="radio"
                  name="payer"
                  value={option.id}
                  checked={payerId === option.id}
                  disabled={pending}
                  onChange={() => {
                    setPayerId(option.id)
                  }}
                />
                <span>
                  {personName(option)}
                  {option.id === charge.personId ? (
                    <span className="text-muted-foreground"> · {t('payments.assignPayer.self')}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {charge.personId ? (
          <Link
            href={personGuardianshipHref(charge.personId)}
            className="text-sm underline underline-offset-2"
            data-testid="assign-payer-guardianship"
          >
            {t('payments.assignPayer.guardianshipLink')}
          </Link>
        ) : null}
        {problem ? (
          <p id={ids.problem} className="text-destructive text-sm" role="alert" data-testid="assign-payer-problem">
            {problem}
          </p>
        ) : null}
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
          {options.length > 0 ? (
            <Button
              type="button"
              data-testid="assign-payer-confirm"
              disabled={pending}
              onClick={() => {
                void submit()
              }}
            >
              {t('payments.assignPayer.confirm')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
