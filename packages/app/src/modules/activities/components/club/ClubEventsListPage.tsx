'use client'
// `/club/club-events` — the club events of the caller's scope on the phone (club events spec REQ-T12, UI row
// `/club/club-events`; E14-S05, #380): the upcoming events first, then the past ones, and the cancelled ones when there
// are any, each as a card — name, dates, place with the external mark, section or "Whole club", the number of parts,
// Public and the status — linking to the event page. **New club event** opens the form; with no event at all the page
// says "No club events yet" and offers it. The list is `GET /api/activities/club-events?view=`, scoped by the server;
// each view shows 20 cards and **Show more** adds the next 20.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton, StatusTag } from '@vereino/ui'
import { OWN_FORBIDDEN_STATE } from '../client-helpers'
import {
  MEMBER_CLUB_EVENT_NEW_HREF,
  clubEventDatesLabel,
  clubEventStatusVariant,
  memberClubEventHref,
  type ClubEventRow,
} from '../club-events-client'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import type { Translate } from './club-client'

const VIEWS = ['upcoming', 'past', 'cancelled'] as const
type View = (typeof VIEWS)[number]
type ListLoad = Record<View, ClubEventRow[]>

/** The rows of one view come in pages of this size, at most `MAX_PAGES` of them. */
const FETCH_PAGE_SIZE = 200
const MAX_PAGES = 10
/** The cards a view shows at first and adds with each **Show more**. */
const SHOWN_STEP = 20

/**
 * Every event of one view, upcoming soonest first and past latest first. The dates are derived from the parts, so the
 * route cannot sort by them: the page reads all pages and sorts here, or the newest past events could fall outside an
 * alphabetical first page (#440). An event without a part yet ends the upcoming list.
 */
async function fetchView(view: View): Promise<ClubEventRow[]> {
  const rows: ClubEventRow[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      view,
      page: String(page),
      pageSize: String(FETCH_PAGE_SIZE),
      sortField: 'name',
      sortDir: 'asc',
    })
    const call = await apiCall<{ items?: ClubEventRow[]; totalPages?: number }>(
      `/api/activities/club-events?${params.toString()}`,
      OWN_FORBIDDEN_STATE,
    )
    if (!call.ok) throw new Error(String(call.status))
    rows.push(...(call.result?.items ?? []))
    if (page >= (call.result?.totalPages ?? 1)) break
  }
  return rows.sort((a, b) => {
    const left = a.dateFrom ?? '9999-12-31'
    const right = b.dateFrom ?? '9999-12-31'
    return view === 'upcoming' ? left.localeCompare(right) : right.localeCompare(left)
  })
}

function useClubEventLists() {
  return useQuery({
    queryKey: ['activities-member-club-events'],
    queryFn: async (): Promise<ListLoad> => {
      const [upcoming, past, cancelled] = await Promise.all(VIEWS.map(fetchView))
      return { upcoming, past, cancelled }
    },
  })
}

function EventCard({ row, t, locale }: { row: ClubEventRow; t: Translate; locale: string }) {
  const dates = clubEventDatesLabel(locale, row)
  const cancelled = row.status === 'cancelled'
  return (
    <li>
      <Link
        href={memberClubEventHref(row.id)}
        className="bg-card hover:bg-muted/50 focus-visible:focus-indicator flex min-h-11 flex-col gap-1 rounded-lg border p-4"
        data-testid="club-events-card"
      >
        <span className="flex items-start justify-between gap-2">
          <span className={`font-semibold break-words ${cancelled ? 'line-through' : ''}`}>{row.name}</span>
          <StatusTag status={clubEventStatusVariant(row.status)}>
            {t(`activities.clubEvents.status.${cancelled ? 'cancelled' : 'planned'}`)}
          </StatusTag>
        </span>
        <span className="text-muted-foreground text-sm">{dates ?? t('activities.clubEvents.record.noDates')}</span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>{row.placeName ?? t('activities.common.empty')}</span>
          {row.placeExternal ? (
            <StatusTag status="neutral">{t('activities.clubEvents.place.external')}</StatusTag>
          ) : null}
          <span aria-hidden>·</span>
          <span>{row.sectionId ? (row.sectionName ?? '') : t('activities.clubEvents.section.wholeClub')}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t('activities.clubEvents.club.list.parts', { count: row.partsCount ?? 0 })}</span>
          {row.isPublic ? <StatusTag status="success">{t('activities.clubEvents.public.yes')}</StatusTag> : null}
        </span>
      </Link>
    </li>
  )
}

function ClubEventsList({ t }: { t: Translate }) {
  const locale = useLocale()
  const query = useClubEventLists()
  const [shown, setShown] = React.useState<Record<View, number>>({
    upcoming: SHOWN_STEP,
    past: SHOWN_STEP,
    cancelled: SHOWN_STEP,
  })
  const newButton = (
    <Button asChild className="min-h-11 w-full sm:w-auto">
      <Link href={MEMBER_CLUB_EVENT_NEW_HREF} data-testid="club-events-new">
        {t('activities.clubEvents.actions.create')}
      </Link>
    </Button>
  )
  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('activities.clubEvents.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('activities.clubEvents.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (VIEWS.every((view) => query.data[view].length === 0)) {
    body = (
      <section className="flex flex-col gap-3 rounded-lg border border-dashed p-6" data-testid="club-events-empty">
        <h2 className="text-lg font-semibold">{t('activities.clubEvents.empty.title')}</h2>
        <p className="text-muted-foreground max-w-prose text-sm">{t('activities.clubEvents.empty.text')}</p>
        {newButton}
      </section>
    )
  } else {
    body = (
      <>
        {VIEWS.map((view) => {
          const rows = query.data[view]
          if (view !== 'upcoming' && rows.length === 0) return null
          return (
            <section key={view} className="flex flex-col gap-2" aria-labelledby={`club-events-${view}`}>
              <h2 id={`club-events-${view}`} className="text-lg font-semibold">
                {t(`activities.clubEvents.views.${view}`)}
              </h2>
              {rows.length === 0 ? (
                <p className="text-muted-foreground text-sm" data-testid={`club-events-${view}-empty`}>
                  {t('activities.clubEvents.club.list.noUpcoming')}
                </p>
              ) : (
                <ul className="flex flex-col gap-3" data-testid={`club-events-${view}`}>
                  {rows.slice(0, shown[view]).map((row) => (
                    <EventCard key={row.id} row={row} t={t} locale={locale} />
                  ))}
                </ul>
              )}
              {rows.length > shown[view] ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto sm:self-start"
                  data-testid={`club-events-${view}-more`}
                  onClick={() => {
                    setShown((current) => ({ ...current, [view]: current[view] + SHOWN_STEP }))
                  }}
                >
                  {t('activities.clubEvents.club.list.showMore', { shown: shown[view], total: rows.length })}
                </Button>
              ) : null}
            </section>
          )
        })}
      </>
    )
  }
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">{t('activities.clubEvents.title')}</h1>
        {query.data && VIEWS.some((view) => query.data[view].length > 0) ? newButton : null}
      </div>
      <p className="text-muted-foreground max-w-prose text-sm">{t('activities.clubEvents.club.list.intro')}</p>
      {body}
    </>
  )
}

export function ClubEventsListPage() {
  const t = useT()
  return <ActivitiesClubFrame>{() => <ClubEventsList t={t} />}</ActivitiesClubFrame>
}
