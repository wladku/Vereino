'use client'
// `/club/occurrences/[id]/attendance` (club spec UI row `/club/occurrences/[id]/attendance`, glossary *Actual
// attendance*; R11, D-026; AC-007; #33): the coach's list of a session — the summary line per the declaration kind, each
// person with what the declarations say and, once the session started, `present` / `absent` / `late`; "Save" and "Close
// session" (with a confirmation) save the changed marks against the session version. A save by someone else meanwhile
// shows the shared conflict bar and refreshes the list while the coach's selections stay. A coach of another group sees
// "not your session" (403), an unknown session "not found".
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Radio, RadioGroup } from '@open-mercato/ui/primitives/radio'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDayHeading, formatTimeRange } from '@vereino/ui'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import {
  ACTUAL_VALUES,
  ATTENDANCE_LIST_QUERY_KEY,
  CALENDAR_QUERY_KEY,
  CLUB_CALENDAR_HREF,
  errorText,
  saveAttendance,
  summaryLine,
  useAttendanceList,
  type ActualValue,
  type AttendanceList,
  type AttendanceRow,
  type Expectation,
} from './club-client'

/** The badge tone of what the declarations say about a person. */
const EXPECTATION_VARIANT: Record<Expectation, 'neutral' | 'success' | 'warning'> = {
  expected: 'neutral',
  absent: 'warning',
  confirmed: 'success',
  declined: 'warning',
  unanswered: 'neutral',
}

function rowName(row: AttendanceRow, fallback: string): string {
  return [row.firstName, row.lastName].filter(Boolean).join(' ') || fallback
}

/** The marks the coach chose on this page, by person; a person absent from the map shows the saved mark. */
type Selections = Map<string, ActualValue | null>

function AttendanceRowItem({
  row,
  editable,
  selected,
  busy,
  onSelect,
}: {
  row: AttendanceRow
  editable: boolean
  selected: ActualValue | null
  busy: boolean
  onSelect: (personId: string, actual: ActualValue) => void
}) {
  const t = useT()
  const name = rowName(row, t('activities.common.empty'))
  const groupId = `attendance-${row.personId}`
  return (
    <li className="bg-card flex flex-col gap-3 rounded-lg border p-4" data-testid="club-attendance-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold" id={`${groupId}-name`}>
          {name}
        </span>
        <span data-testid="club-attendance-expectation">
          <StatusBadge variant={EXPECTATION_VARIANT[row.expectation]}>
            {t(`activities.club.attendance.expectation.${row.expectation}`)}
          </StatusBadge>
        </span>
      </div>
      {!row.onRoster ? <p className="text-muted-foreground text-sm">{t('activities.club.attendance.guest')}</p> : null}
      {editable ? (
        <RadioGroup
          aria-labelledby={`${groupId}-name`}
          className="flex flex-row flex-wrap gap-2"
          value={selected ?? ''}
          disabled={busy}
          onValueChange={(value) => {
            onSelect(row.personId, value as ActualValue)
          }}
        >
          {ACTUAL_VALUES.map((value) => (
            <label
              key={value}
              htmlFor={`${groupId}-${value}`}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3"
            >
              <Radio id={`${groupId}-${value}`} value={value} data-actual={value} />
              <span className="text-sm">{t(`activities.club.attendance.actual.${value}`)}</span>
            </label>
          ))}
        </RadioGroup>
      ) : row.actual ? (
        <p className="text-sm" data-testid="club-attendance-actual">
          {t(`activities.club.attendance.actual.${row.actual}`)}
        </p>
      ) : null}
      {row.actual && row.markedAsRole ? (
        <p className="text-muted-foreground text-xs" data-testid="club-attendance-marked-by">
          {t('activities.club.attendance.markedBy', {
            name: row.markedByName ?? t('activities.common.empty'),
            role: t(`activities.club.attendance.role.${row.markedAsRole}`),
          })}
        </p>
      ) : null}
    </li>
  )
}

