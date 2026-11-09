'use client'
// The "Plan maintenance" / "Edit maintenance" dialog (facilities spec B-27 maintenance tab, M-11 "Plan maintenance";
// REQ-022, DD-36; #128). The full form (the panel) takes the place, the kind of work, who is responsible, the schedule
// — one-off by a time window or a due date, recurring by date ("every N days / weeks / months / years" from a due
// date) or by hours of use — the cost and notes. The window form (`/club/places/[placeId]`) plans a one-off window on
// the place of the timeline. A coded refusal is shown at its field (409 `maintenance_scheduled`, 422 window, schedule
// and threshold problems); an edit sends the task's version as the lock token and a 409 conflict surfaces through the
// platform's conflict UI. A window over existing entries marks them to be moved (`flagged`), shown in the toast.
import * as React from 'react'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
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
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Radio, RadioGroup } from '@open-mercato/ui/primitives/radio'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import {
  MAINTENANCE_KINDS,
  MAINTENANCE_RESPONSIBLE,
  MAINTENANCE_SCHEDULE_TYPES,
  MAX_RECURRENCE_INTERVAL,
  MAX_USAGE_HOURS_THRESHOLD,
  parseMaintenanceRecurrence,
  type MaintenanceKind,
  type MaintenanceRecurrence,
  type MaintenanceResponsible,
  type MaintenanceScheduleType,
} from '../lib/maintenance'
import { amountToMinor, codedMessage, errorMessage, minorToAmount } from './facilities-client'
import {
  RECURRENCE_FREQUENCIES,
  createMaintenanceTask,
  fieldOfError,
  recurrenceRuleOf,
  updateMaintenanceTask,
  type MaintenanceTaskRow,
  type MaintenanceWriteResult,
} from './maintenance-client'

const NOTES_MAX_LENGTH = 2000

type Field =
  'placeId' | 'kind' | 'startsAt' | 'endsAt' | 'dueDate' | 'recurrenceRule' | 'usageHoursThreshold' | 'cost' | 'notes'

const FIELDS: readonly Field[] = [
  'placeId',
  'kind',
  'startsAt',
  'endsAt',
  'dueDate',
  'recurrenceRule',
  'usageHoursThreshold',
  'cost',
  'notes',
]

type When = 'window' | 'due'

const isOne = <T extends string>(list: readonly T[], value: string, fallback: T): T =>
  list.find((entry) => entry === value) ?? fallback

export type MaintenanceTaskDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The places a task may be planned on (a create); one entry fixes the place. */
  places: CrudFieldOption[]
  /** The task to change; a create without it. */
  task?: MaintenanceTaskRow | null
  /** The window form of the place timeline: a one-off window only. */
  windowOnly?: boolean
  /** The `datetime-local` values the window starts with. */
  initialWindow?: { startsAt: string; endsAt: string }
  /** A `datetime-local` value as an ISO instant (null when invalid), and back. */
  toInstant: (local: string) => string | null
  toLocal: (iso: string | null | undefined) => string
  /** A note under the window inputs, e.g. the time zone they are read in. */
  windowHelp?: string
  onSaved: (result: MaintenanceWriteResult | null) => void | Promise<void>
  /** Refreshes the reads after a conflict. */
  onRefresh?: () => void
  testId?: string
}

