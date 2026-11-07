'use client'
// The provider blocks of the public pages (club spec DD-28, DD-29, README P-01 and P-02, mock-up `screenSectionPage`;
// #91): on a section page, a card per public group (`groups.publicCatalog`) with its age and level, description,
// regular days and times with the place and its next sessions (`activities.publicSchedule`, a cancelled one struck
// through and labelled), requirements and instructors — "First L." with consent, else "Section coach" (team) or
// "Section instructor" (class group) — and the membership fee with the sibling discount (`payments.publicPrices`, #112,
// mock-up "Membership fee: 120 zł / month · siblings −30%"); on the club page, the upcoming one-off events. Only what the API sends is shown:
// a block the club switched off never reaches the browser. Dates are formatted in the reader's locale; they are already
// club-zone dates.
import * as React from 'react'
import Link from 'next/link'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  formatPublicAmount,
  formatPublicDate,
  sectionHref,
  weekdayLabel,
  type PublicEvent,
  type PublicGroupCard,
  type PublicGroupPrices,
  type PublicGroupSchedule,
  type PublicSession,
} from './public-client'

type Translate = ReturnType<typeof useT>

function ageLabel(t: Translate, card: PublicGroupCard): string | null {
  if (card.ageFrom !== null && card.ageTo !== null) {
    return t('club_core.public.classes.ageRange', { from: card.ageFrom, to: card.ageTo })
  }
  if (card.ageFrom !== null) return t('club_core.public.classes.ageFrom', { from: card.ageFrom })
  if (card.ageTo !== null) return t('club_core.public.classes.ageTo', { to: card.ageTo })
  return null
}

function instructorsText(t: Translate, card: PublicGroupCard): string | null {
  if (!card.instructors || card.instructors.length === 0) return null
  const names = card.instructors.map((item) => item.name).filter((name): name is string => Boolean(name))
  if (names.length > 0) return names.join(', ')
  return card.kind === 'team'
    ? t('club_core.public.classes.sectionCoach')
    : t('club_core.public.classes.sectionInstructor')
}

function SessionDate({ session, locale }: { session: PublicSession; locale: string }) {
  const t = useT()
  const label = t('club_core.public.classes.sessionTime', {
    date: formatPublicDate(session.date, locale),
    start: session.startTime,
  })
  if (!session.cancelled) return <span>{label}</span>
  return (
    <span className="text-muted-foreground">
      <s>{label}</s> {t('club_core.public.classes.cancelled')}
    </span>
  )
}

function feeText(t: Translate, fee: PublicGroupPrices['fees'][number], locale: string): string {
  const amount = t(`club_core.public.classes.feePeriod.${fee.period}`, {
    amount: formatPublicAmount(fee.amount, fee.currency, locale),
  })
  if (fee.siblingDiscountPercent === null) return amount
  return `${amount} · ${t('club_core.public.classes.siblingDiscount', { percent: fee.siblingDiscountPercent })}`
}

