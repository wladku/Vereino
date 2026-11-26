'use client'
// `/club/applications` — the coordinator's applications on the phone (sign-up form spec M-J2, REQ-J10, REQ-J11,
// J-J03, J-J04; #799): the tabs New, Trial session, Waiting list and Closed (`?tab=`), the section filter when the
// caller decides several sections, the name search (not on Closed: closed names are not searchable), and one card per
// application — participant, age on the reference date, chosen group or "Choose for us", confirmed date and the flags
// with their words. The waiting list is grouped by group with the numbers "#1, #2". States: loading skeleton, error
// with retry, an empty sentence per tab.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton, browserTimeZone, useClubTimeZone } from '@vereino/ui'
import { clubApplicationHref } from '../../lib/paths'
import {
  FlagTags,
  ListFilters,
  TabButtons,
  groupLabel,
  tabFromParam,
  useAgeLabel,
  useDebounced,
  useKnownSections,
} from './ApplicationParts'
import { EnrolmentClubFrame } from './EnrolmentClubFrame'
import {
  groupWaiting,
  instantDateLabel,
  useApplications,
  type ApplicationListItem,
  type ApplicationTab,
} from './applications-client'

function ApplicationCard({ item, showSection }: { item: ApplicationListItem; showSection: boolean }) {
  const t = useT()
  const locale = useLocale()
  const timeZone = useClubTimeZone() ?? browserTimeZone()
  const age = useAgeLabel()
  const dateLine =
    item.tab === 'closed'
      ? t('enrolment.club.list.closedOn', { date: instantDateLabel(item.closedAt, locale, timeZone) })
      : t('enrolment.club.list.confirmedOn', { date: instantDateLabel(item.confirmedAt, locale, timeZone) })
  return (
    <li>
      <Link
        href={clubApplicationHref(item.id)}
        className="bg-card hover:bg-muted focus-visible:ring-ring flex min-h-11 flex-col gap-1 rounded-lg border p-4 focus-visible:ring-2 focus-visible:outline-none"
        data-testid="enrolment-row"
        data-id={item.id}
        data-state={item.state}
      >
        <span className="flex flex-wrap items-baseline gap-2">
          {item.waitingNumber !== null && item.tab === 'waiting' ? (
            <span className="font-semibold tabular-nums" data-testid="enrolment-waiting-number">
              {t('enrolment.club.list.waitingNumber', { number: item.waitingNumber })}
            </span>
          ) : null}
          <span className="font-semibold break-words">{item.participantName || t('enrolment.club.anonymised')}</span>
        </span>
        <span className="text-muted-foreground text-sm">
          {[age(item), groupLabel(t, item), showSection ? item.sectionName : null].filter(Boolean).join(' · ')}
        </span>
        <span className="text-muted-foreground text-sm">
          {item.tab === 'closed' ? `${t(`enrolment.states.${item.state}`)} · ${dateLine}` : dateLine}
        </span>
        <FlagTags flags={item.flags} />
      </Link>
    </li>
  )
}

function ApplicationRows({
  tab,
  items,
  showSection,
}: {
  tab: ApplicationTab
  items: ApplicationListItem[]
  showSection: boolean
}) {
  const t = useT()
  if (tab !== 'waiting') {
    return (
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <ApplicationCard key={item.id} item={item} showSection={showSection} />
        ))}
      </ul>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {groupWaiting(items).map((group) => (
        <section
          key={group.key}
          className="flex flex-col gap-2"
          aria-label={group.groupName ?? t('enrolment.club.empty')}
        >
          <h2 className="font-semibold">{group.groupName ?? t('enrolment.club.empty')}</h2>
          <ul className="flex flex-col gap-3">
            {group.items.map((item) => (
              <ApplicationCard key={item.id} item={item} showSection={showSection} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Applications() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = tabFromParam(searchParams.get('tab'))
  const [sectionId, setSectionId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const q = useDebounced(search)
  const query = useApplications({ tab, sectionId, q: tab === 'closed' ? '' : q })
  const sections = useKnownSections(query.data?.items)
  const setTab = (next: ApplicationTab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    router.replace(`${pathname}?${params.toString()}`)
  }

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('enrolment.club.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('enrolment.club.errors.list')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('enrolment.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.items.length === 0) {
    body = (
      <p className="text-muted-foreground" data-testid="enrolment-empty">
        {t(q || sectionId ? 'enrolment.club.list.emptyFiltered' : `enrolment.club.list.empty.${tab}`)}
      </p>
    )
  } else {
    body = <ApplicationRows tab={tab} items={query.data.items} showSection={sections.size > 1 && !sectionId} />
  }

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="enrolment-list-heading"
      aria-busy={query.isFetching}
      data-testid="enrolment-list"
      data-tab={tab}
    >
      <h1 id="enrolment-list-heading" className="text-xl font-semibold">
        {t('enrolment.club.list.title')}
      </h1>
      <TabButtons tab={tab} onChange={setTab} />
      <ListFilters
        tab={tab}
        sections={sections}
        sectionId={sectionId}
        onSectionChange={setSectionId}
        search={search}
        onSearchChange={setSearch}
      />
      {body}
      {query.data && query.data.total > query.data.items.length ? (
        <p className="text-muted-foreground text-sm">
          {t('enrolment.club.list.more', { shown: query.data.items.length, total: query.data.total })}
        </p>
      ) : null}
    </section>
  )
}

export function ApplicationsListPage() {
  return <EnrolmentClubFrame>{() => <Applications />}</EnrolmentClubFrame>
}
