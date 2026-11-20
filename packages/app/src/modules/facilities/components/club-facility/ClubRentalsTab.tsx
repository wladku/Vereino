'use client'
// The Rentals tab of `/club/facility` (M-12; facilities parity spec REQ-R14, #282): the rentals of the attendant's places
// that start from 7 days back to 30 days ahead, filtered Active / To be moved / All (the filter in the address), and
// "New rental", which opens the places list (a rental is taken on a place's day, J-R01). One card per rental — the
// slot, the renter and the place, the status and the amount, the contact — each a link to the rental's page. The list
// route answers within the caller's rental scope, so a place outside the grant never appears. States: loading, empty
// ("No rentals"), error with retry.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import { minorToAmount, placeLabel, usePlaceOptions } from '../facilities-client'
import { CLUB_PLACES_HREF } from '../club-places/places-client'
import { rentalStatusLabel, rentalStatusVariant, slotLabel, useRentalTimeZone, type RentalRow } from '../rentals-client'
import {
  RENTAL_FILTERS,
  clubRentalHref,
  facilityHref,
  rentalFilterOf,
  useFacilityRentals,
  type RentalFilter,
} from './facility-client'

const FILTER_KEYS: Record<RentalFilter, string> = {
  active: 'facilities.rentals.tabs.active',
  to_move: 'facilities.rentals.views.to_move',
  all: 'facilities.rentals.tabs.all',
}

function RentalCard({ rental, placeName, timeZone }: { rental: RentalRow; placeName: string; timeZone: string }) {
  const t = useT()
  const contact = [rental.contactName, rental.contactPhone].filter(Boolean).join(', ')
  return (
    <li>
      <Link
        href={clubRentalHref(rental.id)}
        className="hover:bg-muted/50 focus-visible:focus-indicator flex flex-col gap-1 rounded-md border p-4"
        data-testid={`club-facility-rental-${rental.id}`}
      >
        <span className="font-medium tabular-nums">{slotLabel(rental.startsAt, rental.endsAt, timeZone)}</span>
        <span className="font-semibold break-words">
          {`${rental.renterDisplayName ?? t('facilities.places.entry.unnamed')} · ${placeName}`}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge variant={rentalStatusVariant(rental.status)}>{rentalStatusLabel(t, rental.status)}</StatusBadge>
          {rental.needsReschedule ? (
            <StatusBadge variant="warning">{t('facilities.rentals.views.to_move')}</StatusBadge>
          ) : null}
          {rental.amount !== null ? <span className="tabular-nums">{minorToAmount(rental.amount)}</span> : null}
        </span>
        {contact ? (
          <span className="text-muted-foreground text-sm break-words" data-testid="club-facility-rental-contact">
            {t('facilities.facility.entry.contact', { contact })}
          </span>
        ) : null}
      </Link>
    </li>
  )
}

export function ClubRentalsTab() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const timeZone = useRentalTimeZone()
  const places = usePlaceOptions()
  const filter = rentalFilterOf(searchParams.get('filter'))
  const query = useFacilityRentals(filter)

  const setFilter = (next: RentalFilter) => {
    const href = facilityHref(searchParams.get('place'), 'rentals')
    router.replace(next === 'active' ? href : `${href}&filter=${next}`)
  }

  let list: React.ReactNode
  if (query.isLoading) {
    list = (
      <MemberSkeleton
        shape="rows"
        count={3}
        label={t('facilities.facility.rentals.loading')}
        data-testid="club-facility-rentals-loading"
      />
    )
  } else if (query.error || !query.data) {
    list = (
      <ErrorMessage
        label={t('facilities.facility.rentals.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('facilities.places.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.length === 0) {
    list = (
      <p className="text-muted-foreground" data-testid="club-facility-rentals-empty">
        {t('facilities.facility.rentals.empty')}
      </p>
    )
  } else {
    list = (
      <ul className="flex flex-col gap-3" data-testid="club-facility-rentals">
        {query.data.map((rental) => (
          <RentalCard
            key={rental.id}
            rental={rental}
            placeName={placeLabel(t, places.names, rental.placeId)}
            timeZone={timeZone}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={t('facilities.facility.rentals.filter')}
          className="flex flex-wrap gap-2"
          data-testid="club-facility-rentals-filter"
        >
          {RENTAL_FILTERS.map((entry) => (
            <Button
              key={entry}
              type="button"
              size="sm"
              variant={entry === filter ? 'default' : 'outline'}
              className="min-h-11"
              aria-pressed={entry === filter}
              data-testid={`club-facility-rentals-filter-${entry}`}
              onClick={() => {
                setFilter(entry)
              }}
            >
              {t(FILTER_KEYS[entry])}
            </Button>
          ))}
        </div>
        <Button asChild className="min-h-11">
          <Link href={CLUB_PLACES_HREF} data-testid="club-facility-rentals-new">
            {t('facilities.facility.rentals.new')}
          </Link>
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">{t('facilities.facility.rentals.window')}</p>
      {list}
    </div>
  )
}