export function MaintenanceTaskDialog({
  open,
  onOpenChange,
  places,
  task,
  windowOnly = false,
  initialWindow,
  toInstant,
  toLocal,
  windowHelp,
  onSaved,
  onRefresh,
  testId = 'facilities-maintenance-dialog',
}: MaintenanceTaskDialogProps) {
  const t = useT()
  const ids = React.useId()
  const editing = Boolean(task)
  const recurrence = task?.recurrenceRule ? parseMaintenanceRecurrence(task.recurrenceRule) : null
  const [placeId, setPlaceId] = React.useState(task?.placeId ?? (places.length === 1 ? (places[0]?.value ?? '') : ''))
  const [kind, setKind] = React.useState<MaintenanceKind | ''>(task ? isOne(MAINTENANCE_KINDS, task.kind, 'other') : '')
  const [responsible, setResponsible] = React.useState<MaintenanceResponsible>(
    task ? isOne(MAINTENANCE_RESPONSIBLE, task.responsible, 'club') : 'club',
  )
  const [scheduleType, setScheduleType] = React.useState<MaintenanceScheduleType>(
    task ? isOne(MAINTENANCE_SCHEDULE_TYPES, task.scheduleType, 'one_off') : 'one_off',
  )
  const [when, setWhen] = React.useState<When>(task && !task.startsAt && task.dueDate ? 'due' : 'window')
  const [startsAt, setStartsAt] = React.useState(task ? toLocal(task.startsAt) : (initialWindow?.startsAt ?? ''))
  const [endsAt, setEndsAt] = React.useState(task ? toLocal(task.endsAt) : (initialWindow?.endsAt ?? ''))
  const [dueDate, setDueDate] = React.useState(task?.dueDate ?? '')
  const [freq, setFreq] = React.useState<MaintenanceRecurrence['freq']>(recurrence?.freq ?? 'YEARLY')
  const [intervalText, setIntervalText] = React.useState(String(recurrence?.interval ?? 1))
  const [threshold, setThreshold] = React.useState(
    task?.usageHoursThreshold !== null && task?.usageHoursThreshold !== undefined
      ? String(task.usageHoursThreshold)
      : '',
  )
  const [cost, setCost] = React.useState(
    task?.cost !== null && task?.cost !== undefined ? minorToAmount(task.cost) : '',
  )
  const [notes, setNotes] = React.useState(task?.notes ?? '')
  const [pending, setPending] = React.useState(false)
  const [problems, setProblems] = React.useState<Partial<Record<Field, string>>>({})
  const [problem, setProblem] = React.useState<string | null>(null)

  const usesWindow = windowOnly || (scheduleType === 'one_off' && when === 'window')
  const usesDue = !windowOnly && (scheduleType === 'date_recurring' || (scheduleType === 'one_off' && when === 'due'))

  /** The request body, or null with the field problems set. */
  const build = (): Record<string, unknown> | null => {
    const next: Partial<Record<Field, string>> = {}
    const required = t('facilities.maintenance.errors.required')
    if (!placeId) next.placeId = t('facilities.records.bans.errors.place')
    if (!kind) next.kind = required
    let start: string | null = null
    let end: string | null = null
    if (usesWindow) {
      start = toInstant(startsAt)
      end = toInstant(endsAt)
      if (!start) next.startsAt = required
      if (!end) next.endsAt = required
      else if (start && new Date(end).getTime() <= new Date(start).getTime()) {
        next.endsAt = t('facilities.errors.maintenance_window_invalid')
      }
    }
    if (usesDue && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) next.dueDate = required
    const every = Number(intervalText)
    if (scheduleType === 'date_recurring' && !windowOnly) {
      if (!Number.isInteger(every) || every < 1 || every > MAX_RECURRENCE_INTERVAL) {
        next.recurrenceRule = t('facilities.maintenance.errors.interval', { max: MAX_RECURRENCE_INTERVAL })
      }
    }
    const hours = Number(threshold)
    if (scheduleType === 'usage_hours' && !windowOnly) {
      if (!threshold.trim() || !Number.isInteger(hours) || hours < 1 || hours > MAX_USAGE_HOURS_THRESHOLD) {
        next.usageHoursThreshold = t('facilities.errors.maintenance_usage_threshold_invalid')
      }
    }
    const minor = cost.trim() ? amountToMinor(cost) : null
    if (cost.trim() && minor === null) next.cost = t('facilities.maintenance.errors.cost')
    setProblems(next)
    setProblem(Object.keys(next).length > 0 ? t('facilities.errors.invalid') : null)
    if (Object.keys(next).length > 0) return null
    const type: MaintenanceScheduleType = windowOnly ? 'one_off' : scheduleType
    return {
      ...(editing ? {} : { placeId, scheduleType: type }),
      kind,
      responsible,
      startsAt: usesWindow ? start : null,
      endsAt: usesWindow ? end : null,
      dueDate: usesDue ? dueDate : null,
      recurrenceRule: type === 'date_recurring' ? recurrenceRuleOf(freq, every) : null,
      usageHoursThreshold: type === 'usage_hours' ? hours : null,
      ...(windowOnly ? {} : { cost: minor }),
      notes: notes.trim() ? notes.trim() : null,
    }
  }

  const submit = async () => {
    if (pending) return
    const body = build()
    if (!body) return
    setPending(true)
    try {
      const call = task
        ? await updateMaintenanceTask(task, body)
        : await createMaintenanceTask(body as Parameters<typeof createMaintenanceTask>[0])
      onOpenChange(false)
      await onSaved(call.result ?? null)
    } catch (error: unknown) {
      if (task && surfaceRecordConflict(error, t, { onRefresh })) {
        onOpenChange(false)
        return
      }
      const code = errorCodeOf(error)
      const message = codedMessage(error, t)
      const field = fieldOfError(error, code)
      const known = FIELDS.find((entry) => entry === field)
      if (message && known) setProblems({ [known]: message })
      setProblem(message ?? errorMessage(error, t('facilities.maintenance.errors.save')))
    } finally {
      setPending(false)
    }
  }

  const fieldProblem = (field: Field) =>
    problems[field] ? (
      <p id={`${ids}-${field}-problem`} className="text-destructive text-xs" role="alert">
        {problems[field]}
      </p>
    ) : null
  const invalid = (field: Field) => (problems[field] ? true : undefined)
  const describedBy = (field: Field, extra?: string) =>
    [extra, problems[field] ? `${ids}-${field}-problem` : undefined].filter(Boolean).join(' ') || undefined

  const title = task
    ? t('facilities.maintenance.edit.title')
    : windowOnly
      ? t('facilities.maintenance.plan.windowTitle')
      : t('facilities.maintenance.plan.title')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        closeAriaLabel={t('facilities.common.close')}
        data-testid={testId}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {windowOnly ? t('facilities.maintenance.plan.windowHelp') : t('facilities.maintenance.plan.help')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {places.length > 1 || editing ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-place`}>{t('facilities.fields.place')}</Label>
              <Select value={placeId} disabled={pending || editing} onValueChange={setPlaceId}>
                <SelectTrigger
                  id={`${ids}-place`}
                  data-testid={`${testId}-place`}
                  aria-invalid={invalid('placeId')}
                  aria-describedby={describedBy('placeId')}
                >
                  <SelectValue placeholder={t('facilities.fields.place.choose')} />
                </SelectTrigger>
                <SelectContent>
                  {editing && task && !places.some((option) => option.value === task.placeId) ? (
                    <SelectItem value={task.placeId}>
                      {task.placeName ?? t('facilities.common.unknownPlace')}
                    </SelectItem>
                  ) : null}
                  {places.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldProblem('placeId')}
            </div>
          ) : places.length === 1 ? (
            <p className="text-sm">
              <span className="font-medium">{t('facilities.fields.place')}:</span> {places[0]?.label}
            </p>
          ) : (
            <p className="text-destructive text-sm" role="alert">
              {t('facilities.maintenance.errors.noPlaces')}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-kind`}>{t('facilities.maintenance.fields.kind')}</Label>
            <Select
              value={kind}
              disabled={pending}
              onValueChange={(next: string) => {
                setKind(isOne(MAINTENANCE_KINDS, next, 'other'))
              }}
            >
              <SelectTrigger
                id={`${ids}-kind`}
                data-testid={`${testId}-kind`}
                aria-invalid={invalid('kind')}
                aria-describedby={describedBy('kind')}
              >
                <SelectValue placeholder={t('facilities.maintenance.fields.kind.choose')} />
              </SelectTrigger>
              <SelectContent>
                {MAINTENANCE_KINDS.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {t(`facilities.maintenance.kinds.${entry}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldProblem('kind')}
          </div>

          {windowOnly ? null : (
            <div className="flex flex-col gap-2">
              <span id={`${ids}-responsible`} className="text-sm font-medium">
                {t('facilities.maintenance.fields.responsible')}
              </span>
              <SegmentedControl
                value={responsible}
                onValueChange={(next: string) => {
                  setResponsible(isOne(MAINTENANCE_RESPONSIBLE, next, 'club'))
                }}
                aria-labelledby={`${ids}-responsible`}
                data-testid={`${testId}-responsible`}
              >
                {MAINTENANCE_RESPONSIBLE.map((entry) => (
                  <SegmentedControlItem key={entry} value={entry}>
                    {t(`facilities.maintenance.responsible.${entry}`)}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            </div>
          )}

          {windowOnly || editing ? null : (
            <div className="flex flex-col gap-2">
              <span id={`${ids}-schedule`} className="text-sm font-medium">
                {t('facilities.maintenance.fields.scheduleType')}
              </span>
              <SegmentedControl
                value={scheduleType}
                onValueChange={(next: string) => {
                  setScheduleType(isOne(MAINTENANCE_SCHEDULE_TYPES, next, 'one_off'))
                  setProblems({})
                  setProblem(null)
                }}
                aria-labelledby={`${ids}-schedule`}
                data-testid={`${testId}-schedule-type`}
              >
                {MAINTENANCE_SCHEDULE_TYPES.map((entry) => (
                  <SegmentedControlItem key={entry} value={entry}>
                    {t(`facilities.maintenance.scheduleType.${entry}`)}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
              <p className="text-muted-foreground text-xs">
                {t(`facilities.maintenance.scheduleType.${scheduleType}.help`)}
              </p>
            </div>
          )}

          {!windowOnly && scheduleType === 'one_off' ? (
            <fieldset className="flex flex-col gap-2">
              <legend id={`${ids}-when`} className="mb-1 text-sm font-medium">
                {t('facilities.maintenance.fields.when')}
              </legend>
              <RadioGroup
                aria-labelledby={`${ids}-when`}
                className="flex flex-col gap-2 sm:flex-row"
                value={when}
                onValueChange={(value: string) => {
                  setWhen(value === 'due' ? 'due' : 'window')
                }}
              >
                {(['window', 'due'] as const).map((entry) => (
                  <label
                    key={entry}
                    htmlFor={`${ids}-when-${entry}`}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
                    data-testid={`${testId}-when-${entry}`}
                  >
                    <Radio id={`${ids}-when-${entry}`} value={entry} disabled={pending} />
                    <span className="text-sm font-medium">{t(`facilities.maintenance.when.${entry}`)}</span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          ) : null}

          {usesWindow ? (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${ids}-start`}>{t('facilities.maintenance.fields.startsAt')}</Label>
                  <Input
                    id={`${ids}-start`}
                    type="datetime-local"
                    className="min-h-11"
                    required
                    value={startsAt}
                    disabled={pending}
                    data-testid={`${testId}-start`}
                    aria-invalid={invalid('startsAt')}
                    aria-describedby={describedBy('startsAt', windowHelp ? `${ids}-window-help` : undefined)}
                    onChange={(event) => {
                      setStartsAt(event.target.value)
                    }}
                  />
                  {fieldProblem('startsAt')}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${ids}-end`}>{t('facilities.maintenance.fields.endsAt')}</Label>
                  <Input
                    id={`${ids}-end`}
                    type="datetime-local"
                    className="min-h-11"
                    required
                    value={endsAt}
                    disabled={pending}
                    data-testid={`${testId}-end`}
                    aria-invalid={invalid('endsAt')}
                    aria-describedby={describedBy('endsAt', windowHelp ? `${ids}-window-help` : undefined)}
                    onChange={(event) => {
                      setEndsAt(event.target.value)
                    }}
                  />
                  {fieldProblem('endsAt')}
                </div>
              </div>
              <p id={`${ids}-window-help`} className="text-muted-foreground text-xs">
                {windowHelp ?? t('facilities.maintenance.fields.window.help')}
              </p>
            </div>
          ) : null}

          {usesDue ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-due`}>{t('facilities.maintenance.fields.dueDate')}</Label>
              <Input
                id={`${ids}-due`}
                type="date"
                className="min-h-11 sm:w-60"
                required
                value={dueDate}
                disabled={pending}
                data-testid={`${testId}-due`}
                aria-invalid={invalid('dueDate')}
                aria-describedby={describedBy('dueDate')}
                onChange={(event) => {
                  setDueDate(event.target.value)
                }}
              />
              {fieldProblem('dueDate')}
            </div>
          ) : null}

          {!windowOnly && scheduleType === 'date_recurring' ? (
            <div className="flex flex-col gap-1">
              <span id={`${ids}-every`} className="text-sm font-medium">
                {t('facilities.maintenance.fields.repeat')}
              </span>
              <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${ids}-interval`}>{t('facilities.maintenance.fields.interval')}</Label>
                  <Input
                    id={`${ids}-interval`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_RECURRENCE_INTERVAL}
                    className="min-h-11 sm:w-28"
                    value={intervalText}
                    disabled={pending}
                    data-testid={`${testId}-interval`}
                    aria-invalid={invalid('recurrenceRule')}
                    aria-describedby={describedBy('recurrenceRule')}
                    onChange={(event) => {
                      setIntervalText(event.target.value)
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${ids}-freq`}>{t('facilities.maintenance.fields.unit')}</Label>
                  <Select
                    value={freq}
                    disabled={pending}
                    onValueChange={(next: string) => {
                      setFreq(isOne(RECURRENCE_FREQUENCIES, next, 'YEARLY'))
                    }}
                  >
                    <SelectTrigger id={`${ids}-freq`} className="min-h-11 sm:w-44" data-testid={`${testId}-freq`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_FREQUENCIES.map((entry) => (
                        <SelectItem key={entry} value={entry}>
                          {t(`facilities.maintenance.unit.${entry}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {fieldProblem('recurrenceRule')}
            </div>
          ) : null}

          {!windowOnly && scheduleType === 'usage_hours' ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-threshold`}>{t('facilities.maintenance.fields.usageHoursThreshold')}</Label>
              <Input
                id={`${ids}-threshold`}
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_USAGE_HOURS_THRESHOLD}
                className="min-h-11 sm:w-40"
                value={threshold}
                disabled={pending}
                data-testid={`${testId}-threshold`}
                aria-invalid={invalid('usageHoursThreshold')}
                aria-describedby={describedBy('usageHoursThreshold', `${ids}-threshold-help`)}
                onChange={(event) => {
                  setThreshold(event.target.value)
                }}
              />
              <p id={`${ids}-threshold-help`} className="text-muted-foreground text-xs">
                {t('facilities.maintenance.fields.usageHoursThreshold.help')}
              </p>
              {fieldProblem('usageHoursThreshold')}
            </div>
          ) : null}

          {windowOnly ? null : (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-cost`}>{t('facilities.maintenance.fields.cost')}</Label>
              <Input
                id={`${ids}-cost`}
                inputMode="decimal"
                className="min-h-11 sm:w-40"
                value={cost}
                disabled={pending}
                data-testid={`${testId}-cost`}
                aria-invalid={invalid('cost')}
                aria-describedby={describedBy('cost')}
                onChange={(event) => {
                  setCost(event.target.value)
                }}
              />
              {fieldProblem('cost')}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-notes`}>{t('facilities.maintenance.fields.notes')}</Label>
            <Textarea
              id={`${ids}-notes`}
              rows={3}
              maxLength={NOTES_MAX_LENGTH}
              value={notes}
              disabled={pending}
              data-testid={`${testId}-notes`}
              aria-invalid={invalid('notes')}
              aria-describedby={describedBy('notes')}
              onChange={(event) => {
                setNotes(event.target.value)
              }}
            />
            {fieldProblem('notes')}
          </div>

          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid={`${testId}-problem`}>
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('facilities.common.cancel')}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={pending || (!editing && places.length === 0)}
            data-testid={`${testId}-save`}
            onClick={() => {
              void submit()
            }}
          >
            {pending
              ? t('facilities.common.saving')
              : task
                ? t('facilities.common.save')
                : t('facilities.maintenance.plan.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
