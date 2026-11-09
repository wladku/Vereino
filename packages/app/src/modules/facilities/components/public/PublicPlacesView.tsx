'use client'
// `/p/[clubSlug]/places` — the club's facilities for a guest (facilities spec P-03, REQ-014; #124): one card per place
// with a public calendar — its photo (or a neutral placeholder), name, address and surface, and whether the place takes
// online requests or is booked by phone — each linking to the place's month (P-04). States: loading, error with retry,
// 404 (nothing about any club) and "the club does not share facility calendars" for a club that does not publish them
// or has no public place.
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  PublicFacilitiesDisabled,
  PublicFacilitiesError,
  PublicFacilitiesFrame,
  PublicFacilitiesLoading,
  PublicFacilitiesNotice,
} from './PublicFacilitiesFrame'
import { clubHref, placeHref, usePublicPlaces } from './public-client'

export function PublicPlacesView({ clubSlug }: { clubSlug: string }) {
  const t = useT()
  const query = usePublicPlaces(clubSlug)
  const load = query.data

  if (!load && query.isFetching) return <PublicFacilitiesLoading />
  if (!load) return <PublicFacilitiesError onRetry={() => void query.refetch()} />
  if (load.status === 'not_found' || load.status === 'month_invalid') {
    return (
      <PublicFacilitiesFrame club={null}>
        <PublicFacilitiesNotice
          title={t('facilities.public.notFound.title')}
          message={t('facilities.public.places.notFound')}
          testId="public-places-not-found"
        />
      </PublicFacilitiesFrame>
    )
  }
  if (load.status === 'disabled') return <PublicFacilitiesDisabled club={null} />
  const { club, places } = load.page
  if (places.length === 0) return <PublicFacilitiesDisabled club={club} />

  return (
    <PublicFacilitiesFrame club={club}>
      <nav aria-label={t('facilities.public.breadcrumb.label')}>
        <Link
          href={clubHref(club.slug)}
          className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline sm:min-h-6"
          data-testid="public-places-back"
        >
          {t('facilities.public.places.back', { club: club.name })}
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold" data-testid="public-places-title">
        {t('facilities.public.places.title')}
      </h1>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="public-places">
        {places.map((place) => (
          <li key={place.slug}>
            <Link
              href={placeHref(club.slug, place.slug)}
              className="bg-card hover:bg-muted flex h-full flex-col overflow-hidden rounded-lg border"
              data-testid={`public-place-${place.slug}`}
            >
              {place.photoUrl ? (
                <Image
                  src={place.photoUrl}
                  alt=""
                  width={640}
                  height={360}
                  unoptimized
                  className="bg-muted aspect-video w-full object-cover"
                />
              ) : (
                <span aria-hidden="true" className="bg-muted text-muted-foreground flex aspect-video w-full" />
              )}
              <span className="flex flex-col gap-1 p-4">
                <span className="text-lg font-semibold">{place.name}</span>
                {place.address ? <span className="text-muted-foreground text-sm">{place.address}</span> : null}
                {place.surface ? (
                  <span className="text-sm">{t('facilities.public.places.surface', { surface: place.surface })}</span>
                ) : null}
                <span className="text-sm font-medium" data-testid={`public-place-${place.slug}-requests`}>
                  {place.acceptsOnlineRequests
                    ? t('facilities.public.places.onlineRequests')
                    : t('facilities.public.places.byPhone')}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </PublicFacilitiesFrame>
  )
}
