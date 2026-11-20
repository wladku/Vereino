'use client'
// `/p/[clubSlug]/events` — the public Events page P-06 (navigation spec REQ-N13, mock-up `screenPublicEvents`; #263):
// the hero, section chips that filter through `?section=` (an unknown section shows all), "Upcoming" (soonest first,
// "No events planned." when empty) and "Past (last 60 days)" (newest first, each with the "took place" badge, hidden when
// empty). Each event: the section logo, its name, date and start, the place with a map link for an external venue, the
// section and the type. States: loading, error with retry, 404 and "the club does not publish events" with the club page
// link. Dates are club-zone dates, formatted in the reader's locale. A published club event (club events spec REQ-T10,
// DD-T12; #381) is one card: its poster thumbnail (else the section's or the club's logo), its name linking to its
// tournament page, its date range, its place (a map link for an external place), "{n} parts" and its section (none for
// a whole-club event); struck through when cancelled.
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import { LogoMark, PublicFrame, PublicNotice } from './PublicFrame'
import { pluralForm } from '../../lib/public-page'
import { useEventDates } from './PublicClubEventView'
import {
  clubEventHref,
  clubHref,
  eventsHref,
  formatPublicDate,
  sectionHref,
  usePublicEvents,
  type PublicEvent,
  type PublicEventsPage,
} from './public-client'

const LINK_CLASS = 'inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6'

function EventBadge({ event }: { event: PublicEvent }) {
  const t = useT()
  if (event.cancelled) return <StatusBadge variant="neutral">{t('club_core.public.classes.cancelled')}</StatusBadge>
  if (event.past) return <StatusBadge variant="neutral">{t('club_core.public.events.tookPlace')}</StatusBadge>
  return <StatusBadge variant="info">{t(`club_core.public.events.type.${event.type}`)}</StatusBadge>
}

/** The map link of an external place on a card. */
function MapLink({ event }: { event: PublicEvent }) {
  const t = useT()
  if (!event.mapUrl) return null
  return (
    <span>
      ·{' '}
      <a
        className={LINK_CLASS}
        href={event.mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('club_core.public.events.mapLabel', { place: event.place ?? '' })}
        data-testid="public-event-map"
      >
        {t('club_core.public.events.map')}
      </a>
    </span>
  )
}

