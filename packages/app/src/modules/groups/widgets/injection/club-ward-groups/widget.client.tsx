'use client'
// The groups and sections of one ward on `/club/profile` and `/club/wards/[personId]` (E06-S22 #104; README M-10):
// one read of `GET /api/groups/member-groups` per page (a shared query), filtered to the ward the spot names. `compact`
// is the line inside a ward card; `section` is the ward page's own section with a heading.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import type { MemberGroupRow } from '../../../lib/member-groups'

/** The spot context `people`'s member pages pass: the ward (or member) person and the layout. */
export type ClubWardGroupsContext = { personId?: string; variant?: 'compact' | 'section' }

const MEMBER_GROUPS_API = '/api/groups/member-groups'
const MEMBER_GROUPS_QUERY_KEY = ['groups-member-groups'] as const

function useMemberGroups() {
  return useQuery({
    queryKey: MEMBER_GROUPS_QUERY_KEY,
    queryFn: async (): Promise<MemberGroupRow[]> => {
      const call = await apiCall<{ items?: MemberGroupRow[] }>(MEMBER_GROUPS_API)
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result.items ?? []
    },
  })
}

function rowLabel(row: MemberGroupRow, t: ReturnType<typeof useT>): string {
  const role =
    row.role === 'participant'
      ? ''
      : ` (${t(row.groupKind === 'class_group' ? `groups.memberships.role.class_group.${row.role}` : `groups.memberships.role.${row.role}`)})`
  return row.sectionName ? `${row.groupName}${role} · ${row.sectionName}` : `${row.groupName}${role}`
}

export default function ClubWardGroupsWidget({
  context,
}: InjectionWidgetComponentProps<ClubWardGroupsContext, Record<string, unknown>>) {
  const t = useT()
  const query = useMemberGroups()
  const personId = context.personId
  const section = context.variant === 'section'
  const rows = (query.data ?? []).filter((row) => row.personId === personId)

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <p className="text-muted-foreground text-sm">{t('groups.club.wardGroups.loading')}</p>
  } else if (!query.data) {
    body = <p className="text-muted-foreground text-sm">{t('groups.club.wardGroups.error')}</p>
  } else if (rows.length === 0) {
    body = <p className="text-muted-foreground text-sm">{t('groups.club.wardGroups.empty')}</p>
  } else {
    body = (
      <ul className="flex flex-col gap-1" aria-label={t('groups.club.wardGroups.title')}>
        {rows.map((row) => (
          <li key={`${row.groupId}-${row.role}`} className="text-sm break-words" data-testid="club-ward-group">
            {rowLabel(row, t)}
          </li>
        ))}
      </ul>
    )
  }

  if (!section) {
    return (
      <div className="flex flex-col gap-1" data-testid="club-ward-groups">
        <span className="text-muted-foreground text-xs">{t('groups.club.wardGroups.title')}</span>
        {body}
      </div>
    )
  }
  return (
    <section
      aria-labelledby="club-ward-groups"
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      data-testid="club-ward-groups"
    >
      <h2 id="club-ward-groups" className="text-lg font-semibold">
        {t('groups.club.wardGroups.title')}
      </h2>
      {body}
    </section>
  )
}
