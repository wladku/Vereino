'use client'
// "Running the session" on `/club/occurrences/[id]` (README M-04, flow F-05; club spec REQ-007, REQ-009; E06-S15 #97):
// the coach of the session's group, or its assigned coach, sees the declaration summary and a "Needs a coach" marker,
// opens the attendance list (M-05) and cancels a planned session from the phone with a reason of 3–200 characters.
// The cancellation sends the session's lock token; the toast names how many people were told (in the app and by
// e-mail, J-003). Authorization stays on the routes: the block renders only after `as=coach` answered the session.
import * as React from 'react'
import Link from 'next/link'
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
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CANCEL_REASON_LIMITS, cancelReasonProblem, needsCoach } from '../../lib/activities-rules'
import { errorCode } from '../client-helpers'
import { attendanceHref, cancelSession, errorText, summaryLine, type CalendarEntry } from './club-client'

function CancelSessionDialog({
  entry,
  open,
  onOpenChange,
  onDone,
}: {
  entry: CalendarEntry
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (message: string) => Promise<void>
}) {
  const t = useT()
  const reasonId = React.useId()
  const problemId = React.useId()
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const { occurrence } = entry

  const submit = async () => {
    const invalid = cancelReasonProblem(reason)
    if (invalid) {
      setProblem(t(`activities.club.cancel.${invalid === 'too_short' ? 'tooShort' : 'tooLong'}`, CANCEL_REASON_LIMITS))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const notified = await cancelSession(
        occurrence.id,
        reason.trim(),
        t('activities.occurrences.errors.cancel'),
        occurrence.updatedAt,
      )
      setReason('')
      onOpenChange(false)
      await onDone(t('activities.club.cancel.done', { count: notified }))
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone('') })) {
        onOpenChange(false)
      } else if (errorCode(error) === 'invalid_transition') {
        flash(errorText(error, t('activities.occurrences.errors.cancel')), 'error')
        onOpenChange(false)
        await onDone('')
      } else {
        setProblem(errorText(error, t('activities.occurrences.errors.cancel')))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeAriaLabel={t('activities.common.close')}>
        <DialogHeader>
          <DialogTitle>{t('activities.occurrences.cancel.title')}</DialogTitle>
          <DialogDescription>{t('activities.club.cancel.warning')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={reasonId}>{t('activities.occurrences.cancel.reason')}</Label>
          <Textarea
            id={reasonId}
            data-testid="club-session-cancel-reason"
            required
            aria-required
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? problemId : undefined}
            maxLength={CANCEL_REASON_LIMITS.max}
            rows={3}
            value={reason}
            disabled={pending}
            onChange={(event) => {
              setReason(event.target.value)
            }}
          />
          <p className="text-muted-foreground text-xs">{t('activities.club.cancel.limits', CANCEL_REASON_LIMITS)}</p>
          {problem ? (
            <p
              id={problemId}
              className="text-destructive text-sm"
              role="alert"
              data-testid="club-session-cancel-problem"
            >
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
              onOpenChange(false)
            }}
          >
            {t('activities.common.back')}
          </Button>
          <Button
            type="button"
            variant="destructive-solid"
            className="min-h-11"
            data-testid="club-session-cancel-confirm"
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

export function CoachSessionBlock({
  entry,
  onCancelled,
}: {
  entry: CalendarEntry
  onCancelled: (message: string) => Promise<void>
}) {
  const t = useT()
  const [cancelling, setCancelling] = React.useState(false)
  const { occurrence } = entry
  return (
    <section
      aria-labelledby="club-session-coach"
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      data-testid="club-session-coach"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="club-session-coach" className="text-lg font-semibold">
          {t('activities.club.session.running')}
        </h2>
        {needsCoach(occurrence) ? (
          <span data-testid="club-session-needs-coach">
            <StatusBadge variant="warning">{t('activities.club.session.needsCoach')}</StatusBadge>
          </span>
        ) : null}
      </div>
      {entry.summary ? (
        <p className="text-sm" data-testid="club-session-summary">
          {summaryLine(t, entry.summary)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {occurrence.status !== 'cancelled' ? (
          <Button asChild className="min-h-11">
            <Link href={attendanceHref(occurrence.id)} data-testid="club-session-attendance">
              {t('activities.club.session.attendanceList')}
            </Link>
          </Button>
        ) : null}
        {occurrence.status === 'planned' ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            data-testid="club-session-cancel"
            onClick={() => {
              setCancelling(true)
            }}
          >
            {t('activities.club.session.cancel')}
          </Button>
        ) : null}
      </div>
      <CancelSessionDialog entry={entry} open={cancelling} onOpenChange={setCancelling} onDone={onCancelled} />
    </section>
  )
}
