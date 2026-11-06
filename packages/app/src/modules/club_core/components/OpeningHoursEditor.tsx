'use client'
// The opening-hours field of the place form (facilities spec DD-41, #121): seasons `MM-DD`–`MM-DD`, each with
// per-weekday windows. An empty list means the place takes its parent's hours (or has no limit). The order of the
// windows, overlaps and seasons covering a date twice are checked by the server (422 at the field).
import * as React from 'react'
import type { CrudCustomFieldRenderProps } from '@open-mercato/ui/backend/CrudForm'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { OpeningHours } from '@vereino/core'

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

export type WindowDraft = { weekday: number; from: string; to: string }
export type SeasonDraft = { from: string; to: string; windows: WindowDraft[] }

/** The editor's drafts of stored hours (null → no seasons). */
export function openingHoursDrafts(hours: OpeningHours | null | undefined): SeasonDraft[] {
  return (hours?.seasons ?? []).map((season) => ({
    from: season.from,
    to: season.to,
    windows: season.windows.map((window) => ({ weekday: window.weekday, from: window.from, to: window.to })),
  }))
}

/** The payload of the drafts: null without seasons, so the place inherits again. */
export function openingHoursPayload(value: unknown): OpeningHours | null {
  const seasons = Array.isArray(value) ? (value as SeasonDraft[]) : []
  if (seasons.length === 0) return null
  return {
    seasons: seasons.map((season) => ({
      from: season.from.trim(),
      to: season.to.trim(),
      windows: season.windows.map((window) => ({ weekday: window.weekday, from: window.from, to: window.to })),
    })),
  }
}

const NEW_SEASON: SeasonDraft = {
  from: '01-01',
  to: '12-31',
  windows: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, from: '08:00', to: '22:00' })),
}

export function OpeningHoursEditor({ value, setValue, disabled }: CrudCustomFieldRenderProps) {
  const t = useT()
  const seasons = Array.isArray(value) ? (value as SeasonDraft[]) : []
  const updateSeason = (index: number, patch: Partial<SeasonDraft>) => {
    setValue(seasons.map((season, position) => (position === index ? { ...season, ...patch } : season)))
  }
  const updateWindow = (seasonIndex: number, windowIndex: number, patch: Partial<WindowDraft>) => {
    const season = seasons[seasonIndex]
    updateSeason(seasonIndex, {
      windows: season.windows.map((window, position) => (position === windowIndex ? { ...window, ...patch } : window)),
    })
  }
  return (
    <div className="flex flex-col gap-4" data-testid="place-opening-hours">
      {seasons.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('club_core.places.openingHours.inherited')}</p>
      ) : null}
      {seasons.map((season, seasonIndex) => (
        <fieldset key={seasonIndex} className="flex flex-col gap-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            {t('club_core.places.openingHours.season', { number: seasonIndex + 1 })}
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input
              aria-label={t('club_core.places.openingHours.seasonFrom')}
              placeholder={t('club_core.places.openingHours.monthDayPlaceholder')}
              value={season.from}
              disabled={disabled}
              onChange={(event) => {
                updateSeason(seasonIndex, { from: event.target.value })
              }}
            />
            <Input
              aria-label={t('club_core.places.openingHours.seasonTo')}
              placeholder={t('club_core.places.openingHours.monthDayPlaceholder')}
              value={season.to}
              disabled={disabled}
              onChange={(event) => {
                updateSeason(seasonIndex, { to: event.target.value })
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                setValue(seasons.filter((_season, position) => position !== seasonIndex))
              }}
            >
              {t('club_core.places.openingHours.removeSeason')}
            </Button>
          </div>
          {season.windows.map((window, windowIndex) => (
            <div key={windowIndex} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <select
                aria-label={t('club_core.places.openingHours.weekday')}
                className="bg-background h-9 rounded-md border px-2 text-sm"
                value={window.weekday}
                disabled={disabled}
                onChange={(event) => {
                  updateWindow(seasonIndex, windowIndex, { weekday: Number(event.target.value) })
                }}
              >
                {WEEKDAYS.map((weekday) => (
                  <option key={weekday} value={weekday}>
                    {t(`club_core.places.openingHours.weekdays.${String(weekday)}`)}
                  </option>
                ))}
              </select>
              <Input
                type="time"
                aria-label={t('club_core.places.openingHours.from')}
                value={window.from}
                disabled={disabled}
                onChange={(event) => {
                  updateWindow(seasonIndex, windowIndex, { from: event.target.value })
                }}
              />
              <Input
                type="time"
                aria-label={t('club_core.places.openingHours.to')}
                value={window.to}
                disabled={disabled}
                onChange={(event) => {
                  updateWindow(seasonIndex, windowIndex, { to: event.target.value })
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  updateSeason(seasonIndex, {
                    windows: season.windows.filter((_window, position) => position !== windowIndex),
                  })
                }}
              >
                {t('club_core.places.openingHours.removeWindow')}
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => {
                updateSeason(seasonIndex, {
                  windows: [...season.windows, { weekday: 6, from: '09:00', to: '20:00' }],
                })
              }}
            >
              {t('club_core.places.openingHours.addWindow')}
            </Button>
          </div>
        </fieldset>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setValue([...seasons, { ...NEW_SEASON, windows: NEW_SEASON.windows.map((window) => ({ ...window })) }])
          }}
        >
          {t('club_core.places.openingHours.addSeason')}
        </Button>
      </div>
    </div>
  )
}
