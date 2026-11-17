'use client'
// Moving one planned session (club spec glossary *Session*, DD-10; REQ-A05 of the groups and activities parity spec,
// #268): date, times, gathering time, declaration deadline (REQ-A07, #269, `confirm` kinds only) and place, shared by
// the session record ("Move") and the "Move" row button of the sessions list (B-15, `MoveOccurrenceDialog`). The move
// detaches the session from its series and clears "needs a new time"; one that overbooks a place or a coach is refused
// with 409 and its conflict list is shown above the fields. The coach changes only through the substitute dialog, so
// every change of the coach is in the history (#95).
import * as React from 'react'
import { CrudForm, type CrudField } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { dateField, timeField } from '@vereino/ui'
import { ConflictList } from './ConflictList'
import {
  dateLabel,
  errorMessage,
  fieldOfError,
  instantDate,
  instantTime,
  placeOptions,
  scheduleConflictsOf,
  takesDeadline,
  timeRangeOfInstants,
  toInstant,
  tolerant,
  useDeclarationKinds,
  type OccurrenceRow,
  type ScheduleConflict,
} from './client-helpers'

export type MovableOccurrence = Pick<
  OccurrenceRow,
  'id' | 'startAt' | 'endAt' | 'gatheringAt' | 'placeId' | 'updatedAt' | 'activityName' | 'activityType' | 'confirmBy'
>

type MoveValues = Record<string, unknown> & {
  date?: string
  startTime?: string
  endTime?: string
  /** The gathering wall time on the session's date (DD-43); empty = none. */
  gatheringTime?: string
  /** The declaration deadline's date and wall time (REQ-A07); both empty = none. */
  confirmByDate?: string
  confirmByTime?: string
  placeId?: string
  updatedAt?: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole calendar days between two `YYYY-MM-DD` dates (a session of a weekend tournament spans several). */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.round((end - start) / DAY_MS)
}

function addDays(date: string, days: number): string {
  const value = new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
  return value.toISOString().slice(0, 10)
}

