'use client'
// The "Set booking availability" dialog of the facility calendar (facilities spec B-23, REQ-029; #121): one or more
// places, weekdays as chips with shortcuts, one range for all days or different hours per day, a validity period and
// "replace existing availability" (default) or "add". Obvious mistakes are caught here; the server checks again and a
// 422 names the day (`dayErrors`), shown next to it. A 409 overlap is shown as the dialog error.
import * as React from 'react'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
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
import { RadioGroup } from '@open-mercato/ui/primitives/radio'
import { RadioField } from '@open-mercato/ui/primitives/radio-field'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ISO_WEEKDAYS, isWallTime, minutesOfDay } from '@vereino/core'
import { MIN_AVAILABILITY_MINUTES } from '../lib/zones'
import { WeekdayToggles } from './FacilitiesControls'
import { ZONE_RULES_BULK_URL, codedMessage, errorMessage, localToday, type Translate } from './facilities-client'

/** `POST /api/facilities/zone-rules/bulk` → 200. */
export type BulkResult = {
  created: number
  removed: number
  warnings: { clubOccurrencesInWindows: number; pendingRequestsOutside: number }
}

type HoursMode = 'same' | 'perDay'
type WriteMode = 'replace' | 'append'
type Hours = { from: string; to: string }
type DayError = { placeId?: string; weekday: number; code: string }

const WORKDAYS = [1, 2, 3, 4, 5]
const WEEKEND = [6, 7]
const DEFAULT_HOURS: Hours = { from: '16:00', to: '22:00' }

/** The client-side problem of one window, as the server's code; null when it looks fine. */
function windowProblem(hours: Hours): string | null {
  if (!isWallTime(hours.from) || !isWallTime(hours.to)) return 'availability_time_order'
  const start = minutesOfDay(hours.from)
  const end = minutesOfDay(hours.to)
  if (end <= start) return 'availability_time_order'
  if (end - start < MIN_AVAILABILITY_MINUTES) return 'availability_too_short'
  return null
}

function dayErrorsOf(error: unknown): DayError[] {
  const list = (error as { dayErrors?: unknown } | null)?.dayErrors
  if (!Array.isArray(list)) return []
  return list.filter(
    (entry): entry is DayError =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as DayError).weekday === 'number' &&
      typeof (entry as DayError).code === 'string',
  )
}

/** "At least 90 minutes." or "Pitch A: At least 90 minutes." when several places are saved. */
function dayMessages(t: Translate, errors: DayError[], names: Map<string, string>, many: boolean): Map<number, string> {
  const messages = new Map<number, string[]>()
  for (const entry of errors) {
    const text = t(`facilities.errors.${entry.code}`)
    const place = many && entry.placeId ? names.get(entry.placeId) : undefined
    const line = place ? `${place}: ${text}` : text
    const lines = messages.get(entry.weekday) ?? []
    if (!lines.includes(line)) lines.push(line)
    messages.set(entry.weekday, lines)
  }
  return new Map([...messages.entries()].map(([day, lines]) => [day, lines.join(' ')]))
}

