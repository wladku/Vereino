'use client'
// "Report absence" for the session's assigned coach (README M-04, M-05, flow F-03 path A; club spec glossary
// *Substitution*, REQ-008; E06-S13 #95): a button shown only to the assigned coach of a planned session that has not
// started, and its dialog with an optional reason of up to 200 characters. The request sends the session's lock token;
// on success the caller announces "Absence reported — the coordinator has been notified" and refreshes, so the session
// shows "Needs a coach". A stale token surfaces the shared conflict bar; a session that started or changed meanwhile
// closes the dialog with the server's message. Authorization stays on the route (the assigned coach only).
import * as React from 'react'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
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
import { canReportAbsence, SUBSTITUTION_REASON_MAX } from '../../lib/substitutions'
import { errorText, reportAbsence, type CalendarOccurrence } from './club-client'

export function ReportAbsence({
  occurrence,
  selfPersonId,
  label,
  onDone,
}: {
  occurrence: CalendarOccurrence
  selfPersonId: string | null
  /** "{activity}, {date} {time}" for the dialog's text. */
  label: string
  /** Called with the success message (empty after a refusal that only needs a refresh). */
  onDone: (message: string) => Promise<void>
}) {
  const t = useT()
  const reasonId = React.useId()
  const problemId = React.useId()
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  if (!canReportAbsence(occurrence, selfPersonId, new Date())) return null

  const close = (next: boolean) => {
    // A dialog opened again starts empty, without the previous attempt's message.
    if (!next) {
      setReason('')
      setProblem(null)
    }
    setOpen(next)
  }

  const submit = async () => {
    setPending(true)
    setProblem(null)
    try {
      await reportAbsence(occurrence.id, reason, t('activities.substitutions.errors.absence'), occurrence.updatedAt)
      close(false)
      await onDone(t('activities.substitutions.absence.done'))
    } catch (error: unknown) {
      const code = errorCodeOf(error)
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone('') })) {
        close(false)
      } else if (code === 'absence_after_start' || code === 'occurrence_not_planned' || code === 'scope_denied') {
        flash(errorText(error, t('activities.substitutions.errors.absence')), 'error')
        close(false)
        await onDone('')
      } else {
        setProblem(errorText(error, t('activities.substitutions.errors.absence')))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        data-testid="club-session-report-absence"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('activities.substitutions.absence.action')}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent closeAriaLabel={t('activities.common.close')} data-testid="club-absence-dialog">
          <DialogHeader>
            <DialogTitle>{t('activities.substitutions.absence.title')}</DialogTitle>
            <DialogDescription>{t('activities.substitutions.absence.intro', { session: label })}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>{t('activities.substitutions.reason')}</Label>
            <Textarea
              id={reasonId}
              data-testid="club-absence-reason"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? problemId : undefined}
              maxLength={SUBSTITUTION_REASON_MAX}
              rows={3}
              value={reason}
              disabled={pending}
              onChange={(event) => {
                setReason(event.target.value)
              }}
            />
            <p className="text-muted-foreground text-xs">
              {t('activities.substitutions.absence.limit', { max: SUBSTITUTION_REASON_MAX })}
            </p>
            {problem ? (
              <p id={problemId} className="text-destructive text-sm" role="alert" data-testid="club-absence-problem">
                {problem}
              </p>
            ) : null}
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => {
                close(false)
              }}
            >
              {t('activities.common.back')}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              data-testid="club-absence-confirm"
              disabled={pending}
              onClick={() => {
                void submit()
              }}
            >
              {t('activities.substitutions.absence.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
