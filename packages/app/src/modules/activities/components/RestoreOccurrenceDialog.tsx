'use client'
// Restoring a cancelled session (REQ-A05 of the groups and activities parity spec, club spec glossary *Session*;
// #268): the club administrator gives a reason of 3–500 characters and the session is planned again. The request sends
// the session's lock token; a stale token surfaces the conflict; a session that is no longer cancelled or has ended
// meanwhile closes the dialog and refreshes the record; a place or coach taken meanwhile shows the conflict list.
// The same dialog reopens a done session (`action="reopen"`, foundation II AC-G02, #588): the administrator's reason,
// the session's lock token, and a session that is no longer done closes the dialog.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { CANCEL_REASON_MAX_LENGTH, isCancelReasonValid } from '../lib/occurrence-list'
import { ConflictList } from './ConflictList'
import { errorMessage, scheduleConflictsOf, type ScheduleConflict } from './client-helpers'
import { DialogContent } from '@/components/ui/dialog'

export type RestorableOccurrence = { id: string; updatedAt: string | null }

export type ReasonedOccurrenceAction = 'restore' | 'reopen'

/** The texts, the endpoint and the codes that close the dialog, per action (literal keys for the catalog checks). */
const ACTIONS = {
  restore: {
    path: 'restore',
    closingCodes: new Set(['occurrence_not_cancelled', 'occurrence_already_ended']),
    title: 'activities.occurrences.restore.title',
    help: 'activities.occurrences.restore.help',
    reason: 'activities.occurrences.restore.reason',
    reasonRequired: 'activities.occurrences.restore.reasonRequired',
    confirm: 'activities.occurrences.restore.confirm',
    error: 'activities.occurrences.errors.restore',
    done: 'activities.occurrences.flash.restored',
  },
  reopen: {
    path: 'reopen',
    closingCodes: new Set(['occurrence_not_done']),
    title: 'activities.occurrences.reopen.title',
    help: 'activities.occurrences.reopen.help',
    reason: 'activities.occurrences.reopen.reason',
    reasonRequired: 'activities.occurrences.reopen.reasonRequired',
    confirm: 'activities.occurrences.reopen.confirm',
    error: 'activities.occurrences.errors.reopen',
    done: 'activities.occurrences.flash.reopened',
  },
} as const

export function RestoreOccurrenceDialog({
  action = 'restore',
  occurrence,
  open,
  onOpenChange,
  onDone,
}: {
  action?: ReasonedOccurrenceAction
  occurrence: RestorableOccurrence
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const texts = ACTIONS[action]
  const reasonId = React.useId()
  const problemId = React.useId()
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [reasonInvalid, setReasonInvalid] = React.useState(false)
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)

  const submit = async () => {
    // The reason follows the cancellation's rule: at least 3 characters once trimmed.
    if (!isCancelReasonValid(reason)) {
      setReasonInvalid(true)
      setProblem(t(texts.reasonRequired))
      return
    }
    setPending(true)
    setProblem(null)
    setReasonInvalid(false)
    setConflicts(null)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(occurrence.updatedAt), () =>
        apiCallOrThrow(
          `/api/activities/occurrences/${encodeURIComponent(occurrence.id)}/${texts.path}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reason: reason.trim() }),
          },
          { errorMessage: t(texts.error) },
        ),
      )
      flash(t(texts.done), 'success')
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
      } else if (texts.closingCodes.has(errorCodeOf(error) ?? '')) {
        flash(errorMessage(error, t(texts.error)), 'error')
        onOpenChange(false)
        await onDone()
      } else {
        setProblem(errorMessage(error, t(texts.error)))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('activities.common.close')}
        data-testid={`occurrence-${action}-dialog`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(texts.title)}</DialogTitle>
          <DialogDescription>{t(texts.help)}</DialogDescription>
        </DialogHeader>
        {conflicts ? <ConflictList conflicts={conflicts} /> : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor={reasonId}>{t(texts.reason)}</Label>
          <Textarea
            id={reasonId}
            data-testid={`occurrence-${action}-reason`}
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
              data-testid={`occurrence-${action}-problem`}
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
            data-testid={`occurrence-${action}-confirm`}
            disabled={pending}
            onClick={() => {
              void submit()
            }}
          >
            {t(texts.confirm)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
