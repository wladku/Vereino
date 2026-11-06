'use client'
// The week preview of a place's zones (facilities spec B-26 "week preview", B-23; #121): the seven days of a week
// with the effective zone segments (`dayZoneSegments` — the higher priority wins). Every segment names its zone in
// text, so the preview and its legend do not rely on color; on a phone the days stack as a list.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tag, type TagMap } from '@open-mercato/ui/primitives/tag'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { addDays, isoWeekdayOf } from '@vereino/core'
import { ZONES, dayZoneSegments, weekDates, type Zone, type ZoneRuleShape } from '../lib/zones'
import { localToday, zoneLabel, type ZoneRuleRow } from './facilities-client'

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

export function WeekZonePreview({
  rows,
  testId = 'facilities-week-preview',
}: {
  rows: readonly ZoneRuleRow[]
  testId?: string
}) {
  const t = useT()
  const headingId = React.useId()
  const [anchor, setAnchor] = React.useState(localToday)
  const rules = React.useMemo(() => previewRules(rows), [rows])
  const dates = React.useMemo(() => weekDates(anchor), [anchor])
  const today = localToday()

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
      <ol className="grid grid-cols-1 gap-3 lg:grid-cols-7">
        {dates.map((date) => {
          const segments = dayZoneSegments(rules, date)
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
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
      <ZoneLegend />
    </section>
  )
}
