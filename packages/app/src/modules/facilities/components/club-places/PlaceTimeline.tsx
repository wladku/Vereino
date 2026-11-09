'use client'
// The day timeline of one place (README M-11; #123): 08:00–22:00 of the chosen day in the club's time zone, cut at
// every zone, opening and entry boundary. Every segment names its time, its zone and either the blocks on it
// (sessions, rentals, pending requests, internal bookings with "purpose · booker", closures) or "Free"; nothing relies
// on colour — the kind and the zone are written out, and the text legend explains both. A free segment can be picked
// to prefill the booking range; an own or cancellable booking offers "Cancel". On a phone the segments stack.
// A planned maintenance window (#128) shows its kind of work and who planned it (dotted outline); for a redacted
// reader (a place maintainer) the other blocks say only what occupies the slot ("Taken by the club", "Booked", …).
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tag, type TagMap } from '@open-mercato/ui/primitives/tag'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ZONES, type Zone } from '../../lib/zones'
import {
  ENTRY_KINDS,
  entryLabel,
  entryRange,
  isFreeSegment,
  timeOf,
  type CalendarEntry,
  type CalendarEntryKind,
  type CalendarPlace,
  type TimelineSegment,
} from './places-client'

export const KIND_TAGS: TagMap<CalendarEntryKind> = {
  session: 'info',
  booking: 'success',
  rental: 'warning',
  request: 'neutral',
  closure: 'error',
  maintenance: 'brand',
}

const ZONE_TAGS: TagMap<Zone> = {
  public_free: 'success',
  club_training: 'info',
  reservable_paid: 'warning',
  closed: 'error',
}

/** A dashed outline marks a pending request, a double one a closure: a second cue besides the written kind. */
const KIND_BORDERS: Record<CalendarEntryKind, string> = {
  session: 'border-solid',
  booking: 'border-solid',
  rental: 'border-solid',
  request: 'border-dashed',
  closure: 'border-double border-4',
  maintenance: 'border-dotted border-2',
}

