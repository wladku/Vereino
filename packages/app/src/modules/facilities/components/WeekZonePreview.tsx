'use client'
// The week preview of a place's zones (facilities spec B-26 "week preview", B-23; #121): the seven days of a week
// with the effective zone segments (`dayZoneSegments` — the higher priority wins). Every segment names its zone in
// text, so the preview and its legend do not rely on color; on a phone the days stack as a list. With rentals (#122,
// `facilities.rentals.manage`) the days also list the place's active rentals as "booked" blocks with the renter (the
// ones to be moved are marked), and every bookable, paid segment offers "New rental" from its start.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tag, type TagMap } from '@open-mercato/ui/primitives/tag'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { addDays, isoWeekdayOf } from '@vereino/core'
import { ZONES, dayZoneSegments, weekDates, type Zone, type ZoneRuleShape } from '../lib/zones'
import { errorMessage, localToday, zoneLabel, type ZoneRuleRow } from './facilities-client'
import {
  RENTALS_API,
  RENTALS_KEY,
  localDateOf,
  localDayStart,
  localTimeOf,
  rentalStatusLabel,
  type RentalRow,
} from './rentals-client'

const ZONE_TAGS: TagMap<Zone> = {
  public_free: 'success',
  club_training: 'info',
  reservable_paid: 'warning',
  closed: 'error',
}

/** The rows the preview can place: a zone, a source and a start of validity are present. */
export function previewRules(rows: readonly ZoneRuleRow[]): ZoneRuleShape[] {
  const rules: ZoneRuleShape[] = []
  for (const row of rows) {
    if (!row.zone || !row.source || !row.validFrom) continue
    rules.push({
      id: row.id,
      placeId: row.placeId,
      weekdays: row.weekdays,
      timeFrom: row.timeFrom,
      timeTo: row.timeTo,
      zone: row.zone,
      priority: row.priority,
      source: row.source,
      validFrom: row.validFrom,
      validTo: row.validTo,
    })
  }
  return rules
}

