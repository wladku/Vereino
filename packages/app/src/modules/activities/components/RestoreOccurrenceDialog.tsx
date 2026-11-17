'use client'
// Restoring a cancelled session (REQ-A05 of the groups and activities parity spec, club spec glossary *Session*;
// #268): the club administrator gives a reason of 3–500 characters and the session is planned again. The request sends
// the session's lock token; a stale token surfaces the conflict; a session that is no longer cancelled or has ended
// meanwhile closes the dialog and refreshes the record; a place or coach taken meanwhile shows the conflict list.
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
import { errorCodeOf } from '@vereino/core'
import { CANCEL_REASON_MAX_LENGTH, isCancelReasonValid } from '../lib/occurrence-list'
import { ConflictList } from './ConflictList'
import { errorMessage, scheduleConflictsOf, type ScheduleConflict } from './client-helpers'

export type RestorableOccurrence = { id: string; updatedAt: string | null }

const CLOSING_CODES = new Set(['occurrence_not_cancelled', 'occurrence_already_ended'])

export function RestoreOccurrenceDialog({
  occurrence,
  open,
  onOpenChange,
  onDone,
}: {
  occurrence: RestorableOccurrence
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
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)

  const submit = async () => {
    // The restore reason follows the cancellation's rule: at least 3 characters once trimmed.
    if (!isCancelReasonValid(reason)) {
      setReasonInvalid(true)
      setProblem(t('activities.occurrences.restore.reasonRequired'))
      return
    }
    setPending(true)
    setProblem(null)
    setReasonInvalid(false)
    setConflicts(null)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(occurrence.updatedAt), () =>
        apiCallOrThrow(
          `/api/activities/occurrences/${encodeURIComponent(occurrence.id)}/restore`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reason: reason.trim() }),
          },
          { errorMessage: t('activities.occurrences.errors.restore') },
        ),
      )
      flash(t('activities.occurrences.flash.restored'), 'success')
      setReason('')
      onOpenChange(false)
      await onDone()
    } catch (error: unknown) {
      const found = scheduleConflictsOf(error)
      if (found) {
        setConflicts(found)
        setProblem(errorMessage(error, t('activities.conflicts.title')))
      } else if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) {
        onOpenChange(false)
      } else if (CLOSING_CODES.has(errorCodeOf(error) ?? '')) {
        flash(errorMessage(error, t('activities.occurrences.errors.restore')), 'error')
        onOpenChange(false)
        await onDone()
      } else {
        setProblem(errorMessage(error, t('activities.occurrences.errors.restore')))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('activities.common.close')}
        data-testid="occurrence-restore-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('activities.occurrences.restore.title')}</DialogTitle>
          <DialogDescription>{t('activities.occurrences.restore.help')}</DialogDescription>
        </DialogHeader>
        {conflicts ? <ConflictList conflicts={conflicts} /> : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor={reasonId}>{t('activities.occurrences.restore.reason')}</Label>
          <Textarea
            id={reasonId}
            data-testid="occurrence-restore-reason"
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
            <p
              id={problemId}
              className="text-destructive text-sm"
              role="alert"
              data-testid="occurrence-restore-problem"
            >
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
            data-testid="occurrence-restore-confirm"
            disabled={pending}
            onClick={() => {
              void submit()
            }}
          >
            {t('activities.occurrences.restore.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
