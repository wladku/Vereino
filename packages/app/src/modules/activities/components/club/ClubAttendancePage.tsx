'use client'
// `/club/occurrences/[id]/attendance` (club spec UI row `/club/occurrences/[id]/attendance`, glossary *Actual
// attendance*; R11, D-026; AC-007; #33): the coach's list of a session — the summary line per the declaration kind, each
// person with what the declarations say and, once the session started, `present` / `absent` / `late`; "Save" and "Close
// session" (with a confirmation) save the changed marks against the session version. A save by someone else meanwhile
// shows the shared conflict bar and refreshes the list while the coach's selections stay. A coach of another group sees
// "not your session" (403), an unknown session "not found". A coach also finds there the consenting guardians'
// contacts (#34). E06-S17 (#99): "All declared present" fills the unmarked "yes" declarations; the close confirmation
// says how many unmarked persons are recorded absent, whether the session is still running and to whom the unit is
// credited; Ctrl/Cmd+Enter starts the close; a closed save names the present count and returns to Today; an empty list
// links a coordinator to the group roster; on a phone the actions stay in a sticky bar above the bottom navigation.
// #139: a planned session is also cancelled from here ("the session will not take place"), with M-04's dialog — unless
// the club setting `coach_may_cancel` is off and the caller only coaches the session (`mayCancel: false`, #199).
// E06-S13 (#95): the assigned coach reports an absence here before the session starts; "Needs a coach" marks a
// session without one. E10-S07 (#272, REQ-A14): the quick fill follows the declaration kind — a training fills the
// expected participants — and says why when nothing is left to fill; the list opens 30 minutes before the start
// (DD-A13) and says when. Training outlines and medical expiry spec M-O2 (#682): for a reader holding
// `people.medical.view` each person carries the medical certificate chip, and "Medical: not valid" narrows the list to
// the red ones (the marks of the hidden rows stay as they are). Sign-up form spec DD-J12 (#801): below the list the
// spot `vereino:club:occurrence:attendance:extra` lets another module add a block about the session (`enrolment`'s
// "Trial participants" card); the context names the session only, and the widget reads and saves its own data.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { InjectionSpot } from '@open-mercato/ui/backend/injection/InjectionSpot'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Radio, RadioGroup } from '@open-mercato/ui/primitives/radio'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  CLUB_HOME_HREF,
  formatClockTime,
  formatDayHeading,
  formatTimeRange,
  isMedicalNotValid,
  MedicalStatusTag,
  MemberSkeleton,
  Notice,
  StatusTag,
  type MedicalStatusItem,
} from '@vereino/ui'
import {
  closesEarly,
  groupRosterHref,
  isCloseShortcut,
  presentCount,
  quickFill,
  seesRosterLink,
  sheetEntries,
  unmarkedPersonIds,
} from '../../lib/attendance-sheet'
import { needsCoach } from '../../lib/activities-rules'
import { formatDeadline } from '../../lib/confirm-by'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import { CancelSessionDialog } from './CoachSessionBlock'
import { GuardianContacts } from './GuardianContacts'
import { ReportAbsence } from './ReportAbsence'
import { useMedicalLabels, useMedicalStatuses } from './useMedicalStatuses'
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