export function ZoneLegend() {
  const t = useT()
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t('facilities.preview.legend')}</h3>
      <ul className="flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:gap-4">
        {ZONES.map((zone) => (
          <li key={zone} className="flex items-center gap-2">
            <Tag variant={ZONE_TAGS[zone]} dot>
              {zoneLabel(t, zone)}
            </Tag>
            <span className="text-muted-foreground">{t(`facilities.zones.zone.${zone}.help`)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The rentals of a week grouped by their local start date, in start order. */
export function rentalsByDate(rentals: readonly RentalRow[]): Map<string, RentalRow[]> {
  const byDate = new Map<string, RentalRow[]>()
  for (const rental of [...rentals].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const date = localDateOf(rental.startsAt)
    const list = byDate.get(date) ?? []
    list.push(rental)
    byDate.set(date, list)
  }
  return byDate
}

/** The active rentals of a place in a week (up to 200, the list maximum); idle without a place. */
function useWeekRentals(placeId: string | null, dates: readonly string[], enabled: boolean) {
  const first = dates[0] ?? ''
  const last = dates[6] ?? ''
  return useQuery({
    queryKey: [RENTALS_KEY, 'week', placeId, first],
    enabled: enabled && Boolean(placeId) && Boolean(first),
    queryFn: () =>
      fetchCrudList<RentalRow>(RENTALS_API, {
        placeId,
        tab: 'active',
        endsAfter: localDayStart(first),
        startsBefore: localDayStart(addDays(last, 1)),
        pageSize: 200,
        sortField: 'startsAt',
        sortDir: 'asc',
      }),
  })
}

export type NewRentalSlot = { date: string; time: string }

function RentalBlock({ rental }: { rental: RentalRow }) {
  const t = useT()
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-dashed p-1 text-xs"
      data-testid={`facilities-calendar-rental-${rental.id}`}
    >
      <span className="font-medium tabular-nums">
        {localTimeOf(rental.startsAt)}–{localTimeOf(rental.endsAt)}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <StatusBadge variant="info">{t('facilities.calendar.rentals.booked')}</StatusBadge>
        {rental.needsReschedule ? (
          <StatusBadge variant="warning">{t('facilities.rentals.flags.needsReschedule')}</StatusBadge>
        ) : null}
      </span>
      <span className="break-words">{rental.renterDisplayName ?? t('facilities.common.empty')}</span>
      <span className="text-muted-foreground">{rentalStatusLabel(t, rental.status)}</span>
    </li>
  )
}

export function WeekZonePreview({
  rows,
  testId = 'facilities-week-preview',
  placeId = null,
  rentalsEnabled = false,
  onNewRental,
}: {
  rows: readonly ZoneRuleRow[]
  testId?: string
  /** The place whose rentals the week shows (with `rentalsEnabled`). */
  placeId?: string | null
  rentalsEnabled?: boolean
  onNewRental?: (slot: NewRentalSlot) => void
}) {
  const t = useT()
  const headingId = React.useId()
  const [anchor, setAnchor] = React.useState(localToday)
  const rules = React.useMemo(() => previewRules(rows), [rows])
  const dates = React.useMemo(() => weekDates(anchor), [anchor])
  const today = localToday()
  const rentals = useWeekRentals(placeId, dates, rentalsEnabled)
  const byDate = React.useMemo(() => rentalsByDate(rentals.data?.items ?? []), [rentals.data])

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-md border p-4" data-testid={testId}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 id={headingId} className="text-lg font-semibold">
          {t('facilities.preview.title', { from: dates[0] ?? '', to: dates[6] ?? '' })}
        </h2>
        <nav aria-label={t('facilities.preview.navigation')} className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAnchor((current) => addDays(current, -7))
            }}
          >
            {t('facilities.preview.previous')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAnchor(localToday())
            }}
          >
            {t('facilities.preview.current')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAnchor((current) => addDays(current, 7))
            }}
          >
            {t('facilities.preview.next')}
          </Button>
        </nav>
      </div>
      {rentalsEnabled && rentals.error ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage(rentals.error, t('facilities.rentals.errors.load'))}
        </p>
      ) : null}
      {rentalsEnabled && placeId && rentals.isLoading ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t('facilities.calendar.rentals.loading')}
        </p>
      ) : null}
      <ol className="grid grid-cols-1 gap-3 lg:grid-cols-7">
        {dates.map((date) => {
          const segments = dayZoneSegments(rules, date)
          const dayRentals = byDate.get(date) ?? []
          return (
            <li key={date} className="flex flex-col gap-2 rounded-md border p-2" data-testid={`${testId}-${date}`}>
              <h3 className="text-sm font-medium">
                {t(`facilities.weekdays.long.${String(isoWeekdayOf(date))}`)} {date}
                {date === today ? (
                  <span className="text-muted-foreground"> · {t('facilities.preview.today')}</span>
                ) : null}
              </h3>
              {segments.length === 0 ? (
                <p className="text-muted-foreground text-xs">{t('facilities.preview.noZone')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {segments.map((segment) => (
                    <li key={`${segment.from}-${segment.to}`} className="flex flex-col gap-1 text-xs">
                      <span className="font-medium tabular-nums">
                        {segment.from}–{segment.to}
                      </span>
                      <Tag variant={ZONE_TAGS[segment.zone]} dot>
                        {zoneLabel(t, segment.zone)}
                      </Tag>
                      {rentalsEnabled && onNewRental && segment.zone === 'reservable_paid' ? (
                        <div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-testid={`facilities-calendar-new-rental-${date}-${segment.from}`}
                            onClick={() => {
                              onNewRental({ date, time: segment.from })
                            }}
                          >
                            {t('facilities.rentals.actions.create')}
                            <span className="sr-only">
                              {' '}
                              {t('facilities.calendar.rentals.newAt', {
                                day: t(`facilities.weekdays.long.${String(isoWeekdayOf(date))}`),
                                date,
                                time: segment.from,
                              })}
                            </span>
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {dayRentals.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-medium">{t('facilities.calendar.rentals.title')}</h4>
                  <ul className="flex flex-col gap-1">
                    {dayRentals.map((rental) => (
                      <RentalBlock key={rental.id} rental={rental} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
      <ZoneLegend />
    </section>
  )
}
