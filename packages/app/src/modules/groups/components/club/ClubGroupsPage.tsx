'use client'
// `/club/groups` — the groups on the phone (groups and activities parity spec REQ-A11, J-A01 step 4; D-031 §3; #274):
// a section coordinator sees the active groups of their sections, a coach the groups they coach — the record scope of
// `GET /api/groups/groups` decides which, the page only names it. Each card shows the group, its section, its coaches
// and the number of active participants, and opens the roster. States: loading, error with retry, empty. Phone-first.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CLUB_GROUPS_HREF, MemberSkeleton } from '@vereino/ui'
import { personName, type GroupListRow } from '../client-helpers'
import { useCanManageGroups } from '../useCanManageGroups'
import { GroupsClubFrame } from './GroupsClubFrame'

function clubGroupHref(id: string): string {
  return `${CLUB_GROUPS_HREF}/${encodeURIComponent(id)}`
}

class GroupsLoadError extends Error {}

/** The caller's active groups, by section and then by name (one page: a section rarely runs 100 groups). */
function useClubGroups() {
  return useQuery({
    queryKey: ['groups-club-groups'],
    queryFn: async () => {
      const call = await apiCall<{ items?: GroupListRow[] }>(
        '/api/groups/groups?isActive=true&sortField=name&sortDir=asc&pageSize=100',
      )
      if (!call.ok || !call.result) throw new GroupsLoadError(String(call.status))
      const items = call.result.items ?? []
      return [...items].sort(
        (a, b) =>
          (a.sectionName ?? '').localeCompare(b.sectionName ?? '') || (a.name ?? '').localeCompare(b.name ?? ''),
      )
    },
  })
}

function GroupCard({ group }: { group: GroupListRow }) {
  const t = useT()
  const coaches = (group.coaches ?? []).map((coach) => personName(coach)).filter(Boolean)
  return (
    <Link
      href={clubGroupHref(group.id)}
      className="bg-card hover:bg-accent focus-visible:focus-indicator flex min-h-11 flex-col gap-1 rounded-lg border p-3 outline-none"
      data-testid="club-group"
      data-group-id={group.id}
    >
      <span className="font-semibold break-words">{group.name}</span>
      <span className="text-muted-foreground text-sm break-words">
        {[
          group.sectionName,
          t('groups.club.list.participants', { count: String(group.participantCount ?? 0) }),
          coaches.length > 0 ? t('groups.club.list.coaches', { names: coaches.join(', ') }) : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(' · ')}
      </span>
    </Link>
  )
}

function Groups() {
  const t = useT()
  const canManage = useCanManageGroups()
  const query = useClubGroups()
  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('groups.club.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('groups.club.errors.groups')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('groups.club.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.length === 0) {
    body = (
      <p className="text-muted-foreground" data-testid="club-groups-empty">
        {t('groups.club.list.empty')}
      </p>
    )
  } else {
    body = (
      <ul className="flex flex-col gap-2" data-testid="club-groups">
        {query.data.map((group) => (
          <li key={group.id}>
            <GroupCard group={group} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('groups.club.title')}</h1>
        <p className="text-muted-foreground text-sm" data-testid="club-groups-scope">
          {canManage ? t('groups.club.list.sections') : t('groups.club.list.coached')}
        </p>
      </header>
      {body}
    </>
  )
}

export function ClubGroupsPage() {
  return <GroupsClubFrame>{() => <Groups />}</GroupsClubFrame>
}
