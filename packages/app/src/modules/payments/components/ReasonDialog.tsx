'use client'
// A confirmation dialog with a required reason (B-22, issue #109): "Cancel charge" and "Reverse payment". The reason
// is required (the API refuses an empty one too), the caller sends the charge's lock token, a stale token surfaces
// the platform conflict and refreshes the record, and a coded refusal (409) is shown in the dialog.
import * as React from 'react'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MAX_REASON_LENGTH } from '../lib/charge-ledger'
import { errorMessage } from './client-helpers'

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  help,
  confirmLabel,
  errorFallback,
  testId,
  onSubmit,
  onRefresh,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  help: string
  confirmLabel: string
  errorFallback: string
  testId: string
  onSubmit: (reason: string) => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const t = useT()
  const reasonId = React.useId()
  const problemId = React.useId()
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [reasonInvalid, setReasonInvalid] = React.useState(false)

  const submit = async () => {
    if (!reason.trim()) {
      setReasonInvalid(true)
      setProblem(t('payments.ledger.reasonRequired'))
      return
    }
    setPending(true)
    setProblem(null)
    setReasonInvalid(false)
    try {
      await onSubmit(reason.trim())
      setReason('')
      onOpenChange(false)
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onRefresh() })) onOpenChange(false)
      else setProblem(errorMessage(error, errorFallback))
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{help}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={reasonId}>{t('payments.ledger.reason')}</Label>
          <Textarea
            id={reasonId}
            data-testid={`${testId}-reason`}
            required
            aria-required
            aria-invalid={reasonInvalid ? true : undefined}
            aria-describedby={problem ? problemId : undefined}
            maxLength={MAX_REASON_LENGTH}
            rows={3}
            value={reason}
            disabled={pending}
            onChange={(event) => {
              setReason(event.target.value)
              if (reasonInvalid && event.target.value.trim()) {
                setReasonInvalid(false)
                setProblem(null)
              }
            }}
          />
          {problem ? (
            <p id={problemId} className="text-destructive text-sm" role="alert" data-testid={`${testId}-problem`}>
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
            data-testid={`${testId}-confirm`}
            disabled={pending}
            onClick={() => {
              void submit()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
