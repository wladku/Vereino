'use client'
// `/p/[clubSlug]/events/[eventSlug]` — the tournament page P-T1 of a published club event (club events spec REQ-T09,
// DD-T11, DD-T12, J-T04, the 375 px drawing; #381): the poster, the name, the dates, the status, the place with its
// address and a map link, the description, the days with their parts (time, title, category, type, our team with its
// section or the club's name, the visiting teams, a cancelled part struck through), "Organised by {club}" and the
// funders' logos with their names as alternative text. A cancelled event shows a banner without the reason. States:
// loading, error with retry, the club without published events, and "This event is not published" with the club page
// link (an unknown, unpublished or empty event). Dates are club-zone dates, formatted in the reader's locale.
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import { PublicFrame, PublicNotice } from './PublicFrame'
import {
  clubHref,
  eventsHref,
  formatPublicDate,
  formatPublicDay,
  sectionHref,
  usePublicClubEvent,
  type PublicClubEventPage,
  type PublicClubEventPart,
  type PublicLoad,
} from './public-client'

const LINK_CLASS = 'inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6'

/** "Sat, 21 Nov" for one day, "Sat, 21 Nov – Sun, 29 Nov" for several. */
export function useEventDates(dateFrom: string, dateTo: string): string {
  const t = useT()
  const locale = useLocale()
  const from = formatPublicDate(dateFrom, locale)
  if (dateFrom === dateTo) return from
  return t('club_core.public.events.dateRange', { from, to: formatPublicDate(dateTo, locale) })
}

function OurTeam({ clubSlug, part }: { clubSlug: string; part: PublicClubEventPart }) {
  const t = useT()
  const team = part.ourTeam
  if (!team) return null
  return (
    <p className="text-sm" data-testid="public-club-event-our-team">
      <span className="text-muted-foreground">{t('club_core.public.clubEvent.ourTeam')}</span>{' '}
      {'clubName' in team ? (
        <span>{team.clubName}</span>
      ) : (
        <>
          <span>{team.groupName}</span> ·{' '}
          <Link className={LINK_CLASS} href={sectionHref(clubSlug, team.section.slug)}>
            {team.section.name}
          </Link>
        </>
      )}
    </p>
  )
}