function GroupCard({
  card,
  schedule,
  prices,
}: {
  card: PublicGroupCard
  schedule: PublicGroupSchedule | undefined
  prices: PublicGroupPrices | undefined
}) {
  const t = useT()
  const locale = useLocale()
  const age = ageLabel(t, card)
  const instructors = instructorsText(t, card)
  return (
    <li className="bg-card flex flex-col gap-2 rounded-lg border p-4" data-testid={`public-group-${card.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold">{card.name}</h3>
        <div className="flex flex-wrap gap-1">
          {age ? <StatusBadge variant="info">{age}</StatusBadge> : null}
          {card.level ? <StatusBadge variant="neutral">{card.level}</StatusBadge> : null}
        </div>
      </div>
      {card.description ? <p className="text-sm whitespace-pre-line">{card.description}</p> : null}
      {schedule && schedule.series.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm" aria-label={t('club_core.public.classes.when')}>
          {schedule.series.map((series, index) => (
            <li key={index} data-testid="public-group-series">
              <span className="font-medium">
                {series.weekdays.map((day) => weekdayLabel(day, locale)).join(', ')} {series.startTime}–{series.endTime}
              </span>
              {series.place ? <span className="text-muted-foreground"> · {series.place}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {schedule && schedule.upcoming.length > 0 ? (
        <div className="text-sm">
          <span className="text-muted-foreground">{t('club_core.public.classes.upcoming')}</span>{' '}
          <ul className="inline" data-testid="public-group-upcoming">
            {schedule.upcoming.map((session, index) => (
              <li key={`${session.date}-${session.startTime}`} className="inline">
                {index > 0 ? ', ' : null}
                <SessionDate session={session} locale={locale} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {card.conditions ? (
        <p className="text-sm whitespace-pre-line">
          <span className="font-medium">{t('club_core.public.classes.requirements')}</span> {card.conditions}
        </p>
      ) : null}
      {prices && prices.fees.length > 0 ? (
        <p className="text-sm" data-testid="public-group-fee">
          <span className="font-medium">{t('club_core.public.classes.fee')}</span>{' '}
          {prices.fees.map((fee) => feeText(t, fee, locale)).join('; ')}
        </p>
      ) : null}
      {instructors ? (
        <p className="text-sm" data-testid="public-group-instructors">
          <span className="font-medium">{t('club_core.public.classes.ledBy')}</span> {instructors}
        </p>
      ) : null}
    </li>
  )
}

/** The classes of a section: its public group cards, or the "nothing published" line. */
export function PublicClasses({
  groups,
  schedule,
  prices,
}: {
  groups: { items: PublicGroupCard[] } | undefined
  schedule: { groups: PublicGroupSchedule[] } | undefined
  prices: { groups: PublicGroupPrices[] } | undefined
}) {
  const t = useT()
  if (!groups || groups.items.length === 0) {
    return <p className="text-muted-foreground max-w-prose">{t('club_core.public.classes.empty')}</p>
  }
  const byGroup = new Map((schedule?.groups ?? []).map((item) => [item.groupId, item]))
  const pricesByGroup = new Map((prices?.groups ?? []).map((item) => [item.groupId, item]))
  return (
    <ul className="flex flex-col gap-3" data-testid="public-groups">
      {groups.items.map((card) => (
        <GroupCard key={card.id} card={card} schedule={byGroup.get(card.id)} prices={pricesByGroup.get(card.id)} />
      ))}
    </ul>
  )
}

/** The club page's upcoming one-off events (P-01). */
export function PublicEvents({ clubSlug, events }: { clubSlug: string; events: PublicEvent[] }) {
  const t = useT()
  const locale = useLocale()
  return (
    <section className="flex flex-col gap-3" aria-labelledby="public-events-title" data-testid="public-events">
      <h2 id="public-events-title" className="text-lg font-semibold">
        {t('club_core.public.events.title')}
      </h2>
      <ul className="flex flex-col gap-3">
        {events.map((event, index) => (
          <li key={index} className="bg-card flex flex-col gap-1 rounded-lg border p-4" data-testid="public-event">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-base font-semibold">{event.cancelled ? <s>{event.name}</s> : event.name}</h3>
              <StatusBadge variant={event.cancelled ? 'neutral' : 'info'}>
                {event.cancelled
                  ? t('club_core.public.classes.cancelled')
                  : t(`club_core.public.events.type.${event.type}`)}
              </StatusBadge>
            </div>
            <p className="text-muted-foreground text-sm">
              {t('club_core.public.events.when', {
                date: formatPublicDate(event.date, locale),
                start: event.startTime,
                end: event.endTime,
              })}
              {event.place ? ` · ${event.place}` : ''}
              {' · '}
              <Link className="underline underline-offset-4" href={sectionHref(clubSlug, event.section.slug)}>
                {event.section.name}
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