function DayProblem({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null
  return (
    <p id={id} className="text-destructive text-xs" role="alert">
      {message}
    </p>
  )
}

export function AvailabilityDialog({
  open,
  onOpenChange,
  places,
  initialPlaceId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  places: CrudFieldOption[]
  initialPlaceId: string | null
  onSaved: (result: BulkResult) => Promise<void>
}) {
  const t = useT()
  const ids = React.useId()
  const [placeIds, setPlaceIds] = React.useState<string[]>(initialPlaceId ? [initialPlaceId] : [])
  const [days, setDays] = React.useState<number[]>(WORKDAYS)
  const [hoursMode, setHoursMode] = React.useState<HoursMode>('same')
  const [hours, setHours] = React.useState<Hours>(DEFAULT_HOURS)
  const [perDay, setPerDay] = React.useState<Record<number, Hours>>({})
  const [validFrom, setValidFrom] = React.useState(localToday)
  const [validTo, setValidTo] = React.useState('')
  const [writeMode, setWriteMode] = React.useState<WriteMode>('replace')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [dayErrors, setDayErrors] = React.useState<Map<number, string>>(new Map())

  const names = React.useMemo(() => new Map(places.map((place) => [place.value, place.label])), [places])
  const hoursOf = (day: number): Hours => (hoursMode === 'same' ? hours : (perDay[day] ?? hours))

  const validate = (): boolean => {
    const errors = new Map<number, string>()
    for (const day of days) {
      const code = windowProblem(hoursOf(day))
      if (code) errors.set(day, t(`facilities.errors.${code}`))
    }
    let message: string | null = null
    if (placeIds.length === 0) message = t('facilities.availability.errors.places')
    else if (days.length === 0) message = t('facilities.availability.errors.days')
    else if (!validFrom) message = t('facilities.availability.errors.validFrom')
    else if (validTo && validTo < validFrom) message = t('facilities.errors.validity_inverted')
    else if (errors.size > 0) message = t('facilities.availability.errors.dayProblems')
    setDayErrors(errors)
    setProblem(message)
    return message === null
  }

  const submit = async () => {
    if (pending || !validate()) return
    setPending(true)
    try {
      const call = await apiCallOrThrow<BulkResult>(
        ZONE_RULES_BULK_URL,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            placeIds,
            mode: writeMode,
            validFrom,
            validTo: validTo || null,
            weekdays: days,
            windows: days.map((day) => ({ weekday: day, ...hoursOf(day) })),
          }),
        },
        { errorMessage: t('facilities.availability.errors.save') },
      )
      onOpenChange(false)
      await onSaved(
        call.result ?? { created: 0, removed: 0, warnings: { clubOccurrencesInWindows: 0, pendingRequestsOutside: 0 } },
      )
    } catch (error: unknown) {
      const perDayErrors = dayErrorsOf(error)
      if (perDayErrors.length > 0) {
        setDayErrors(dayMessages(t, perDayErrors, names, placeIds.length > 1))
        setProblem(t('facilities.availability.errors.dayProblems'))
      } else {
        // 409 `zone_rule_overlap` and the other coded refusals belong to the whole dialog.
        setDayErrors(new Map())
        setProblem(codedMessage(error, t) ?? errorMessage(error, t('facilities.availability.errors.save')))
      }
    } finally {
      setPending(false)
    }
  }

  const togglePlace = (placeId: string, checked: boolean) => {
    setPlaceIds((current) =>
      checked ? [...new Set([...current, placeId])] : current.filter((entry) => entry !== placeId),
    )
  }

  const shortcut = (label: string, selection: number[], testId: string) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      data-testid={testId}
      onClick={() => {
        setDays(selection)
      }}
    >
      {label}
    </Button>
  )

  const timeInput = (day: number | null, field: keyof Hours) => {
    const value = day === null ? hours[field] : hoursOf(day)[field]
    const inputId = `${ids}-${String(day ?? 'all')}-${field}`
    const errorId = `${ids}-${String(day ?? 'all')}-error`
    return (
      <div className="flex flex-col gap-1">
        <Label htmlFor={inputId}>
          {field === 'from' ? t('facilities.fields.from') : t('facilities.fields.to')}
          {day === null ? null : <span className="sr-only"> {t(`facilities.weekdays.long.${String(day)}`)}</span>}
        </Label>
        <Input
          id={inputId}
          type="time"
          step={300}
          value={value}
          disabled={pending}
          aria-invalid={day !== null && dayErrors.has(day) ? true : undefined}
          aria-describedby={day !== null && dayErrors.has(day) ? errorId : undefined}
          data-testid={`facilities-availability-${String(day ?? 'all')}-${field}`}
          onChange={(event) => {
            const next = event.target.value
            if (day === null) setHours((current) => ({ ...current, [field]: next }))
            else setPerDay((current) => ({ ...current, [day]: { ...hoursOf(day), [field]: next } }))
          }}
        />
      </div>
    )
  }

  const sameModeErrors = hoursMode === 'same' ? days.filter((day) => dayErrors.has(day)) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-availability-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.availability.title')}</DialogTitle>
          <DialogDescription>{t('facilities.availability.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('facilities.availability.places')}</legend>
            {places.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('facilities.availability.noPlaces')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {places.map((place) => {
                  const checkboxId = `${ids}-place-${place.value}`
                  return (
                    <li key={place.value} className="flex items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={placeIds.includes(place.value)}
                        disabled={pending}
                        onCheckedChange={(value) => {
                          togglePlace(place.value, value === true)
                        }}
                      />
                      <Label htmlFor={checkboxId}>{place.label}</Label>
                    </li>
                  )
                })}
              </ul>
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <span id={`${ids}-days`} className="text-sm font-medium">
              {t('facilities.availability.days')}
            </span>
            <WeekdayToggles
              selected={days}
              onChange={setDays}
              disabled={pending}
              labelledBy={`${ids}-days`}
              testIdPrefix="facilities-availability-day"
            />
            <div className="flex flex-wrap gap-2">
              {shortcut(t('facilities.availability.shortcuts.workdays'), WORKDAYS, 'facilities-availability-workdays')}
              {shortcut(t('facilities.availability.shortcuts.weekend'), WEEKEND, 'facilities-availability-weekend')}
              {shortcut(
                t('facilities.availability.shortcuts.everyDay'),
                [...ISO_WEEKDAYS],
                'facilities-availability-every-day',
              )}
              {shortcut(t('facilities.availability.shortcuts.clear'), [], 'facilities-availability-clear')}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span id={`${ids}-hours-mode`} className="text-sm font-medium">
              {t('facilities.availability.hoursMode')}
            </span>
            <SegmentedControl
              value={hoursMode}
              onValueChange={(next: string) => {
                setHoursMode(next === 'perDay' ? 'perDay' : 'same')
                setDayErrors(new Map())
              }}
              aria-labelledby={`${ids}-hours-mode`}
              data-testid="facilities-availability-hours-mode"
            >
              <SegmentedControlItem value="same">{t('facilities.availability.hoursMode.same')}</SegmentedControlItem>
              <SegmentedControlItem value="perDay">
                {t('facilities.availability.hoursMode.perDay')}
              </SegmentedControlItem>
            </SegmentedControl>
            {hoursMode === 'same' ? (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-3 sm:w-80">
                  {timeInput(null, 'from')}
                  {timeInput(null, 'to')}
                </div>
                {sameModeErrors.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {sameModeErrors.map((day) => (
                      <li key={day} className="text-destructive text-xs" role="alert">
                        {t(`facilities.weekdays.long.${String(day)}`)}: {dayErrors.get(day)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : days.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('facilities.availability.errors.days')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {days.map((day) => (
                  <li
                    key={day}
                    className="flex flex-col gap-2 rounded-md border p-2"
                    data-testid={`facilities-availability-row-${String(day)}`}
                  >
                    <span className="text-sm font-medium">{t(`facilities.weekdays.long.${String(day)}`)}</span>
                    <div className="grid grid-cols-2 gap-3 sm:w-80">
                      {timeInput(day, 'from')}
                      {timeInput(day, 'to')}
                    </div>
                    <DayProblem id={`${ids}-${String(day)}-error`} message={dayErrors.get(day)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-valid-from`}>{t('facilities.fields.validFrom')}</Label>
              <Input
                id={`${ids}-valid-from`}
                type="date"
                required
                value={validFrom}
                disabled={pending}
                onChange={(event) => {
                  setValidFrom(event.target.value)
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-valid-to`}>{t('facilities.fields.validTo')}</Label>
              <Input
                id={`${ids}-valid-to`}
                type="date"
                value={validTo}
                disabled={pending}
                aria-describedby={`${ids}-valid-to-help`}
                onChange={(event) => {
                  setValidTo(event.target.value)
                }}
              />
              <p id={`${ids}-valid-to-help`} className="text-muted-foreground text-xs">
                {t('facilities.fields.validTo.help')}
              </p>
            </div>
          </div>

          <RadioGroup
            value={writeMode}
            aria-label={t('facilities.availability.writeMode')}
            onValueChange={(next: string) => {
              setWriteMode(next === 'append' ? 'append' : 'replace')
            }}
          >
            <RadioField
              value="replace"
              data-testid="facilities-availability-replace"
              label={t('facilities.availability.writeMode.replace')}
              description={t('facilities.availability.writeMode.replace.help')}
            />
            <RadioField
              value="append"
              data-testid="facilities-availability-append"
              label={t('facilities.availability.writeMode.append')}
              description={t('facilities.availability.writeMode.append.help')}
            />
          </RadioGroup>

          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-availability-problem">
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
            {t('facilities.common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={pending}
            data-testid="facilities-availability-save"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
