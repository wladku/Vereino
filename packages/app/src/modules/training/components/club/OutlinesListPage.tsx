'use client'
// `/club/training/outlines` — the coach's outlines on the phone (training outlines spec M-O5; REQ-O06; #683): the views
// "My outlines" (own outlines attached nowhere — the ones to copy into a session), "Sessions" (session outlines) and
// "All" the caller's grants admit (own, the groups they coach, the sections they coordinate, the club for the
// administrator); filters by topic text and age category; "New outline". States: loading, error with retry, empty.
import * as React from 'react'
import Link from 'next/link'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton, StatusTag } from '@vereino/ui'
import { TrainingClubFrame } from './TrainingClubFrame'
import {
  newOutlineHref,
  outlineHref,
  useOutlines,
  type OutlineListFilters,
  type OutlineListItem,
  type OutlineListView,
} from './club-client'

const VIEWS: readonly OutlineListView[] = ['mine', 'sessions', 'all']

function OutlineCard({ item }: { item: OutlineListItem }) {
  const t = useT()
  const locale = useLocale()
  return (
    <li>
      <Link
        href={outlineHref(item.id)}
        className="bg-card hover:bg-muted focus-visible:ring-ring flex min-h-11 flex-col gap-1 rounded-lg border p-4 focus-visible:ring-2 focus-visible:outline-none"
        data-testid="training-outline-card"
      >
        <span className="font-semibold">{item.topic}</span>
        <span className="text-muted-foreground text-sm">
          {[
            item.ageCategory,
            t('training.outline.minutesShort', { minutes: item.durationMinutes }),
            item.groupName,
            item.sessionDate ? new Date(`${item.sessionDate}T12:00:00`).toLocaleDateString(locale) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="flex flex-wrap gap-2">
          {item.occurrenceId ? <StatusTag status="info">{t('training.list.kind.session')}</StatusTag> : null}
          {item.activityId ? <StatusTag status="info">{t('training.list.kind.series')}</StatusTag> : null}
          {!item.occurrenceId && !item.activityId ? (
            <StatusTag status="neutral">{t('training.list.kind.own')}</StatusTag>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

function Outlines() {
  const t = useT()
  const id = React.useId()
  const [filters, setFilters] = React.useState<OutlineListFilters>({ view: 'mine', search: '', ageCategory: '' })
  const [search, setSearch] = React.useState('')
  const query = useOutlines(filters)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => (current.search === search.trim() ? current : { ...current, search: search.trim() }))
    }, 300)
    return () => {
      clearTimeout(timer)
    }
  }, [search])

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('training.list.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('training.list.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('training.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.items.length === 0) {
    body = (
      <p className="text-muted-foreground" data-testid="training-outlines-empty">
        {t(
          filters.search || filters.ageCategory ? 'training.list.emptyFiltered' : `training.list.empty.${filters.view}`,
        )}
      </p>
    )
  } else {
    body = (
      <ul className="flex flex-col gap-3" data-testid="training-outlines">
        {query.data.items.map((item) => (
          <OutlineCard key={item.id} item={item} />
        ))}
      </ul>
    )
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="training-outlines-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="training-outlines-heading" className="text-xl font-semibold">
          {t('training.list.title')}
        </h1>
        <Button asChild className="min-h-11">
          <Link href={newOutlineHref()} data-testid="training-outline-new">
            {t('training.list.new')}
          </Link>
        </Button>
      </div>
      <div role="group" aria-label={t('training.list.views')} className="flex flex-wrap gap-2">
        {VIEWS.map((view) => (
          <Button
            key={view}
            type="button"
            className="min-h-11"
            variant={filters.view === view ? 'default' : 'outline'}
            aria-pressed={filters.view === view}
            onClick={() => {
              setFilters((current) => ({ ...current, view }))
            }}
            data-testid={`training-view-${view}`}
          >
            {t(`training.list.view.${view}`)}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-search`}>{t('training.list.search')}</Label>
          <Input
            id={`${id}-search`}
            type="search"
            className="min-h-11"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
            }}
            data-testid="training-outlines-search"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-age`}>{t('training.outline.fields.ageCategory')}</Label>
          <Input
            id={`${id}-age`}
            className="min-h-11"
            value={filters.ageCategory}
            onChange={(event) => {
              const ageCategory = event.target.value
              setFilters((current) => ({ ...current, ageCategory }))
            }}
            data-testid="training-outlines-age"
          />
        </div>
      </div>
      {body}
    </section>
  )
}

export function OutlinesListPage() {
  return <TrainingClubFrame>{() => <Outlines />}</TrainingClubFrame>
}
