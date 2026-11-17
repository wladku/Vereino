'use client'
// `/club/facility/rentals/[id]` — one rental on the attendant's phone (facilities parity spec REQ-R14, REQ-R05, the UI
// row `/club/facility/rentals/[id]`; #282): the member frame, a link back to the Rentals tab, and the panel's
// `RentalRecord` in its `phone` variant (the same read and actions; contact, purpose and notes; no confirm button for a
// rental with a charge, DD-R09). The rental routes decide: a rental outside the caller's places answers 403 or 404.
import * as React from 'react'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { RentalRecord } from '../RentalRecord'
import { FacilitiesClubFrame } from '../club-places/FacilitiesClubFrame'
import { facilityHref } from './facility-client'

export function ClubRentalPage({ id }: { id: string }) {
  const t = useT()
  return (
    <FacilitiesClubFrame>
      {() => (
        <div className="flex flex-col gap-4">
          <div>
            <Button asChild variant="ghost" className="min-h-11 px-0">
              <Link href={facilityHref(null, 'rentals')} data-testid="club-rental-back">
                {t('facilities.facility.rental.back')}
              </Link>
            </Button>
          </div>
          <RentalRecord id={id} variant="phone" />
        </div>
      )}
    </FacilitiesClubFrame>
  )
}
