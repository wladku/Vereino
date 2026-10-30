'use client'
// The "Recurrence" group of the activity form (club spec J-002, foundation II P-24): a one-off activity on its first
// day, or a weekly series — weekdays, every n weeks, an end (none, until a date, after n sessions) and exception
// dates. The values stay plain form values; `buildActivityBody` turns them into the stored rule text. Weekday chips
// are toggle buttons (`aria-pressed`) with the full weekday name as their accessible name.
import * as React from 'react'
import { X } from 'lucide-react'
import type { CrudFormGroupComponentProps } from '@open-mercato/ui/backend/CrudForm'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { RadioGroup } from '@open-mercato/ui/primitives/radio'
import { RadioField } from '@open-mercato/ui/primitives/radio-field'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { WEEKDAYS } from '@vereino/core'
import { sortedWeekdays, type EndMode, type RepeatMode } from './activity-form-values'

const END_MODES: readonly EndMode[] = ['none', 'until', 'count']

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null
  return (
    <p id={id} className="text-destructive text-xs" role="alert">
      {message}
    </p>
  )
}

export function RecurrenceEditor({ values, setValue, errors }: CrudFormGroupComponentProps) {
  const t = useT()
  const ids = React.useId()
  const [exdateDraft, setExdateDraft] = React.useState('')
  const repeat: RepeatMode = values.repeat === 'once' ? 'once' : 'weekly'
  const byDay = Array.isArray(values.byDay) ? values.byDay.filter((day): day is string => typeof day === 'string') : []
  const endMode: EndMode = END_MODES.includes(values.endMode as EndMode) ? (values.endMode as EndMode) : 'none'
  const exdates = Array.isArray(values.exdates)
    ? values.exdates.filter((date): date is string => typeof date === 'string')
    : []
  const text = (key: string): string => {
    const value = values[key]
    return typeof value === 'string' ? value : ''
  }

  const toggleDay = (day: string) => {
    setValue('byDay', sortedWeekdays(byDay.includes(day) ? byDay.filter((entry) => entry !== day) : [...byDay, day]))
  }
  const addExdate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exdateDraft)) return
    setValue('exdates', [...new Set([...exdates, exdateDraft])].sort())
    setExdateDraft('')
  }

  return (
    <div className="flex flex-col gap-4">
      <FieldError id={`${ids}-server`} message={errors.recurrence} />
      <RadioGroup
        value={repeat}
        aria-label={t('activities.form.recurrence.repeat')}
        onValueChange={(next: string) => {
          setValue('repeat', next === 'once' ? 'once' : 'weekly')
        }}
      >
        <RadioField
          value="weekly"
          data-testid="activities-repeat-weekly"
          label={t('activities.form.recurrence.weekly')}
          description={t('activities.form.recurrence.weekly.help')}
        />
        <RadioField
          value="once"
          data-testid="activities-repeat-once"
          label={t('activities.form.recurrence.once')}
          description={t('activities.form.recurrence.once.help')}
        />
      </RadioGroup>
      {repeat === 'weekly' ? (
        <>
          <div className="flex flex-col gap-2">
            <span id={`${ids}-days`} className="text-sm font-medium">
              {t('activities.form.recurrence.days')}
            </span>
            <div
              role="group"
              aria-labelledby={`${ids}-days`}
              aria-describedby={errors.byDay ? `${ids}-days-error` : undefined}
              className="flex flex-wrap gap-2"
            >
              {WEEKDAYS.map((day) => {
                const selected = byDay.includes(day)
                return (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    aria-pressed={selected}
                    data-testid={`activities-weekday-${day}`}
                    onClick={() => {
                      toggleDay(day)
                    }}
                  >
                    {/* The full name is the accessible name: an `aria-label` without the visible abbreviation
                        fails WCAG 2.5.3 (axe `label-content-name-mismatch`). */}
                    <span aria-hidden="true">{t(`activities.weekdays.short.${day}`)}</span>
                    <span className="sr-only">{t(`activities.weekdays.long.${day}`)}</span>
                  </Button>
                )
              })}
            </div>
            <FieldError id={`${ids}-days-error`} message={errors.byDay} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-interval`}>{t('activities.form.recurrence.interval')}</Label>
            <Input
              id={`${ids}-interval`}
              type="number"
              inputMode="numeric"
              min={1}
              max={52}
              data-testid="activities-recurrence-interval"
              aria-invalid={errors.interval ? true : undefined}
              aria-describedby={`${ids}-interval-help`}
              value={text('interval')}
              onChange={(event) => {
                setValue('interval', event.target.value)
              }}
            />
            <p id={`${ids}-interval-help`} className="text-muted-foreground text-xs">
              {t('activities.form.recurrence.interval.help')}
            </p>
            <FieldError id={`${ids}-interval-error`} message={errors.interval} />
          </div>
          <div className="flex flex-col gap-2">
            <span id={`${ids}-end`} className="text-sm font-medium">
              {t('activities.form.recurrence.end')}
            </span>
            <RadioGroup
              value={endMode}
              aria-labelledby={`${ids}-end`}
              onValueChange={(next: string) => {
                setValue('endMode', END_MODES.includes(next as EndMode) ? next : 'none')
              }}
            >
              {END_MODES.map((mode) => (
                <RadioField
                  key={mode}
                  value={mode}
                  data-testid={`activities-recurrence-end-${mode}`}
                  label={t(`activities.form.recurrence.end.${mode}`)}
                />
              ))}
            </RadioGroup>
            {endMode === 'until' ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-until`}>{t('activities.form.recurrence.until')}</Label>
                <Input
                  id={`${ids}-until`}
                  type="date"
                  data-testid="activities-recurrence-until"
                  aria-invalid={errors.until ? true : undefined}
                  value={text('until')}
                  onChange={(event) => {
                    setValue('until', event.target.value)
                  }}
                />
                <FieldError id={`${ids}-until-error`} message={errors.until} />
              </div>
            ) : null}
            {endMode === 'count' ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${ids}-count`}>{t('activities.form.recurrence.count')}</Label>
                <Input
                  id={`${ids}-count`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  data-testid="activities-recurrence-count"
                  aria-invalid={errors.count ? true : undefined}
                  value={text('count')}
                  onChange={(event) => {
                    setValue('count', event.target.value)
                  }}
                />
                <FieldError id={`${ids}-count-error`} message={errors.count} />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${ids}-exdate`}>{t('activities.form.recurrence.exdates')}</Label>
            <p className="text-muted-foreground text-xs">{t('activities.form.recurrence.exdates.help')}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={`${ids}-exdate`}
                type="date"
                data-testid="activities-exdate-input"
                value={exdateDraft}
                onChange={(event) => {
                  setExdateDraft(event.target.value)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addExdate()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                data-testid="activities-exdate-add"
                disabled={!exdateDraft}
                onClick={addExdate}
              >
                {t('activities.form.recurrence.exdates.add')}
              </Button>
            </div>
            {exdates.length > 0 ? (
              <ul className="flex flex-wrap gap-2" aria-label={t('activities.form.recurrence.exdates')}>
                {exdates.map((date) => (
                  <li key={date} className="bg-muted flex items-center gap-1 rounded-md py-1 pr-1 pl-2 text-sm">
                    <span>{date}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label={t('activities.form.recurrence.exdates.remove', { date })}
                      data-testid={`activities-exdate-remove-${date}`}
                      onClick={() => {
                        setValue(
                          'exdates',
                          exdates.filter((entry) => entry !== date),
                        )
                      }}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
