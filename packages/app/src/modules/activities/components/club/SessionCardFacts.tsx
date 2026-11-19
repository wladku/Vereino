'use client'
// The facts a session card shows on Today and on the session page (groups and activities parity spec REQ-A13; README
// M-02, M-04; E10-S07 #272): the type badge, the section with its coloured dot (never by colour alone), the map link of
// an external place or a typed venue, and "substitute: {name}" when a substitute leads it. The colour comes from the
// shared calendar marker rule, so a section keeps its colour across the member pages.
import * as React from 'react'
import { ChartLegendDot } from '@open-mercato/ui/primitives/chart-legend'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { sectionMarkerColors } from '@vereino/ui'
import { cardMapHref } from '../../lib/venue'
import type { CalendarOccurrence } from './club-client'

export function SessionCardFacts({
  occurrence,
  sectionIds,
  className,
  showMap = true,
}: {
  occurrence: CalendarOccurrence
  /** The sections shown on the same page, so the dot matches the page's other cards. */
  sectionIds?: readonly string[]
  className?: string
  /** False where the page shows the place with its own map link (the session page). */
  showMap?: boolean
}) {
  const t = useT()
  const color = sectionMarkerColors(sectionIds ?? [occurrence.sectionId]).get(occurrence.sectionId)
  const mapHref = !showMap
    ? null
    : cardMapHref({
        name: occurrence.placeName,
        address: occurrence.placeAddress,
        geoLat: occurrence.placeGeoLat,
        geoLng: occurrence.placeGeoLng,
        placeExternal: occurrence.placeExternal,
      })
  const substitute = occurrence.substituteForPersonId && occurrence.coachName ? occurrence.coachName : null
  const clubEvent = occurrence.clubEvent ?? null
  return (
    <div
      className={className ?? 'flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-sm'}
      data-testid="session-facts"
    >
      {/* Club events spec REQ-T03 (M-02, M-04): the event a part belongs to, linked once its page is public. */}
      {clubEvent ? (
        <span className="w-full font-medium" data-testid="session-facts-club-event">
          {clubEvent.publicPath ? (
            <a href={clubEvent.publicPath} className="text-primary inline-flex min-h-11 items-center underline">
              {clubEvent.name}
            </a>
          ) : (
            clubEvent.name
          )}
        </span>
      ) : null}
      {occurrence.activityType ? (
        <span data-testid="session-facts-type">
          <StatusBadge variant="neutral">{t(`activities.types.${occurrence.activityType}`)}</StatusBadge>
        </span>
      ) : null}
      {occurrence.sectionName ? (
        <span className="text-muted-foreground flex items-center gap-1" data-testid="session-facts-section">
          <ChartLegendDot color={color} />
          {occurrence.sectionName}
        </span>
      ) : null}
      {mapHref ? (
        <a
          href={mapHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary inline-flex min-h-11 items-center underline"
          data-testid="session-facts-map"
        >
          {t('activities.club.card.map')}
          <span className="sr-only"> — {occurrence.placeName}</span>
        </a>
      ) : null}
      {substitute ? (
        <span data-testid="session-facts-substitute">
          {t('activities.club.session.substituteCoach', { name: substitute })}
        </span>
      ) : null}
    </div>
  )
}
