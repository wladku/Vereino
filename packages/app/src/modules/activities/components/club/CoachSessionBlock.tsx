'use client'
// "Running the session" on `/club/occurrences/[id]` (README M-04, flow F-05; club spec REQ-007, REQ-009; E06-S15 #97):
// the coach of the session's group, or its assigned coach, sees the declaration summary and a "Needs a coach" marker,
// opens the attendance list (M-05) and cancels a planned session from the phone with a reason of 3–200 characters.
// The cancellation sends the session's lock token; the toast names how many people were told (in the app and by
// e-mail, J-003). The assigned coach also reports an absence here before the session starts (E06-S13 #95), and a
// substitute sees whom they stand in for. Authorization stays on the routes: the block renders only after `as=coach`
// answered the session. The cancel dialog is shared with the attendance list M-05 (#139); a coach's cancellation also
// tells the section's coordinators, server-side. Where the club setting `coach_may_cancel` is off (#199), the read
// says `mayCancel: false` and "Cancel session" is not offered, so the coach only reports an absence. E10-S07 (#272;
// REQ-A13…REQ-A15): a coach or assistant of the group takes a session without a coach ("Take the session"); "Message
// the group" opens the member composer addressed to the session; a started match or sparring takes its score; the
// substitution history closes the block.
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
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { CANCEL_REASON_LIMITS, cancelReasonProblem, needsCoach } from '../../lib/activities-rules'
import { errorCodeOf } from '@vereino/core'
import { ScoreForm } from '../ScoreForm'
import { ReportAbsence } from './ReportAbsence'
import {
  attendanceHref,
  cancelSession,
  composeForSessionHref,
  errorText,
  sessionEditHref,
  summaryLine,
  takeOverSession,
  type CalendarEntry,
  type SubstitutionHistoryEntry,
} from './club-client'

/** One line of the substitution history: "17.11.2026, 20:14 — Marek N. reported an absence" (M-04). */
function HistoryLine({ entry, timeZone }: { entry: SubstitutionHistoryEntry; timeZone: string }) {
  const t = useT()
  const locale = useLocale()
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone }).format(
    new Date(entry.createdAt),
  )
  const empty = t('activities.common.empty')
  const text =
    entry.kind === 'absence_reported'
      ? t('activities.club.session.history.absence', { name: entry.previousCoachName ?? empty })
      : entry.previousCoachName
        ? t('activities.club.session.history.substitute', {
            next: entry.newCoachName ?? empty,
            prev: entry.previousCoachName,
          })
        : t('activities.club.session.history.assigned', { next: entry.newCoachName ?? empty })
  return (
    <li className="text-sm" data-testid="club-session-history-entry" data-kind={entry.kind}>
      <time dateTime={entry.createdAt} className="text-muted-foreground">
        {when}
      </time>{' '}
      — {text}
    </li>
  )
}

/** The session a cancellation targets: its id and the version the page showed (the lock token). */
export type CancellableSession = { id: string; updatedAt: string }

