'use client'
// `/club/training/library` — the shared outline library on the phone (training outlines spec M-O8, J-O03; REQ-O11,
// REQ-O12; E24-S05, #685): search by topic or goal, filters by age category and part, sort by ranking, most used or
// newest; cards with the rating, the uses and the credit. Opened from a session's card (`?occurrenceId=`) the entry
// pages copy the chosen outline into that session. States: loading, error with retry, empty, library off.
import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton, Notice, StatusTag } from '@vereino/ui'
import { LIBRARY_SORTS, type LibrarySort } from '../../lib/library'
import { OUTLINE_PARTS, type OutlinePart } from '../../lib/outline'
import { CreditLine, RatingLine } from '../LibraryEntryView'
import { TrainingClubFrame } from './TrainingClubFrame'
import { OUTLINES_HREF, sessionHref } from './club-client'
import { libraryEntryHref, useLibrary, type LibraryCard, type LibraryFilters } from './library-client'

const selectClass =
  'border-input bg-background focus-visible:ring-ring min-h-11 rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:outline-none'

function EntryCard({ item, occurrenceId }: { item: LibraryCard; occurrenceId?: string }) {
  const t = useT()
  return (
    <li>
      <Link
        href={libraryEntryHref(item.id, { occurrenceId })}
        className="bg-card hover:bg-muted focus-visible:ring-ring flex min-h-11 flex-col gap-1 rounded-lg border p-4 focus-visible:ring-2 focus-visible:outline-none"
        data-testid="training-library-card"
      >
        <span className="font-semibold">{item.topic}</span>
        <span className="text-muted-foreground text-sm">
          {[item.ageCategory, t('training.outline.minutesShort', { minutes: item.durationMinutes })].join(' · ')}
        </span>
        <CreditLine credit={item.credit} />
        <RatingLine entry={item} />
        <span className="flex flex-wrap gap-2">
          <StatusTag status={item.visibility === 'public' ? 'success' : 'info'}>
            {t(`training.library.visibility.${item.visibility}`)}
          </StatusTag>
          {item.ownClub ? <StatusTag status="neutral">{t('training.library.ownClub')}</StatusTag> : null}
        </span>
      </Link>
    </li>
  )
}

function Library() {
  const t = useT()
  const id = React.useId()
  const occurrenceId = useSearchParams().get('occurrenceId') ?? undefined
  const [filters, setFilters] = React.useState<LibraryFilters>({ q: '', ageCategory: '', part: '', sort: 'ranking' })
  const [q, setQ] = React.useState('')
  const query = useLibrary(filters)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => (current.q === q.trim() ? current : { ...current, q: q.trim() }))
    }, 300)
    return () => {
      clearTimeout(timer)
    }
  }, [q])

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('training.library.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('training.library.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('training.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.status === 'off') {
    body = <Notice data-testid="training-library-off">{t('training.library.off')}</Notice>
  } else if (query.data.items.length === 0) {
    body = (
      <p className="text-muted-foreground" data-testid="training-library-empty">
        {t(
          filters.q || filters.ageCategory || filters.part
            ? 'training.library.emptyFiltered'
            : 'training.library.empty',
        )}
      </p>
    )
  } else {
    body = (
      <ul className="flex flex-col gap-3" data-testid="training-library-cards">
        {query.data.items.map((item) => (
          <EntryCard key={item.id} item={item} occurrenceId={occurrenceId} />
        ))}
      </ul>
    )
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="training-library-heading">
      <Link
        href={occurrenceId ? sessionHref(occurrenceId) : OUTLINES_HREF}
        className="text-primary inline-flex min-h-11 items-center text-sm underline"
      >
        {t(occurrenceId ? 'training.editor.backToSession' : 'training.library.backToOutlines')}
      </Link>
      <h1 id="training-library-heading" className="text-xl font-semibold">
        {t('training.library.title')}
      </h1>
      {occurrenceId ? <Notice>{t('training.library.pickForSession')}</Notice> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-q`}>{t('training.library.search')}</Label>
          <Input
            id={`${id}-q`}
            type="search"
            className="min-h-11"
            value={q}
            onChange={(event) => {
              setQ(event.target.value)
            }}
            data-testid="training-library-search"
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
            data-testid="training-library-age"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-part`}>{t('training.library.part')}</Label>
          <select
            id={`${id}-part`}
            className={selectClass}
            value={filters.part}
            onChange={(event) => {
              const part = event.target.value as OutlinePart | ''
              setFilters((current) => ({ ...current, part }))
            }}
            data-testid="training-library-part"
          >
            <option value="">{t('training.library.anyPart')}</option>
            {OUTLINE_PARTS.map((part) => (
              <option key={part} value={part}>
                {t(`training.outline.parts.${part}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-sort`}>{t('training.library.sort')}</Label>
          <select
            id={`${id}-sort`}
            className={selectClass}
            value={filters.sort}
            onChange={(event) => {
              const sort = event.target.value as LibrarySort
              setFilters((current) => ({ ...current, sort }))
            }}
            data-testid="training-library-sort"
          >
            {LIBRARY_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t(`training.library.sorts.${sort}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {body}
    </section>
  )
}

export function LibraryPage() {
  return <TrainingClubFrame>{() => <Library />}</TrainingClubFrame>
}
