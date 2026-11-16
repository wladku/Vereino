'use client'
// "Wpisy dnia" under the day axis (facilities parity spec B-23, REQ-R01; #276): every entry of the day as text — the
// axis's blocks are never the only carrier of information — with its time, kind, what it is and the action the page
// gives it. Also the entry text both the list and the axis blocks show (the mockup's labels: "Wynajem: {renter}",
// "Zgłoszenie: {renter} (czeka na akceptację)", "Zamknięte: {note}").
import * as React from 'react'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { KIND_TAGS } from '../club-places/PlaceTimeline'
import { entryLabel, entryRange, type CalendarEntry, type Translate } from '../club-places/places-client'

/** What an entry is, as the axis block and the list name it; a redacted reader sees only what occupies the slot. */
export function dayEntryText(t: Translate, entry: CalendarEntry, redacted = false): string {
  const label = entryLabel(t, entry, redacted)
  if (redacted && entry.kind !== 'maintenance') return label
  switch (entry.kind) {
    case 'session':
      return entry.groupName ? t('facilities.axis.entry.session', { name: label, group: entry.groupName }) : label
    case 'booking':
      return entry.bookedByName
        ? t('facilities.places.entry.booking', { purpose: label, booker: entry.bookedByName })
        : label
    case 'rental':
      return t('facilities.axis.entry.rental', { renter: label })
    case 'request':
      return t('facilities.axis.entry.request', { renter: label })
    case 'closure':
      return t('facilities.axis.entry.closure', { note: label })
    default:
      return entry.bookedByName
        ? t('facilities.places.entry.maintenance', { kind: label, planner: entry.bookedByName })
        : label
  }
}

export function DayEntries({
  entries,
  timeZone,
  placeId,
  redacted = false,
  filtered = false,
  actionOf,
}: {
  entries: readonly CalendarEntry[]
  timeZone: string
  /** The shown place; an entry on another place of its family names that place. */
  placeId: string
  redacted?: boolean
  /** The "to be moved" filter is on: the empty text says so. */
  filtered?: boolean
  actionOf?: (entry: CalendarEntry) => React.ReactNode
}) {
  const t = useT()
  const headingId = React.useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2" data-testid="facilities-day-entries">
      <h2 id={headingId} className="text-lg font-semibold">
        {t('facilities.calendar.dayEntries')}
      </h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm" data-testid="facilities-day-entries-empty">
          {t(filtered ? 'facilities.calendar.dayEntries.emptyFiltered' : 'facilities.calendar.dayEntries.empty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {entries.map((entry) => {
            const status = (entry.kind === 'rental' || entry.kind === 'request') && entry.status && !redacted
            return (
              <li
                key={`${entry.kind}:${entry.id}`}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`facilities-day-entry-${entry.id}`}
                data-kind={entry.kind}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm break-words">
                    <span className="font-medium tabular-nums">{entryRange(entry, timeZone)}</span>
                    {' · '}
                    {dayEntryText(t, entry, redacted)}
                    {status ? ` · ${t(`facilities.rentals.status.${entry.status as string}`)}` : null}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag variant={KIND_TAGS[entry.kind]}>{t(`facilities.places.kind.${entry.kind}`)}</Tag>
                    {entry.needsReschedule ? (
                      <Tag variant="warning">{t('facilities.places.entry.needsReschedule')}</Tag>
                    ) : null}
                    {entry.placeId !== placeId && entry.placeName ? (
                      <span className="text-muted-foreground text-xs break-words">
                        {t('facilities.places.entry.on', { place: entry.placeName })}
                      </span>
                    ) : null}
                  </div>
                </div>
                {actionOf ? <div className="shrink-0">{actionOf(entry)}</div> : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