export function CancelSessionDialog({
  occurrence,
  open,
  onOpenChange,
  onDone,
}: {
  occurrence: CancellableSession
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
      close(false)
      await onDone(t('activities.club.cancel.done', { count: notified }))
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone('') })) {
        close(false)
      } else if (errorCodeOf(error) === 'invalid_transition') {
        flash(errorText(error, t('activities.occurrences.errors.cancel')), 'error')
        close(false)
        await onDone('')
      } else {
        setProblem(errorText(error, t('activities.occurrences.errors.cancel')))
      }
    } finally {
      setPending(false)
    }
  }

  const close = (next: boolean) => {
    // A dialog opened again starts empty, without the previous attempt's message.
    if (!next) {
      setReason('')
      setProblem(null)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
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
              close(false)
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
  selfPersonId,
  absenceLabel,
  onCancelled,
  timeZone,
}: {
  entry: CalendarEntry
  /** The signed-in member's person: "Report absence" is for the session's assigned coach only. */
  selfPersonId: string | null
  /** "{activity}, {date} {time}" for the absence dialog. */
  absenceLabel: string
  /** Called with the success message of a cancellation or an absence (empty when only a refresh is needed). */
  onCancelled: (message: string) => Promise<void>
  /** The club's time zone, for the history's times. */
  timeZone: string
}) {
  const t = useT()
  const [cancelling, setCancelling] = React.useState(false)
  const [takingOver, setTakingOver] = React.useState(false)
  const { occurrence } = entry
  const cancellable = occurrence.status === 'planned' && entry.mayCancel !== false
  const history = entry.substitutions ?? []

  const takeOver = async () => {
    setTakingOver(true)
    try {
      await takeOverSession(occurrence.id, t('activities.club.session.takeOverFailed'))
      await onCancelled(t('activities.club.session.takenOver'))
    } catch (error: unknown) {
      // Someone was faster (409 `occurrence_has_coach`) or the caller is busy then: say so and show the new state.
      flash(errorText(error, t('activities.club.session.takeOverFailed')), 'error')
      await onCancelled('')
    } finally {
      setTakingOver(false)
    }
  }
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
      {occurrence.substituteForName ? (
        <p className="text-muted-foreground text-sm" data-testid="club-session-substitute-for">
          {t('activities.substitutions.forLine', {
            substitute: occurrence.coachName ?? '',
            coach: occurrence.substituteForName,
          })}
        </p>
      ) : null}
      {entry.summary ? (
        <p className="text-sm" data-testid="club-session-summary">
          {summaryLine(t, entry.summary)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {/* REQ-A14 (J-A04 step 4): a coach or assistant of the group takes the session without a coach. */}
        {entry.mayTakeOver === true ? (
          <Button
            type="button"
            className="min-h-11"
            disabled={takingOver}
            data-testid="club-session-take-over"
            onClick={() => {
              void takeOver()
            }}
          >
            {t('activities.club.session.takeOver')}
          </Button>
        ) : null}
        {occurrence.status !== 'cancelled' ? (
          <Button asChild className="min-h-11">
            <Link href={attendanceHref(occurrence.id)} data-testid="club-session-attendance">
              {t('activities.club.session.attendanceList')}
            </Link>
          </Button>
        ) : null}
        {/* REQ-A13: the composer addressed to the session's audience (the group's participants and their guardians). */}
        {occurrence.status !== 'cancelled' ? (
          <Button asChild variant="outline" className="min-h-11">
            <Link href={composeForSessionHref(occurrence.id)} data-testid="club-session-message-group">
              {t('activities.club.session.messageGroup')}
            </Link>
          </Button>
        ) : null}
        {/* DD-A05 (#270): a coach edits the session of their own one-off event; the read says whether they may. */}
        {entry.mayEdit === true && occurrence.status === 'planned' ? (
          <Button asChild variant="outline" className="min-h-11">
            <Link href={sessionEditHref(occurrence.id)} data-testid="club-session-edit">
              {t('activities.club.session.edit')}
            </Link>
          </Button>
        ) : null}
        {cancellable ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            data-testid="club-session-cancel"
            aria-describedby="club-session-cancel-hint"
            onClick={() => {
              setCancelling(true)
            }}
          >
            {t('activities.club.session.cancel')}
          </Button>
        ) : null}
        <ReportAbsence occurrence={occurrence} selfPersonId={selfPersonId} label={absenceLabel} onDone={onCancelled} />
      </div>
      {cancellable ? (
        <p id="club-session-cancel-hint" className="text-muted-foreground text-xs">
          {t('activities.club.session.cancelHint')}
        </p>
      ) : null}
      {/* REQ-A15: the score of a started match or sparring, also after the session is closed. */}
      {entry.mayScore === true ? (
        <section aria-labelledby="club-session-score-title" className="flex flex-col gap-2 border-t pt-3">
          <h3 id="club-session-score-title" className="font-semibold">
            {t('activities.score.title')}
          </h3>
          <ScoreForm
            key={occurrence.updatedAt}
            occurrenceId={occurrence.id}
            updatedAt={occurrence.updatedAt}
            score={occurrence.score ?? null}
            isAway={occurrence.isAway === true}
            onSaved={onCancelled}
          />
        </section>
      ) : null}
      {history.length > 0 ? (
        <section aria-labelledby="club-session-history-title" className="flex flex-col gap-2 border-t pt-3">
          <h3 id="club-session-history-title" className="font-semibold">
            {t('activities.club.session.history.title')}
          </h3>
          <ul className="flex flex-col gap-1" data-testid="club-session-history">
            {history.map((item) => (
              <HistoryLine key={item.id} entry={item} timeZone={timeZone} />
            ))}
          </ul>
        </section>
      ) : null}
      <CancelSessionDialog
        occurrence={occurrence}
        open={cancelling}
        onOpenChange={setCancelling}
        onDone={onCancelled}
      />
    </section>
  )
}