function PartCard({ clubSlug, part }: { clubSlug: string; part: PublicClubEventPart }) {
  const t = useT()
  const title = `${part.startTime}–${part.endTime} ${part.title}`
  return (
    <li
      className="bg-card flex flex-col gap-1 rounded-lg border p-4"
      data-testid="public-club-event-part"
      data-cancelled={String(part.cancelled)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-base font-semibold">{part.cancelled ? <s>{title}</s> : title}</h4>
        {part.cancelled ? (
          <StatusBadge variant="neutral">{t('club_core.public.clubEvent.partCancelled')}</StatusBadge>
        ) : (
          <StatusBadge variant="info">{t(`club_core.public.events.type.${part.type}`)}</StatusBadge>
        )}
      </div>
      {part.category ? <p className="text-muted-foreground text-sm">{part.category}</p> : null}
      <OurTeam clubSlug={clubSlug} part={part} />
      {part.visitingTeams.length > 0 ? (
        <p className="text-sm" data-testid="public-club-event-guests">
          <span className="text-muted-foreground">{t('club_core.public.clubEvent.guests')}</span>{' '}
          {part.visitingTeams
            .map((team) =>
              team.clubName && team.clubName !== team.name ? `${team.name} (${team.clubName})` : team.name,
            )
            .join(', ')}
        </p>
      ) : null}
    </li>
  )
}

function ClubEventBody({ page }: { page: PublicClubEventPage }) {
  const t = useT()
  const locale = useLocale()
  const event = page.event
  const dates = useEventDates(event.dateFrom, event.dateTo)
  const cancelled = event.status === 'cancelled'
  return (
    <>
      {cancelled ? (
        <div
          role="status"
          className="bg-muted rounded-lg border p-4 font-medium"
          data-testid="public-club-event-cancelled"
        >
          {t('club_core.public.clubEvent.cancelledBanner')}
        </div>
      ) : null}
      {event.poster ? (
        <Image
          src={event.poster.url}
          alt={t('club_core.public.clubEvent.posterAlt', { name: event.name })}
          width={1200}
          height={1600}
          unoptimized
          className="bg-muted h-auto max-h-160 w-full rounded-lg object-contain"
          data-testid="public-club-event-poster"
        />
      ) : null}
      <section className="flex flex-col gap-2" aria-labelledby="public-club-event-title">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 id="public-club-event-title" className="text-2xl font-semibold" data-testid="public-club-event-name">
            {cancelled ? <s>{event.name}</s> : event.name}
          </h1>
          {cancelled ? <StatusBadge variant="neutral">{t('club_core.public.clubEvent.cancelled')}</StatusBadge> : null}
        </div>
        <p className="font-medium" data-testid="public-club-event-dates">
          {dates}
        </p>
        {event.place ? (
          <p
            className="text-muted-foreground flex flex-wrap items-center gap-x-1"
            data-testid="public-club-event-place"
          >
            <span>{[event.place.name, event.place.address].filter(Boolean).join(', ')}</span>
            {event.place.mapUrl ? (
              <span>
                ·{' '}
                <a
                  className={LINK_CLASS}
                  href={event.place.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('club_core.public.events.mapLabel', { place: event.place.name })}
                  data-testid="public-club-event-map"
                >
                  {t('club_core.public.events.map')}
                </a>
              </span>
            ) : null}
          </p>
        ) : null}
        {event.description ? <p className="max-w-prose whitespace-pre-line">{event.description}</p> : null}
      </section>
      <section className="flex flex-col gap-4" aria-labelledby="public-club-event-schedule">
        <h2 id="public-club-event-schedule" className="text-lg font-semibold">
          {t('club_core.public.clubEvent.schedule')}
        </h2>
        {event.days.map((day) => (
          <section key={day.date} className="flex flex-col gap-2" data-testid="public-club-event-day">
            <h3 className="font-semibold">{formatPublicDay(day.date, locale)}</h3>
            <ul className="flex flex-col gap-3">
              {day.parts.map((part, index) => (
                <PartCard key={index} clubSlug={page.club.slug} part={part} />
              ))}
            </ul>
          </section>
        ))}
      </section>
      <section className="flex flex-col gap-3 border-t pt-4" aria-labelledby="public-club-event-organiser">
        <h2 id="public-club-event-organiser" className="font-medium" data-testid="public-club-event-organiser">
          {t('club_core.public.clubEvent.organisedBy', { club: page.club.name })}
        </h2>
        {event.funders.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-sm">{t('club_core.public.clubEvent.fundedBy')}</h3>
            <ul className="flex flex-wrap items-center gap-4" data-testid="public-club-event-funders">
              {event.funders.map((funder, index) => (
                <li key={index}>
                  <Image
                    src={funder.logoUrl}
                    alt={funder.name}
                    width={160}
                    height={64}
                    unoptimized
                    className="h-16 w-auto max-w-40 object-contain"
                    data-testid="public-club-event-funder"
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Link href={eventsHref(page.club.slug)} className={LINK_CLASS} data-testid="public-club-event-all-events">
          {t('club_core.public.clubEvent.allEvents')}
        </Link>
      </section>
    </>
  )
}

/** `initial`: the state the server already read (#487), so the page's HTML holds its content without JavaScript. */
export function PublicClubEventView({
  clubSlug,
  eventSlug,
  initial,
}: {
  clubSlug: string
  eventSlug: string
  initial?: PublicLoad<PublicClubEventPage>
}) {
  const t = useT()
  const query = usePublicClubEvent(clubSlug, eventSlug, !initial)
  const load = initial ?? query.data

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
  if (load.status !== 'ok') {
    return (
      <PublicFrame club={null}>
        <PublicNotice
          title={t('club_core.public.clubEvent.notPublished')}
          message={t('club_core.public.clubEvent.notPublishedText')}
          testId="public-club-event-not-found"
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
      <ClubEventBody page={load.page} />
    </PublicFrame>
  )
}
