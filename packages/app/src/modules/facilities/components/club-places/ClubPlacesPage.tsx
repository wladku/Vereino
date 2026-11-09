'use client'
// `/club/places` — the club's facilities with today's occupancy (README M-11; REQ-023; #123): one card per live active
// place with the number of today's blocks in the club's time zone and the first of them (time, kind in text, name),
// linking to the place's day timeline. One read: `GET /api/facilities/calendar` without `placeId` for today.
import * as React from 'react'
import Link from 'next/link'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Skeleton } from '@open-mercato/ui/primitives/skeleton'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { calendarDateInZone } from '@vereino/core'
import { CLUB_FACILITY_HREF, useFacilityFeatures } from '../club-facility/facility-client'
import { FacilitiesClubFrame, type PlacesProfile } from './FacilitiesClubFrame'
import { KIND_TAGS } from './PlaceTimeline'
import {
  dayWindow,
  entriesOfDay,
  entryLabel,
  entryRange,
  placeHref,
  useStaffCalendar,
  type CalendarPlace,
  type StaffCalendar,
} from './places-client'

/** How many of today's blocks a card lists before "and N more". */
const CARD_ENTRIES = 4

function PlaceCard({ place, calendar, today }: { place: CalendarPlace; calendar: StaffCalendar; today: string }) {
  const t = useT()
  const headingId = React.useId()
  const entries = entriesOfDay(calendar.entries, today, calendar.timeZone, place.id)
  const shown = entries.slice(0, CARD_ENTRIES)
  return (
    <li className="flex flex-col gap-3 rounded-md border p-4" data-testid={`club-places-card-${place.id}`}>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-semibold break-words">
          <Link className="underline-offset-4 hover:underline" href={placeHref(place.id)}>
            {place.name}
          </Link>
        </h2>
        {place.parentName ? <p className="text-muted-foreground text-sm break-words">{place.parentName}</p> : null}
        <p className="text-sm" data-testid="club-places-card-count">
          {entries.length === 0
            ? t('facilities.places.list.free')
            : t('facilities.places.list.count', { count: entries.length })}
        </p>
      </div>
      {shown.length > 0 ? (
        <ul className="flex flex-col gap-2 text-sm" aria-labelledby={headingId}>
          {shown.map((entry) => (
            <li key={`${entry.kind}:${entry.id}`} className="flex flex-wrap items-center gap-2">
              <span className="font-medium tabular-nums">{entryRange(entry, calendar.timeZone)}</span>
              <Tag variant={KIND_TAGS[entry.kind]}>{t(`facilities.places.kind.${entry.kind}`)}</Tag>
              <span className="break-words">{entryLabel(t, entry)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {entries.length > shown.length ? (
        <p className="text-muted-foreground text-sm">
          {t('facilities.places.list.more', { count: entries.length - shown.length })}
        </p>
      ) : null}
      <div>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={placeHref(place.id)} data-testid={`club-places-open-${place.id}`}>
            {t('facilities.places.list.open', { place: place.name })}
          </Link>
        </Button>
      </div>
    </li>
  )
}

function PlacesList({ profile }: { profile: PlacesProfile }) {
  const t = useT()
  const today = calendarDateInZone(new Date(), profile.club.timezone)
  const window = React.useMemo(() => dayWindow(today, profile.club.timezone), [today, profile.club.timezone])
  const query = useStaffCalendar(window)
  const features = useFacilityFeatures()

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = (
      <div className="flex flex-col gap-3" aria-busy="true" data-testid="club-places-loading">
        <span className="sr-only">{t('facilities.places.loading')}</span>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
    )
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('facilities.places.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('facilities.places.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.places.length === 0) {
    body = (
      <p className="text-muted-foreground" data-testid="club-places-empty">
        {t('facilities.places.list.empty')}
      </p>
    )
  } else {
    const calendar = query.data
    const zoneToday = calendarDateInZone(new Date(), calendar.timeZone)
    body = (
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="club-places-list">
        {calendar.places.map((place) => (
          <PlaceCard key={place.id} place={place} calendar={calendar} today={zoneToday} />
        ))}
      </ul>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('facilities.places.title')}</h1>
        {features.logWrite ? (
          <Button asChild variant="outline" className="min-h-11">
            <Link href={CLUB_FACILITY_HREF} data-testid="club-places-facility-today">
              {t('facilities.facility.title')}
            </Link>
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground max-w-prose text-sm">{t('facilities.places.list.intro')}</p>
      {body}
    </>
  )
}

export function ClubPlacesPage() {
  return <FacilitiesClubFrame>{(profile) => <PlacesList profile={profile} />}</FacilitiesClubFrame>
}