/** The spot below the attendance list (DD-J12): blocks of other modules about this session. */
export const ATTENDANCE_EXTRA_SPOT = 'vereino:club:occurrence:attendance:extra'

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
  medical,
}: {
  row: AttendanceRow
  editable: boolean
  selected: ActualValue | null
  busy: boolean
  onSelect: (personId: string, actual: ActualValue | null) => void
  /** The person's medical status, when the reader may see it (M-O2). */
  medical: MedicalStatusItem | null
}) {
  const t = useT()
  const { labels: medicalLabels, formatDate: medicalDate } = useMedicalLabels()
  const name = rowName(row, t('activities.common.empty'))
  const groupId = `attendance-${row.personId}`
  return (
    <li className="bg-card flex flex-col gap-3 rounded-lg border p-4" data-testid="club-attendance-row">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold" id={`${groupId}-name`}>
          {name}
        </span>
        <span data-testid="club-attendance-expectation">
          <StatusTag status={EXPECTATION_VARIANT[row.expectation]}>
            {t(`activities.club.attendance.expectation.${row.expectation}`)}
          </StatusTag>
        </span>
      </div>
      {medical ? (
        <MedicalStatusTag
          item={medical}
          labels={medicalLabels}
          formatDate={medicalDate}
          personId={row.personId}
          className="self-start"
          data-testid="club-attendance-medical"
        />
      ) : null}
      {!row.onRoster ? <p className="text-muted-foreground text-sm">{t('activities.club.attendance.guest')}</p> : null}
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
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
          {selected ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={busy}
              onClick={() => {
                onSelect(row.personId, null)
              }}
            >
              {t('activities.club.attendance.clear')}
              <span className="sr-only"> — {name}</span>
            </Button>
          ) : null}
        </div>
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

function Attendance({ id, selfPersonId }: { id: string; selfPersonId: string }) {
  const t = useT()
  const query = useAttendanceList(id)

  if (!query.data && query.isFetching)
    return <MemberSkeleton shape="rows" label={t('activities.club.attendance.loading')} />
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
  if (query.data.status !== 'ok') {
    return (
      <>
        <BackLink />
        <Alert style="light" status="warning" data-testid="club-attendance-missing">
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
  return <AttendanceSheet id={id} list={query.data.list} selfPersonId={selfPersonId} />
}

function BackLink() {
  const t = useT()
  return (
    <Link href={CLUB_CALENDAR_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
      {t('activities.club.session.back')}
    </Link>
  )
}

function AttendanceSheet({ id, list, selfPersonId }: { id: string; list: AttendanceList; selfPersonId: string }) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [selections, setSelections] = React.useState<Selections>(() => new Map())
  const [busy, setBusy] = React.useState(false)
  const [announcement, setAnnouncement] = React.useState('')
  const [cancelling, setCancelling] = React.useState(false)
  // One close flow at a time: Ctrl/Cmd+Enter also confirms the open dialog, which must not start a second close.
  const closing = React.useRef(false)

  const { occurrence } = list
  const editable = list.checkOff === 'open'
  const current = (row: AttendanceRow): ActualValue | null =>
    selections.has(row.personId) ? (selections.get(row.personId) ?? null) : row.actual
  const changed = sheetEntries(list.rows, current, false)
  const toFill = editable ? quickFill(list.declarationKind, list.rows, current) : []
  const fillsExpected = list.declarationKind === 'absence_only'
  // M-O2: the medical statuses of the listed people; the filter shows only once a status came back.
  const medicalStatuses = useMedicalStatuses(list.rows.map((row) => row.personId))
  const [notValidOnly, setNotValidOnly] = React.useState(false)
  const medicalFilterShown = medicalStatuses.size > 0
  const filtering = medicalFilterShown && notValidOnly
  const shownRows = filtering
    ? list.rows.filter((row) => {
        const item = medicalStatuses.get(row.personId)
        return item ? isMedicalNotValid(item.status) : false
      })
    : list.rows

  const succeed = (message: string) => {
    setAnnouncement(message)
    flash(message, 'success')
  }

  const fillDeclared = () => {
    setSelections((previous) => {
      const next = new Map(previous)
      for (const personId of toFill) next.set(personId, 'present')
      return next
    })
    succeed(
      t(fillsExpected ? 'activities.club.attendance.filledExpected' : 'activities.club.attendance.filledDeclared'),
    )
  }

  const save = async (complete: boolean) => {
    if (complete) {
      const unmarked = unmarkedPersonIds(list.rows, current).length
      const text = [
        t('activities.club.attendance.confirmCloseText'),
        unmarked > 0 ? t('activities.club.attendance.confirmCloseUnmarked', { count: unmarked }) : null,
        closesEarly(occurrence.endAt, new Date()) ? t('activities.club.attendance.confirmCloseEarly') : null,
        occurrence.coachName
          ? t('activities.club.attendance.confirmCloseCredit', { coach: occurrence.coachName })
          : t('activities.club.attendance.confirmCloseNoCoach'),
      ]
        .filter(Boolean)
        .join(' ')
      const confirmed = await confirm({
        title: t('activities.club.attendance.confirmClose'),
        text,
        confirmText: t('activities.club.attendance.close'),
        cancelText: t('activities.common.cancel'),
      })
      if (!confirmed) return
    }
    setBusy(true)
    let closed = false
    try {
      const saved = await saveAttendance(
        id,
        { entries: sheetEntries(list.rows, current, complete), ...(complete ? { complete: true } : {}) },
        t('activities.club.errors.saveAttendance'),
        occurrence.updatedAt,
      )
      // Saved: the answer is the refreshed list, so the page shows the server's values at once.
      if (saved) queryClient.setQueryData([ATTENDANCE_LIST_QUERY_KEY, id], { status: 'ok', list: saved })
      setSelections(new Map())
      closed = complete
      succeed(
        complete
          ? t('activities.club.flash.sessionClosedCount', { count: presentCount(saved?.rows ?? []) })
          : t('activities.club.flash.attendanceSaved'),
      )
    } catch (error: unknown) {
      // A save by someone else meanwhile: the shared conflict bar, then the refreshed list with the selections kept.
      if (!surfaceRecordConflict(error, t)) flash(errorText(error, t('activities.club.errors.saveAttendance')), 'error')
    } finally {
      setBusy(false)
      // After a conflict the list refetches with the newer version; the selections stay.
      await queryClient.invalidateQueries({ queryKey: [ATTENDANCE_LIST_QUERY_KEY, id] })
      await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
    }
    // A closed session: back to Today (README M-05 → M-02).
    if (closed) router.push(CLUB_HOME_HREF)
  }

  const close = async () => {
    if (closing.current) return
    closing.current = true
    try {
      await save(true)
    } finally {
      closing.current = false
    }
  }
  // The keyboard shortcut calls the latest close action without re-registering on every render.
  const closeRef = React.useRef(close)
  React.useEffect(() => {
    closeRef.current = close
  })
  React.useEffect(() => {
    if (!editable || busy) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCloseShortcut(event) || closing.current) return
      event.preventDefault()
      void closeRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [editable, busy])
  // WCAG 2.2 SC 2.4.11 (#547): on a phone the sticky action bar covers the bottom of the viewport, so a row control
  // focused by Tab is scrolled into view above it. The bar wraps (and grows with the "nothing to fill" hint), so its
  // height is measured into `--attendance-actions-height` on the list rather than assumed.
  const listRef = React.useRef<HTMLElement>(null)
  const actionsRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const bar = actionsRef.current
    const section = listRef.current
    if (!bar || !section || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      section.style.setProperty('--attendance-actions-height', `${String(bar.offsetHeight)}px`)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => {
      observer.disconnect()
    }
  }, [editable])

  return (
    <>
      <BackLink />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold" data-testid="club-attendance-title">
          {[occurrence.activityName ?? t('activities.club.session.untitled'), occurrence.groupName]
            .filter(Boolean)
            .join(' · ')}
        </h1>
        <p className="text-muted-foreground text-sm">
          {formatDayHeading(occurrence.occurrenceDate, locale)} ·{' '}
          {occurrence.gatheringAt ? (
            <span data-testid="club-attendance-gathering">
              {t('activities.gathering.at', {
                time: formatClockTime(new Date(occurrence.gatheringAt), locale, list.timeZone),
              })}{' '}
              ·{' '}
            </span>
          ) : null}
          {formatTimeRange(new Date(occurrence.startAt), new Date(occurrence.endAt), locale, list.timeZone)}
          {occurrence.placeName ? ` · ${occurrence.placeName}` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <StatusTag status="neutral">{t(`activities.club.kind.${list.declarationKind}`)}</StatusTag>
          {occurrence.status !== 'planned' ? (
            <StatusTag status={occurrence.status === 'cancelled' ? 'canceled' : 'success'}>
              {t(`activities.occurrences.status.${occurrence.status}`)}
            </StatusTag>
          ) : null}
          {needsCoach(occurrence) ? (
            <span data-testid="club-attendance-needs-coach">
              <StatusTag status="warning">{t('activities.club.session.needsCoach')}</StatusTag>
            </span>
          ) : null}
        </div>
        {/* E06-S13 #95: the assigned coach who cannot come reports it before the session starts. */}
        <div className="flex flex-wrap gap-2">
          <ReportAbsence
            occurrence={occurrence}
            selfPersonId={selfPersonId}
            label={[
              occurrence.activityName ?? t('activities.club.session.untitled'),
              `${formatDayHeading(occurrence.occurrenceDate, locale)} ${formatClockTime(new Date(occurrence.startAt), locale, list.timeZone)}`,
            ].join(', ')}
            onDone={async (message) => {
              if (message) succeed(message)
              await queryClient.invalidateQueries({ queryKey: [ATTENDANCE_LIST_QUERY_KEY, id] })
              await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
            }}
          />
        </div>
      </div>
      <p className="text-base font-semibold" data-testid="club-attendance-summary">
        {summaryLine(t, list.summary)}
      </p>
      {/* REQ-A07 (M-05): the deadline, and once it passed how many have not answered — listed first. */}
      {occurrence.confirmBy && occurrence.status === 'planned' && list.checkOff === 'not_started' ? (
        <p
          className="text-sm"
          data-testid="club-attendance-deadline"
          data-passed={occurrence.deadlinePassed ? 'true' : 'false'}
        >
          {occurrence.deadlinePassed
            ? t('activities.deadline.unansweredFirst', { count: list.unansweredCount ?? list.summary.unanswered })
            : t('activities.deadline.confirmBy', {
                at: formatDeadline(new Date(occurrence.confirmBy), locale, list.timeZone),
              })}
        </p>
      ) : null}
      {occurrence.status === 'cancelled' ? (
        <Alert style="light" status="error" data-testid="club-attendance-cancelled">
          <p className="max-w-prose">
            {occurrence.cancelReason
              ? t('activities.occurrences.cancelled.reason', { reason: occurrence.cancelReason })
              : t('activities.occurrences.cancelled.title')}
          </p>
        </Alert>
      ) : null}
      {occurrence.status === 'done' ? (
        <Alert style="light" status="success" data-testid="club-attendance-done">
          <p className="max-w-prose">{t('activities.club.attendance.done')}</p>
        </Alert>
      ) : null}
      {list.checkOff === 'not_started' ? (
        <Notice data-testid="club-attendance-not-started">
          <p className="max-w-prose">
            {t('activities.club.attendance.notStarted', {
              time: formatClockTime(new Date(list.checkOffOpensAt), locale, list.timeZone),
            })}
          </p>
        </Notice>
      ) : null}
      {/* Below `sm` the bar is sticky at `bottom-24` (6 rem): a focused control keeps the bar's height + 6.5 rem below it. */}
      <section
        ref={listRef}
        aria-labelledby="club-attendance-list"
        className="flex flex-col gap-3 max-sm:[&_button]:scroll-mb-[calc(var(--attendance-actions-height,0px)+6.5rem)]"
      >
        <h2 id="club-attendance-list" className="text-lg font-semibold">
          {t('activities.club.attendance.list')}
        </h2>
        {list.rows.length === 0 ? (
          <div className="flex flex-col gap-2" data-testid="club-attendance-empty">
            <p className="text-muted-foreground text-sm">{t('activities.club.attendance.empty')}</p>
            {seesRosterLink(list.actingRole) ? (
              <Link
                href={groupRosterHref(occurrence.groupId)}
                className="text-primary inline-flex min-h-11 items-center text-sm underline"
                data-testid="club-attendance-roster-link"
              >
                {t('activities.club.attendance.rosterLink')}
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            {medicalFilterShown ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={notValidOnly ? 'default' : 'outline'}
                  className="min-h-11 rounded-full"
                  aria-pressed={notValidOnly}
                  data-testid="club-attendance-medical-filter"
                  onClick={() => {
                    setNotValidOnly(!notValidOnly)
                  }}
                >
                  {t('activities.club.medical.filter')}
                </Button>
              </div>
            ) : null}
            {shownRows.length === 0 ? (
              <p className="text-muted-foreground text-sm" data-testid="club-attendance-medical-filter-empty">
                {t('activities.club.medical.filterEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {shownRows.map((row) => (
                  <AttendanceRowItem
                    key={row.personId}
                    row={row}
                    editable={editable}
                    selected={current(row)}
                    busy={busy}
                    medical={medicalStatuses.get(row.personId) ?? null}
                    onSelect={(personId, actual) => {
                      setSelections((previous) => new Map(previous).set(personId, actual))
                    }}
                  />
                ))}
              </ul>
            )}
          </>
        )}
        <p className="sr-only" aria-live="polite" data-testid="club-attendance-announcement">
          {announcement}
        </p>
      </section>
      <InjectionSpot
        spotId={ATTENDANCE_EXTRA_SPOT}
        context={{
          occurrence: {
            id: occurrence.id,
            groupId: occurrence.groupId,
            status: occurrence.status,
            occurrenceDate: occurrence.occurrenceDate,
            startAt: occurrence.startAt,
            endAt: occurrence.endAt,
          },
          actingRole: list.actingRole,
          timeZone: list.timeZone,
        }}
      />
      {editable ? (
        // On a phone the actions stay in view above the fixed bottom navigation (README M-05 "bottom action bar"); 6 rem
        // clears the navigation's 4 rem and a phone's safe area.
        <div
          ref={actionsRef}
          className="bg-background sticky bottom-24 z-30 -mx-4 flex flex-wrap gap-2 border-t px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:p-0"
          data-testid="club-attendance-actions"
        >
          {list.rows.length > 0 ? (
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy || toFill.length === 0}
                aria-describedby={toFill.length === 0 ? 'club-attendance-fill-nothing' : undefined}
                onClick={fillDeclared}
                data-testid="club-attendance-fill-declared"
                data-kind={list.declarationKind}
              >
                {t(
                  fillsExpected ? 'activities.club.attendance.fillExpected' : 'activities.club.attendance.fillDeclared',
                )}
              </Button>
              {toFill.length === 0 ? (
                <p
                  id="club-attendance-fill-nothing"
                  className="text-muted-foreground text-xs"
                  data-testid="club-attendance-fill-nothing"
                >
                  {t(`activities.club.attendance.fillNothing.${list.declarationKind}`)}
                </p>
              ) : null}
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={busy || changed.length === 0}
            onClick={() => void save(false)}
            data-testid="club-attendance-save"
          >
            {t('activities.club.attendance.save')}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={busy}
            onClick={() => void close()}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            data-testid="club-attendance-close"
          >
            {t('activities.club.attendance.close')}
          </Button>
        </div>
      ) : null}
      {occurrence.status === 'planned' && list.mayCancel ? (
        <div className="flex flex-col gap-2" data-testid="club-attendance-cancel-section">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 self-start"
            disabled={busy}
            aria-describedby="club-attendance-cancel-hint"
            data-testid="club-session-cancel"
            onClick={() => {
              setCancelling(true)
            }}
          >
            {t('activities.club.session.cancel')}
          </Button>
          <p id="club-attendance-cancel-hint" className="text-muted-foreground text-xs">
            {t('activities.club.session.cancelHint')}
          </p>
          <CancelSessionDialog
            occurrence={occurrence}
            open={cancelling}
            onOpenChange={setCancelling}
            onDone={async (message) => {
              if (message) succeed(message)
              await queryClient.invalidateQueries({ queryKey: [ATTENDANCE_LIST_QUERY_KEY, id] })
              await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
            }}
          />
        </div>
      ) : null}
      {list.actingRole === 'coach' && occurrence.status !== 'cancelled' ? (
        <GuardianContacts occurrenceId={occurrence.id} />
      ) : null}
      {ConfirmDialogElement}
    </>
  )
}

export function ClubAttendancePage({ id }: { id: string }) {
  return (
    <ActivitiesClubFrame>{(profile) => <Attendance id={id} selfPersonId={profile.person.id} />}</ActivitiesClubFrame>
  )
}
