'use client'
// `/club/places` — the club's bookable places with today's occupancy (README M-11; REQ-023; #123; facilities parity
// spec REQ-R12, #275): one card per bookable place in the caller's scope — active, a leaf, not external — with its
// parent, its kind and surface and the number of today's entries on the place family (the place, its ancestors and its
// descendants) in the club's time zone, linking to the place's day. One read: `GET /api/facilities/calendar` without
// `placeId` for today. A place maintainer without `facilities.view` (#128) sees the places assigned to them; a user who
// may read neither sees a permission-denied state. A user who may plan maintenance (`maintenance.canPlan`) gets the link
// "Maintenance" to their task list (`/club/places/maintenance`; REQ-R15, #283).
import * as React from 'react'
import Link from 'next/link'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { calendarDateInZone } from '@vereino/core'
import { MemberSkeleton } from '@vereino/ui'
import { isBookablePlace, placeFamilyOf } from '../../lib/place-scope'
import { CLUB_FACILITY_HREF, useFacilityFeatures } from '../club-facility/facility-client'
import { CLUB_MAINTENANCE_HREF } from '../maintenance-client'
import { FacilitiesClubFrame, type PlacesProfile } from './FacilitiesClubFrame'
import {
  calendarErrorStatus,
  dayWindow,
  entriesOfDay,
  placeHref,
  usePlacesFeatures,
  useStaffCalendar,
  type CalendarPlace,
  type StaffCalendar,
  type Translate,
} from './places-client'

/** The panel's form for a new facility (`club_core`, `club_core.manage`): the empty list's action. */
const PANEL_PLACE_CREATE_HREF = '/backend/club/places/create'

/** The place kinds `club_core` stores; another value is shown as it is. */
const PLACE_KINDS = new Set(['complex', 'pitch', 'multi_pitch', 'hall', 'locker_room', 'pool', 'other'])

/** "football pitch · artificial turf · today: 3 entries" (the mockup's `screenPlaces` line). */
function placeFacts(t: Translate, locale: string, place: CalendarPlace, count: number): string {
  const form = new Intl.PluralRules(locale).select(count)
  const plural = form === 'one' || form === 'few' || form === 'many' ? form : 'other'
  const state =
    count === 0 ? t('facilities.places.list.stateFree') : t(`facilities.places.list.entries.${plural}`, { count })
  const kind = place.kind
    ? PLACE_KINDS.has(place.kind)
      ? t(`facilities.places.placeKind.${place.kind}`)
      : place.kind
    : null
  return [kind, place.surface, t('facilities.places.list.today', { state })].filter(Boolean).join(' · ')
}

function PlaceCard({ place, calendar, today }: { place: CalendarPlace; calendar: StaffCalendar; today: string }) {
  const t = useT()
  const locale = useLocale()
  const family = placeFamilyOf(calendar.places, place.id)
  const count = entriesOfDay(calendar.entries, today, calendar.timeZone).filter((entry) =>
    family.has(entry.placeId),
  ).length
  return (
    <li className="flex flex-col gap-3 rounded-md border p-4" data-testid={`club-places-card-${place.id}`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold break-words">
          <Link className="underline-offset-4 hover:underline" href={placeHref(place.id)}>
            {place.name}
          </Link>
        </h2>
        {place.parentName ? <p className="text-muted-foreground text-sm break-words">{place.parentName}</p> : null}
        <p className="text-sm break-words" data-testid="club-places-card-count" data-count={count}>
          {placeFacts(t, locale, place, count)}
        </p>
      </div>
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
  const placesFeatures = usePlacesFeatures()

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = (
      <MemberSkeleton
        shape="tiles"
        count={3}
        label={t('facilities.places.loading')}
        data-testid="club-places-loading"
      />
    )
  } else if (!query.data && calendarErrorStatus(query.error) === 403) {
    body = (
      <Alert style="light" status="warning" data-testid="club-places-denied">
        <p className="max-w-prose">{t('facilities.places.errors.forbidden')}</p>
      </Alert>
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
  } else if (!query.data.places.some(isBookablePlace)) {
    body = (
      <div className="flex flex-col items-start gap-2" data-testid="club-places-empty">
        <p className="text-muted-foreground">{t('facilities.places.list.empty')}</p>
        {placesFeatures.managePlaces ? (
          <Button asChild variant="outline" className="min-h-11">
            <Link href={PANEL_PLACE_CREATE_HREF} data-testid="club-places-empty-add">
              {t('facilities.places.list.add')}
            </Link>
          </Button>
        ) : null}
      </div>
    )
  } else {
    const calendar = query.data
    const zoneToday = calendarDateInZone(new Date(), calendar.timeZone)
    body = (
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="club-places-list">
        {calendar.places.filter(isBookablePlace).map((place) => (
          <PlaceCard key={place.id} place={place} calendar={calendar} today={zoneToday} />
        ))}
      </ul>
    )
  }

  const canPlan = query.data?.maintenance?.canPlan === true

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('facilities.places.title')}</h1>
        {features.logWrite || canPlan ? (
          <div className="flex flex-wrap gap-2">
            {features.logWrite ? (
              <Button asChild variant="outline" className="min-h-11">
                <Link href={CLUB_FACILITY_HREF} data-testid="club-places-facility-today">
                  {t('facilities.facility.title')}
                </Link>
              </Button>
            ) : null}
            {canPlan ? (
              <Button asChild variant="outline" className="min-h-11">
                <Link href={CLUB_MAINTENANCE_HREF} data-testid="club-places-maintenance">
                  {t('facilities.places.maintenance.title')}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-muted-foreground max-w-prose text-sm">{t('facilities.places.list.intro')}</p>
      {body}
    </>
  )
}

export function ClubPlacesPage() {
  return <FacilitiesClubFrame skeleton="tiles">{(profile) => <PlacesList profile={profile} />}</FacilitiesClubFrame>
}