function Attendance({ id }: { id: string }) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const query = useAttendanceList(id)
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [selections, setSelections] = React.useState<Selections>(() => new Map())
  const [busy, setBusy] = React.useState(false)
  const [announcement, setAnnouncement] = React.useState('')

  const list: AttendanceList | null = query.data?.status === 'ok' ? query.data.list : null
  const back = (
    <Link href={CLUB_CALENDAR_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
      {t('activities.club.session.back')}
    </Link>
  )

  if (!query.data && query.isFetching) return <LoadingMessage label={t('activities.club.attendance.loading')} />
  if (!query.data) {
    return (
      <ErrorMessage
        label={t('activities.club.errors.attendance')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  if (!list) {
    return (
      <>
        {back}
        <Alert status="warning" data-testid="club-attendance-missing">
          <p className="max-w-prose">
            {t(
              query.data.status === 'forbidden'
                ? 'activities.club.attendance.forbidden'
                : 'activities.club.attendance.notFound',
            )}
          </p>
        </Alert>
      </>
    )
  }

  const { occurrence } = list
  const editable = list.checkOff === 'open'
  const current = (row: AttendanceRow): ActualValue | null =>
    selections.has(row.personId) ? (selections.get(row.personId) ?? null) : row.actual
  const changed = list.rows
    .filter((row) => selections.has(row.personId) && current(row) !== row.actual)
    .map((row) => ({ personId: row.personId, actual: current(row) }))

  const save = async (complete: boolean) => {
    if (complete) {
      const confirmed = await confirm({
        title: t('activities.club.attendance.confirmClose'),
        text: t('activities.club.attendance.confirmCloseText'),
        confirmText: t('activities.club.attendance.close'),
        cancelText: t('activities.common.cancel'),
      })
      if (!confirmed) return
    }
    setBusy(true)
    try {
      await saveAttendance(
        id,
        { entries: changed, ...(complete ? { complete: true } : {}) },
        t('activities.club.errors.saveAttendance'),
        occurrence.updatedAt,
      )
      // Saved: the list now carries these marks, so the page shows the server's values again.
      setSelections(new Map())
      const message = t(complete ? 'activities.club.flash.sessionClosed' : 'activities.club.flash.attendanceSaved')
      setAnnouncement(message)
      flash(message, 'success')
    } catch (error: unknown) {
      // A save by someone else meanwhile: the shared conflict bar, then the refreshed list with the selections kept.
      if (!surfaceRecordConflict(error, t)) flash(errorText(error, t('activities.club.errors.saveAttendance')), 'error')
    } finally {
      setBusy(false)
      await queryClient.invalidateQueries({ queryKey: [ATTENDANCE_LIST_QUERY_KEY, id] })
      await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
    }
  }

  return (
    <>
      {back}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold" data-testid="club-attendance-title">
          {[occurrence.activityName ?? t('activities.club.session.untitled'), occurrence.groupName]
            .filter(Boolean)
            .join(' · ')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {formatDayHeading(occurrence.occurrenceDate, locale)} ·{' '}
          {formatTimeRange(new Date(occurrence.startAt), new Date(occurrence.endAt), locale, list.timeZone)}
          {occurrence.placeName ? ` · ${occurrence.placeName}` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant="neutral">{t(`activities.club.kind.${list.declarationKind}`)}</StatusBadge>
          {occurrence.status !== 'planned' ? (
            <StatusBadge variant={occurrence.status === 'cancelled' ? 'error' : 'success'}>
              {t(`activities.occurrences.status.${occurrence.status}`)}
            </StatusBadge>
          ) : null}
        </div>
      </div>
      <p className="text-base font-semibold" data-testid="club-attendance-summary">
        {summaryLine(t, list.summary)}
      </p>
      {occurrence.status === 'cancelled' ? (
        <Alert status="error" data-testid="club-attendance-cancelled">
          <p className="max-w-prose">
            {occurrence.cancelReason
              ? t('activities.occurrences.cancelled.reason', { reason: occurrence.cancelReason })
              : t('activities.occurrences.cancelled.title')}
          </p>
        </Alert>
      ) : null}
      {occurrence.status === 'done' ? (
        <Alert status="success" data-testid="club-attendance-done">
          <p className="max-w-prose">{t('activities.club.attendance.done')}</p>
        </Alert>
      ) : null}
      {list.checkOff === 'not_started' ? (
        <Alert status="information" data-testid="club-attendance-not-started">
          <p className="max-w-prose">{t('activities.club.attendance.notStarted')}</p>
        </Alert>
      ) : null}
      <section aria-labelledby="club-attendance-list" className="flex flex-col gap-3">
        <h2 id="club-attendance-list" className="text-lg font-semibold">
          {t('activities.club.attendance.list')}
        </h2>
        {list.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('activities.club.attendance.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.rows.map((row) => (
              <AttendanceRowItem
                key={row.personId}
                row={row}
                editable={editable}
                selected={current(row)}
                busy={busy}
                onSelect={(personId, actual) => {
                  setSelections((previous) => new Map(previous).set(personId, actual))
                }}
              />
            ))}
          </ul>
        )}
        <p className="sr-only" aria-live="polite" data-testid="club-attendance-announcement">
          {announcement}
        </p>
      </section>
      {editable ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="min-h-11"
            disabled={busy || changed.length === 0}
            onClick={() => void save(false)}
            data-testid="club-attendance-save"
          >
            {t('activities.club.attendance.save')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy}
            onClick={() => void save(true)}
            data-testid="club-attendance-close"
          >
            {t('activities.club.attendance.close')}
          </Button>
        </div>
      ) : null}
      {ConfirmDialogElement}
    </>
  )
}

export function ClubAttendancePage({ id }: { id: string }) {
  return <ActivitiesClubFrame>{() => <Attendance id={id} />}</ActivitiesClubFrame>
}
