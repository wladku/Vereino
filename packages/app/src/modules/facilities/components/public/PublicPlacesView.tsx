'use client'
// `/p/[clubSlug]/places` — the club's facilities for a guest (facilities spec P-03, REQ-014; #124; parity spec REQ-R16,
// #289): the intro of the club's booking mode ("see the occupancy", or "… and request a booking, valid only after the
// administrator approves it"), then one card per place with a public calendar — its photo (or a neutral placeholder),
// name, "address · surface" and the badge "online requests" or "booking by phone" — each linking to the place's month
// (P-04). States: loading, error with retry, 404 (nothing about any club) and "the club does not share facility
// calendars" with the club's phone for a club that does not publish them or has no public place — every answered state
// inside the club's frame while the club publishes its page.
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
import {
  TONE_CLASSES,
  clubHref,
  placeHref,
  usePublicPlaces,
  type PublicFacilitiesLoad,
  type PublicPlacesView as PublicPlacesPage,
} from './public-client'

/** `initial`: the state the server already read (#487), so the page's HTML holds its content without JavaScript. */
export function PublicPlacesView({
  clubSlug,
  initial,
}: {
  clubSlug: string
  initial?: PublicFacilitiesLoad<PublicPlacesPage>
}) {
  const t = useT()
  const query = usePublicPlaces(clubSlug, !initial)
  const load = initial ?? query.data

  if (!load && query.isFetching) return <PublicFacilitiesLoading />
  if (!load) return <PublicFacilitiesError onRetry={() => void query.refetch()} />
  if (load.status === 'not_found' || load.status === 'month_invalid') {
    return (
      <PublicFacilitiesFrame club={load.club}>
        <PublicFacilitiesNotice
          title={t('facilities.public.notFound.title')}
          message={t('facilities.public.places.notFound')}
          testId="public-places-not-found"
        />
      </PublicFacilitiesFrame>
    )
  }
  if (load.status === 'disabled') return <PublicFacilitiesDisabled club={load.club} />
  const { club, places, onlineRequests } = load.page
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
      <section className="flex flex-col gap-2" aria-labelledby="public-places-title">
        <h1 id="public-places-title" className="text-2xl font-semibold" data-testid="public-places-title">
          {t('facilities.public.places.title')}
        </h1>
        <p
          className="text-muted-foreground max-w-prose"
          data-testid="public-places-intro"
          data-mode={onlineRequests ? 'online' : 'phone'}
        >
          {onlineRequests ? t('facilities.public.places.introOnline') : t('facilities.public.places.intro')}
        </p>
      </section>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="public-places">
        {places.map((place) => {
          const details = [place.address, place.surface].filter((part): part is string => Boolean(part)).join(' · ')
          return (
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
                  {details ? (
                    <span className="text-muted-foreground text-sm" data-testid={`public-place-${place.slug}-details`}>
                      {details}
                    </span>
                  ) : null}
                  <span className="mt-1">
                    <span
                      className={`inline-flex items-center rounded-sm border px-1.5 text-xs font-medium ${
                        TONE_CLASSES[place.acceptsOnlineRequests ? 'success' : 'neutral']
                      }`}
                      data-testid={`public-place-${place.slug}-requests`}
                      data-mode={place.acceptsOnlineRequests ? 'online' : 'phone'}
                    >
                      {place.acceptsOnlineRequests
                        ? t('facilities.public.places.onlineRequests')
                        : t('facilities.public.places.byPhone')}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </PublicFacilitiesFrame>
  )
}