/** The move fields and the save; the caller frames them (a record section or the list's dialog). */
export function MoveOccurrenceForm({
  occurrence,
  onDone,
  onCancel,
}: {
  occurrence: MovableOccurrence
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const t = useT()
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const kinds = useDeclarationKinds()
  // REQ-A07: the deadline is offered for a `confirm` kind, and always when the session already has one.
  const showDeadline = Boolean(occurrence.confirmBy) || takesDeadline(kinds, occurrence.activityType)
  const fields = React.useMemo<CrudField[]>(
    () => [
      dateField('date', t('activities.occurrences.fields.date'), { required: true }),
      timeField('startTime', t('activities.fields.startTime'), { required: true, layout: 'half' }),
      timeField('endTime', t('activities.fields.endTime'), { required: true, layout: 'half' }),
      timeField('gatheringTime', t('activities.gathering.label'), {
        layout: 'half',
        description: t('activities.occurrences.fields.gathering.help'),
      }),
      ...(showDeadline
        ? [
            dateField('confirmByDate', t('activities.occurrences.fields.confirmByDate'), {
              layout: 'half',
              description: t('activities.occurrences.fields.confirmBy.help'),
            }),
            timeField('confirmByTime', t('activities.occurrences.fields.confirmByTime'), { layout: 'half' }),
          ]
        : []),
      {
        id: 'placeId',
        label: t('activities.fields.place'),
        type: 'select',
        // A session of an away match may sit at an external place, so the move offers every bookable leaf.
        loadOptions: tolerant(() => placeOptions()),
        required: true,
      },
    ],
    [t, showDeadline],
  )
  const initialValues = React.useMemo<MoveValues>(
    () => ({
      id: occurrence.id,
      date: instantDate(occurrence.startAt),
      startTime: instantTime(occurrence.startAt),
      endTime: instantTime(occurrence.endAt),
      gatheringTime: instantTime(occurrence.gatheringAt),
      confirmByDate: instantDate(occurrence.confirmBy),
      confirmByTime: instantTime(occurrence.confirmBy),
      placeId: occurrence.placeId ?? '',
      updatedAt: occurrence.updatedAt,
    }),
    [occurrence],
  )
  // The end keeps the session's span in days, so a moved weekend tournament still ends on its last day.
  const spanDays = daysBetween(instantDate(occurrence.startAt), instantDate(occurrence.endAt))

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {conflicts ? <ConflictList conflicts={conflicts} /> : null}
      <CrudForm<MoveValues>
        embedded
        fields={fields}
        initialValues={initialValues}
        submitLabel={t('activities.occurrences.move.submit')}
        extraActions={
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('activities.common.cancel')}
          </Button>
        }
        onSubmit={async (values) => {
          const date = typeof values.date === 'string' ? values.date : ''
          const startAt = toInstant(date, values.startTime)
          const endAt = date ? toInstant(addDays(date, spanDays), values.endTime) : null
          if (!startAt || !endAt) {
            const message = t('activities.form.errors.required')
            throw createCrudFormError(message, {
              ...(startAt ? {} : { date: message, startTime: message }),
              ...(endAt ? {} : { endTime: message }),
            })
          }
          // DD-43: an untouched gathering time is not sent, so a moved session keeps its offset; a changed one is set on
          // the session's (new) date, and a cleared one removes it.
          const gatheringTime = typeof values.gatheringTime === 'string' ? values.gatheringTime : ''
          const gatheringChanged = gatheringTime !== initialValues.gatheringTime
          const gatheringAt = gatheringTime ? toInstant(date, gatheringTime) : null
          if (gatheringChanged && gatheringTime && !gatheringAt) {
            const message = t('activities.form.errors.invalid')
            throw createCrudFormError(message, { gatheringTime: message })
          }
          // REQ-A07: an untouched deadline is not sent, so a moved session keeps its offset (the server answers 422 when
          // that offset falls in the past); a changed one is sent as an instant, and two cleared fields remove it.
          const confirmByDate = typeof values.confirmByDate === 'string' ? values.confirmByDate : ''
          const confirmByTime = typeof values.confirmByTime === 'string' ? values.confirmByTime : ''
          const confirmByChanged =
            confirmByDate !== initialValues.confirmByDate || confirmByTime !== initialValues.confirmByTime
          const confirmBy = confirmByDate || confirmByTime ? toInstant(confirmByDate, confirmByTime) : null
          if (confirmByChanged && (confirmByDate || confirmByTime) && !confirmBy) {
            const message = t('activities.occurrences.fields.confirmBy.incomplete')
            throw createCrudFormError(message, { confirmByDate: message, confirmByTime: message })
          }
          try {
            await apiCallOrThrow(
              `/api/activities/occurrences/${encodeURIComponent(occurrence.id)}`,
              {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  startAt,
                  endAt,
                  placeId: values.placeId,
                  ...(gatheringChanged ? { gatheringAt } : {}),
                  ...(confirmByChanged ? { confirmBy } : {}),
                }),
              },
              { errorMessage: t('activities.occurrences.errors.move') },
            )
          } catch (error: unknown) {
            const found = scheduleConflictsOf(error)
            if (found) {
              setConflicts(found)
              throw createCrudFormError(errorMessage(error, t('activities.conflicts.title')))
            }
            const field = fieldOfError(error)
            if (field) {
              const message = errorMessage(error, t('activities.form.errors.invalid'))
              throw createCrudFormError(message, { [field]: message })
            }
            // Cancelled or done meanwhile: show the session as it is now (the form reports the message).
            if (errorCodeOf(error) === 'occurrence_not_planned') void onDone()
            throw error
          }
          setConflicts(null)
          flash(t('activities.occurrences.flash.moved'), 'success')
          await onDone()
        }}
      />
    </div>
  )
}

/** "Move" from a row of the sessions list (B-15, #268): the move form in a dialog that names the session. */
export function MoveOccurrenceDialog({
  occurrence,
  open,
  onOpenChange,
  onDone,
}: {
  occurrence: MovableOccurrence
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeAriaLabel={t('activities.common.close')} data-testid="occurrence-move-dialog">
        <DialogHeader>
          <DialogTitle>{t('activities.occurrences.move.title')}</DialogTitle>
          <DialogDescription>
            {t('activities.occurrences.move.session', {
              activity: occurrence.activityName ?? t('activities.common.empty'),
              date: dateLabel(t, instantDate(occurrence.startAt)),
              time: timeRangeOfInstants(occurrence.startAt, occurrence.endAt),
            })}
          </DialogDescription>
        </DialogHeader>
        <MoveOccurrenceForm
          occurrence={occurrence}
          onCancel={() => {
            onOpenChange(false)
          }}
          onDone={async () => {
            onOpenChange(false)
            await onDone()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