export function TimelineLegend() {
  const t = useT()
  const headingId = React.useId()
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-md border p-3"
      data-testid="club-place-legend"
    >
      <h2 id={headingId} className="text-sm font-medium">
        {t('facilities.places.legend.title')}
      </h2>
      <ul className="flex flex-col gap-1 text-sm">
        {ENTRY_KINDS.map((kind) => (
          <li key={kind} className="flex flex-wrap items-center gap-2">
            <Tag variant={KIND_TAGS[kind]}>{t(`facilities.places.kind.${kind}`)}</Tag>
            <span className="text-muted-foreground">{t(`facilities.places.legend.${kind}`)}</span>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-1 text-sm">
        {ZONES.map((zone) => (
          <li key={zone} className="flex flex-wrap items-center gap-2">
            <Tag variant={ZONE_TAGS[zone]} dot>
              {t(`facilities.zones.zone.${zone}`)}
            </Tag>
            <span className="text-muted-foreground">{t(`facilities.zones.zone.${zone}.help`)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function EntryBlock({
  entry,
  first,
  timeZone,
  placeName,
  redacted,
  onCancel,
}: {
  entry: CalendarEntry
  first: boolean
  timeZone: string
  placeName: string | null
  redacted: boolean
  onCancel: (entry: CalendarEntry) => void
}) {
  const t = useT()
  const label = entryLabel(t, entry, redacted)
  const range = entryRange(entry, timeZone)
  if (!first) {
    return (
      <li className="text-muted-foreground text-sm break-words">
        {t('facilities.places.entry.continues', { label, time: range })}
      </li>
    )
  }
  const cancellable = entry.kind === 'booking' && (entry.own || entry.canCancel)
  return (
    <li
      className={`flex flex-col gap-2 rounded-md border p-2 ${KIND_BORDERS[entry.kind]}`}
      data-testid={`club-place-entry-${entry.id}`}
      data-kind={entry.kind}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tag variant={KIND_TAGS[entry.kind]}>{t(`facilities.places.kind.${entry.kind}`)}</Tag>
        <span className="font-medium tabular-nums">{range}</span>
        {entry.needsReschedule ? <Tag variant="warning">{t('facilities.places.entry.needsReschedule')}</Tag> : null}
      </div>
      <p className="text-sm break-words">
        {entry.kind === 'booking' && entry.bookedByName
          ? t('facilities.places.entry.booking', { purpose: label, booker: entry.bookedByName })
          : entry.kind === 'maintenance' && entry.bookedByName
            ? t('facilities.places.entry.maintenance', { kind: label, planner: entry.bookedByName })
            : label}
      </p>
      {placeName ? (
        <p className="text-muted-foreground text-xs break-words">
          {t('facilities.places.entry.on', { place: placeName })}
        </p>
      ) : null}
      {cancellable ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              onCancel(entry)
            }}
            data-testid={`club-place-cancel-${entry.id}`}
          >
            {t('facilities.places.cancel.action')}
            <span className="sr-only"> {t('facilities.places.cancel.of', { label, time: range })}</span>
          </Button>
        </div>
      ) : null}
    </li>
  )
}

export function PlaceTimeline({
  segments,
  timeZone,
  placeId,
  places,
  selected,
  canBook,
  redacted = false,
  onPick,
  onCancel,
}: {
  segments: readonly TimelineSegment[]
  timeZone: string
  placeId: string
  places: readonly CalendarPlace[]
  selected: { from: string; to: string } | null
  canBook: boolean
  /** A place maintainer's view: the blocks other than maintenance without names. */
  redacted?: boolean
  onPick: (from: string, to: string) => void
  onCancel: (entry: CalendarEntry) => void
}) {
  const t = useT()
  const nameOf = (entry: CalendarEntry) =>
    entry.placeId === placeId ? null : (places.find((place) => place.id === entry.placeId)?.name ?? null)
  return (
    <ol
      className="flex flex-col gap-2"
      aria-label={t('facilities.places.timeline.label')}
      data-testid="club-place-timeline"
    >
      {segments.map((segment) => {
        const from = timeOf(segment.from)
        const to = timeOf(segment.to)
        const free = isFreeSegment(segment)
        const isSelected = selected !== null && selected.from === from && selected.to === to
        return (
          <li
            key={`${from}-${to}`}
            className={`flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start ${isSelected ? 'border-primary bg-muted' : ''}`}
            data-testid={`club-place-segment-${from}`}
            data-free={free ? 'true' : 'false'}
          >
            <div className="flex flex-wrap items-center gap-2 sm:w-56 sm:shrink-0 sm:flex-col sm:items-start">
              <span className="font-medium tabular-nums">
                {from}–{to}
              </span>
              {segment.zone ? (
                <Tag variant={ZONE_TAGS[segment.zone]} dot>
                  {t(`facilities.zones.zone.${segment.zone}`)}
                </Tag>
              ) : (
                <span className="text-muted-foreground text-xs">{t('facilities.places.timeline.noZone')}</span>
              )}
              {!segment.open ? (
                <span className="text-muted-foreground text-xs">{t('facilities.places.timeline.outsideHours')}</span>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {segment.entries.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {segment.entries.map(({ entry, first }) => (
                    <EntryBlock
                      key={`${entry.kind}:${entry.id}`}
                      entry={entry}
                      first={first}
                      timeZone={timeZone}
                      placeName={nameOf(entry)}
                      redacted={redacted}
                      onCancel={onCancel}
                    />
                  ))}
                </ul>
              ) : free ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">{t('facilities.places.timeline.free')}</span>
                  {canBook ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      aria-pressed={isSelected}
                      onClick={() => {
                        onPick(from, to)
                      }}
                      data-testid={`club-place-pick-${from}`}
                    >
                      {t('facilities.places.timeline.pick')}
                      <span className="sr-only">
                        {' '}
                        {t('facilities.places.timeline.pickRange', { time: `${from}–${to}` })}
                      </span>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">{t('facilities.places.timeline.unavailable')}</span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
