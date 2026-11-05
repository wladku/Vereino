'use client'
// The session cancellation dialog (club spec glossary *Session cancellation*, REQ-009; E06-S12 #94), shared by the
// session record and the "Cancel" row action of the sessions list: a reason of at least 3 characters is required, the
// request sends the session's lock token, a stale token surfaces the conflict, and a session that was cancelled or
// done meanwhile (409 `invalid_transition`) closes the dialog and refreshes the caller.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
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
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CANCEL_REASON_MAX_LENGTH, isCancelReasonValid } from '../lib/occurrence-list'
import { errorCode, errorMessage } from './client-helpers'

export type CancellableOccurrence = { id: string; updatedAt: string | null }

export function CancelOccurrenceDialog({
  occurrence,
  open,
  onOpenChange,
  onDone,
}: {
  occurrence: CancellableOccurrence
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const reasonId = React.useId()
  const problemId = React.useId()
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [reasonInvalid, setReasonInvalid] = React.useState(false)

  const submit = async () => {
    if (!isCancelReasonValid(reason)) {
      setReasonInvalid(true)
      setProblem(t('activities.occurrences.cancel.reasonRequired'))
      return
    }
    setPending(true)
    setProblem(null)
    setReasonInvalid(false)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(occurrence.updatedAt), () =>
        apiCallOrThrow(
          `/api/activities/occurrences/${encodeURIComponent(occurrence.id)}/cancel`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reason: reason.trim() }),
          },
          { errorMessage: t('activities.occurrences.errors.cancel') },
        ),
      )
      flash(t('activities.occurrences.flash.cancelled'), 'success')
      setReason('')
      onOpenChange(false)
      await onDone()
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) {
        onOpenChange(false)
      } else if (errorCode(error) === 'invalid_transition') {
        flash(errorMessage(error, t('activities.occurrences.errors.cancel')), 'error')
        onOpenChange(false)
        await onDone()
      } else {
        setProblem(errorMessage(error, t('activities.occurrences.errors.cancel')))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('activities.common.close')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('activities.occurrences.cancel.title')}</DialogTitle>
          <DialogDescription>{t('activities.occurrences.cancel.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={reasonId}>{t('activities.occurrences.cancel.reason')}</Label>
          <Textarea
            id={reasonId}
            data-testid="occurrence-cancel-reason"
            required
            aria-required
            aria-invalid={reasonInvalid ? true : undefined}
            aria-describedby={problem ? problemId : undefined}
            maxLength={CANCEL_REASON_MAX_LENGTH}
            rows={3}
            value={reason}
            disabled={pending}
            onChange={(event) => {
              setReason(event.target.value)
              if (reasonInvalid && isCancelReasonValid(event.target.value)) {
                setReasonInvalid(false)
                setProblem(null)
              }
            }}
          />
          {problem ? (
            <p id={problemId} className="text-destructive text-sm" role="alert" data-testid="occurrence-cancel-problem">
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
            {t('activities.common.back')}
          </Button>
          <Button
            type="button"
            variant="destructive-solid"
            data-testid="occurrence-cancel-confirm"
            disabled={pending}
            onClick={() => {
              void submit()
            }}
          >
            {t('activities.occurrences.cancel.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
