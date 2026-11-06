'use client'
// Small controls shared by the `facilities` backend pages (#121): the place selector above a list or the calendar, the
// weekday chips (a `CrudForm` custom field and the availability dialog) and the empty state of a list, rendered
// outside `DataTable` (lesson `empty-datatable-axe-at-375`).
import * as React from 'react'
import type { CrudCustomFieldRenderProps, CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ISO_WEEKDAYS } from '@vereino/core'

/** The value of the "all places" entry (a Radix select item cannot have an empty value). */
export const ALL_PLACES = 'all'

export function PlaceSelect({
  options,
  value,
  onChange,
  allowAll,
  disabled,
  testId,
}: {
  options: CrudFieldOption[]
  value: string
  onChange: (value: string) => void
  allowAll?: boolean
  disabled?: boolean
  testId?: string
}) {
  const t = useT()
  const id = React.useId()
  return (
    <div className="flex flex-col gap-1 sm:w-80">
      <Label htmlFor={id}>{t('facilities.fields.place')}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} data-testid={testId}>
          <SelectValue placeholder={t('facilities.fields.place.choose')} />
        </SelectTrigger>
        <SelectContent>
          {allowAll ? <SelectItem value={ALL_PLACES}>{t('facilities.fields.place.all')}</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Sorted, distinct ISO weekdays of a value (`CrudForm` keeps whatever was set). */
export function weekdayList(value: unknown): number[] {
  const days = Array.isArray(value) ? value.map(Number).filter((day) => ISO_WEEKDAYS.some((iso) => iso === day)) : []
  return [...new Set(days)].sort((a, b) => a - b)
}

/** Seven toggle chips Mon–Sun; the full day name is the accessible name (WCAG 2.5.3). */
export function WeekdayToggles({
  selected,
  onChange,
  disabled,
  labelledBy,
  ariaLabel,
  describedBy,
  testIdPrefix,
}: {
  selected: readonly number[]
  onChange: (days: number[]) => void
  disabled?: boolean
  labelledBy?: string
  ariaLabel?: string
  describedBy?: string
  testIdPrefix: string
}) {
  const t = useT()
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : ariaLabel}
      aria-describedby={describedBy}
      className="flex flex-wrap gap-2"
    >
      {ISO_WEEKDAYS.map((day) => {
        const on = selected.includes(day)
        return (
          <Button
            key={day}
            type="button"
            size="sm"
            variant={on ? 'default' : 'outline'}
            aria-pressed={on}
            disabled={disabled}
            data-testid={`${testIdPrefix}-${String(day)}`}
            onClick={() => {
              onChange(on ? selected.filter((entry) => entry !== day) : [...selected, day].sort((a, b) => a - b))
            }}
          >
            <span aria-hidden="true">{t(`facilities.weekdays.short.${String(day)}`)}</span>
            <span className="sr-only">{t(`facilities.weekdays.long.${String(day)}`)}</span>
          </Button>
        )
      })}
    </div>
  )
}

/** The weekdays field of the zone rule form. */
export function WeekdaysField({ value, setValue, disabled }: CrudCustomFieldRenderProps) {
  const t = useT()
  return (
    <WeekdayToggles
      selected={weekdayList(value)}
      onChange={setValue}
      disabled={disabled}
      ariaLabel={t('facilities.zones.fields.weekdays')}
      testIdPrefix="facilities-zone-weekday"
    />
  )
}

/** A list page with no rows: its heading, actions and one sentence (and "Clear filters" when filters hide rows). */
export function ListEmptyState({
  title,
  message,
  actions,
  onClearFilters,
  testId,
}: {
  title: string
  message: string
  actions?: React.ReactNode
  onClearFilters?: () => void
  testId?: string
}) {
  const t = useT()
  return (
    <section className="flex flex-col gap-4" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {actions}
      </div>
      <p className="text-muted-foreground text-sm">{message}</p>
      {onClearFilters ? (
        <div>
          <Button type="button" variant="outline" onClick={onClearFilters}>
            {t('facilities.common.clearFilters')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
