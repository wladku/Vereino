'use client'
// The chip rows of the facility calendar (facilities parity spec DD-R03, B-23; #276): a labelled group of chips whose
// current chip carries `aria-current` and stays in view while the row scrolls sideways below the `sm` breakpoint; the seven day
// chips from today with "Other day" (a date field reaching any date) and the left and right arrow keys moving the
// day; above them, with the "to be moved" filter on, how many flagged entries each of the seven days has.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { addDays, isCalendarDate } from '@vereino/core'
import { chipDates } from '../../lib/day-axis'

export type Chip = { value: string; label: string }

export function ChipRow({
  label,
  chips,
  current,
  currentKind = 'true',
  onSelect,
  onKeyDown,
  testId,
  className = '',
}: {
  label: string
  chips: readonly Chip[]
  current: string | null
  currentKind?: 'true' | 'date' | 'page'
  onSelect: (value: string) => void
  onKeyDown?: (event: React.KeyboardEvent) => void
  testId: string
  /** Extra layout classes for the row (the day chips share a row with the date field from `md`). */
  className?: string
}) {
  const currentRef = React.useRef<HTMLButtonElement | null>(null)
  React.useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex max-w-full flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap ${className}`}
      data-testid={testId}
    >
      {chips.map((chip) => {
        const on = chip.value === current
        return (
          <Button
            key={chip.value}
            ref={on ? currentRef : undefined}
            type="button"
            size="sm"
            variant={on ? 'default' : 'outline'}
            className="shrink-0 rounded-full"
            aria-current={on ? currentKind : undefined}
            onClick={() => {
              onSelect(chip.value)
            }}
            onKeyDown={onKeyDown}
            data-testid={`${testId}-${chip.value}`}
          >
            {chip.label}
          </Button>
        )
      })}
    </div>
  )
}

/** "sob., 16.11" — the short weekday and the day of a calendar date in the interface locale. */
export function chipLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

export function DayChips({
  today,
  date,
  onSelect,
  flagged,
}: {
  today: string
  date: string
  onSelect: (date: string) => void
  /** The flagged entries of each chip day, shown while the "to be moved" filter is on. */
  flagged?: ReadonlyMap<string, number> | null
}) {
  const t = useT()
  const locale = useLocale()
  const id = React.useId()
  const dates = chipDates(today)
  // The arrow keys move the day; the date field keeps its own.
  const moveByArrow = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onSelect(addDays(date, event.key === 'ArrowLeft' ? -1 : 1))
  }
  const counted = flagged ? dates.filter((day) => (flagged.get(day) ?? 0) > 0) : []
  return (
    <div className="flex flex-col gap-2">
      {flagged ? (
        <p className="text-sm" data-testid="facilities-calendar-flagged">
          {counted.length === 0
            ? t('facilities.calendar.toMove.none')
            : t('facilities.calendar.toMove.counts', {
                list: counted.map((day) => `${chipLabel(day, locale)}: ${String(flagged.get(day) ?? 0)}`).join(' · '),
              })}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <ChipRow
          label={t('facilities.calendar.dayChips')}
          chips={dates.map((day) => ({ value: day, label: chipLabel(day, locale) }))}
          current={date}
          currentKind="date"
          onSelect={onSelect}
          onKeyDown={moveByArrow}
          testId="facilities-calendar-day"
          className="md:min-w-0 md:flex-1"
        />
        {/* From `md` the chips wrap in the space the date field leaves; the field keeps its width (#495: at 768 px it
            stuck out of the page by 13 px). */}
        <div className="flex items-center gap-2 md:shrink-0">
          <Label htmlFor={`${id}-other`} className="shrink-0">
            {t('facilities.calendar.otherDay')}
          </Label>
          <Input
            id={`${id}-other`}
            type="date"
            className="w-auto"
            value={date}
            onChange={(event) => {
              if (isCalendarDate(event.target.value)) onSelect(event.target.value)
            }}
            data-testid="facilities-calendar-other-day"
          />
        </div>
      </div>
    </div>
  )
}