/** A club event's card (#381): poster or logo, name linking to its page, dates, place, parts count, section. */
function ClubEventCard({ clubSlug, event }: { clubSlug: string; event: PublicEvent }) {
  const t = useT()
  const locale = useLocale()
  const dates = useEventDates(event.date, event.endDate)
  const count = event.partsCount ?? 0
  const href = clubEventHref(clubSlug, event.clubEventSlug ?? '')
  return (
    <li
      className="bg-card flex gap-3 rounded-lg border p-4"
      data-testid="public-event"
      data-kind="club_event"
      data-past={String(event.past)}
      data-cancelled={String(event.cancelled)}
    >
      {event.posterUrl ? (
        <Image
          src={event.posterUrl}
          alt=""
          width={56}
          height={80}
          unoptimized
          className="bg-muted h-20 w-14 shrink-0 rounded-md object-cover"
          data-testid="public-event-poster"
        />
      ) : (
        <LogoMark logo={event.sectionLogo} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-semibold">
            <Link className={LINK_CLASS} href={href} data-testid="public-event-link">
              {event.cancelled ? <s>{event.name}</s> : event.name}
            </Link>
          </h3>
          <EventBadge event={event} />
        </div>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-sm">
          <span>{dates}</span>
          {event.place ? <span>· {event.place}</span> : null}
          <MapLink event={event} />
          <span data-testid="public-event-parts">
            · {t(`club_core.public.events.parts.${pluralForm(locale, count)}`, { count })}
          </span>
          {event.section ? (
            <span>
              ·{' '}
              <Link className={LINK_CLASS} href={sectionHref(clubSlug, event.section.slug)}>
                {event.section.name}
              </Link>
            </span>
          ) : null}
        </p>
      </div>
    </li>
  )
}

/** One event card: the section logo, name, date and start, place (map link for an external venue), section, badge. */
export function PublicEventCard({ clubSlug, event }: { clubSlug: string; event: PublicEvent }) {
  const t = useT()
  const locale = useLocale()
  if (event.kind === 'club_event') return <ClubEventCard clubSlug={clubSlug} event={event} />
  const date = formatPublicDate(event.date, locale)
  const when =
    event.endDate !== event.date
      ? t('club_core.public.events.startUntil', {
          date,
          time: event.startTime,
          endDate: formatPublicDate(event.endDate, locale),
        })
      : t('club_core.public.events.start', { date, time: event.startTime })
  return (
    <li className="bg-card flex gap-3 rounded-lg border p-4" data-testid="public-event" data-past={String(event.past)}>
      <LogoMark logo={event.sectionLogo} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-semibold">{event.cancelled ? <s>{event.name}</s> : event.name}</h3>
          <EventBadge event={event} />
        </div>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-sm">
          <span>{when}</span>
          {event.place ? <span>· {event.place}</span> : null}
          <MapLink event={event} />
          {event.section ? (
            <span>
              ·{' '}
              <Link className={LINK_CLASS} href={sectionHref(clubSlug, event.section.slug)}>
                {event.section.name}
              </Link>
            </span>
          ) : null}
        </p>
      </div>
    </li>
  )
}

function SectionChips({ page }: { page: PublicEventsPage }) {
  const t = useT()
  const chip = (label: string, href: string, current: boolean, testId: string) => (
    <li key={testId}>
      <Link
        href={href}
        aria-current={current ? 'page' : undefined}
        className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium ${
          current ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted'
        }`}
        data-testid={testId}
      >
        {label}
      </Link>
    </li>
  )
  return (
    <nav aria-label={t('club_core.public.events.sectionFilter')}>
      <ul className="flex flex-wrap gap-2" data-testid="public-events-chips">
        {chip(t('club_core.public.events.all'), eventsHref(page.club.slug), page.section === null, 'public-events-all')}
        {page.sections.map((section) =>
          chip(
            section.name,
            eventsHref(page.club.slug, section.slug),
            page.section === section.slug,
            `public-events-section-${section.slug}`,
          ),
        )}
      </ul>
    </nav>
  )
}

function EventsBody({ page }: { page: PublicEventsPage }) {
  const t = useT()
  return (
    <>
      <section className="flex flex-col gap-1" aria-labelledby="public-events-title">
        <h1 id="public-events-title" className="text-2xl font-semibold">
          {t('club_core.public.events.pageTitle')}
        </h1>
        <p className="text-muted-foreground max-w-prose">{t('club_core.public.events.subtitle')}</p>
      </section>
      {page.sections.length > 0 ? <SectionChips page={page} /> : null}
      <section
        className="flex flex-col gap-3"
        aria-labelledby="public-events-upcoming"
        data-testid="public-events-upcoming"
      >
        <h2 id="public-events-upcoming" className="text-lg font-semibold">
          {t('club_core.public.events.upcoming')}
        </h2>
        {page.upcoming.length === 0 ? (
          <div className="flex flex-col items-start gap-1" data-testid="public-events-no-upcoming">
            <p className="text-muted-foreground max-w-prose">{t('club_core.public.events.noUpcoming')}</p>
            <Link href={`${clubHref(page.club.slug)}#sections`} className={LINK_CLASS}>
              {t('club_core.public.events.seeSections')}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {page.upcoming.map((event, index) => (
              <PublicEventCard key={index} clubSlug={page.club.slug} event={event} />
            ))}
          </ul>
        )}
      </section>
      {page.past.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="public-events-past" data-testid="public-events-past">
          <h2 id="public-events-past" className="text-lg font-semibold">
            {t('club_core.public.events.past')}
          </h2>
          <ul className="flex flex-col gap-3">
            {page.past.map((event, index) => (
              <PublicEventCard key={index} clubSlug={page.club.slug} event={event} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

export function PublicEventsView({ clubSlug }: { clubSlug: string }) {
  const t = useT()
  const sectionSlug = useSearchParams()?.get('section') || null
  const query = usePublicEvents(clubSlug, sectionSlug)
  const load = query.data

  if (!load && query.isFetching) {
    return (
      <PublicFrame club={null}>
        <MemberSkeleton shape="rows" label={t('club_core.public.loading')} />
      </PublicFrame>
    )
  }
  if (!load) {
    return (
      <PublicFrame club={null}>
        <ErrorMessage
          label={t('club_core.public.errors.load')}
          action={
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
              {t('club_core.public.actions.retry')}
            </Button>
          }
        />
      </PublicFrame>
    )
  }
  if (load.status === 'not_found') {
    return (
      <PublicFrame club={null}>
        <PublicNotice
          title={t('club_core.public.notFound.title')}
          message={t('club_core.public.notFound.message')}
          testId="public-not-found"
        />
      </PublicFrame>
    )
  }
  if (load.status === 'disabled') {
    return (
      <PublicFrame club={null}>
        <PublicNotice
          title={t('club_core.public.events.notPublished')}
          message={t('club_core.public.events.notPublishedText')}
          testId="public-events-disabled"
          action={
            <Link href={clubHref(clubSlug)} className={LINK_CLASS} data-testid="public-club-page-link">
              {t('club_core.public.clubPage')}
            </Link>
          }
        />
      </PublicFrame>
    )
  }
  return (
    <PublicFrame club={load.page.club}>
      <EventsBody page={load.page} />
    </PublicFrame>
  )
}
