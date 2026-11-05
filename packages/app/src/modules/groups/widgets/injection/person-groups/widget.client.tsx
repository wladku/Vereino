'use client'
// The "Groups" tab of the person record (README B-10, mockup `screenPerson` tab `groups`; #84): every membership of the
// person — active, upcoming and ended — with the group (a link to its page), the section, the role and the period.
// The list is the caller's record scope of `GET /api/groups/memberships`: a coordinator sees only the memberships in
// the groups of their sections, the club administrator every one.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { rosterOrder } from '../../../lib/groups-rules'
import {
  GROUPS_HREF,
  errorMessage,
  localToday,
  periodLabel,
  roleLabel,
  rowStatus,
  type MembershipRow,
} from '../../../components/client-helpers'

/** What `people`'s person record passes as the spot context. */
export type PersonGroupsContext = { personId?: string }

const PAGE_SIZE = 100

export default function PersonGroupsWidget({
  context,
}: InjectionWidgetComponentProps<PersonGroupsContext, Record<string, unknown>>) {
  const t = useT()
  const personId = context?.personId ?? null
  const query = useQuery({
    queryKey: ['groups-person-memberships', personId],
    enabled: Boolean(personId),
    queryFn: async () => {
      const params = new URLSearchParams({
        personId: personId ?? '',
        pageSize: String(PAGE_SIZE),
        sortField: 'validFrom',
        sortDir: 'desc',
      })
      const data = await readApiResultOrThrow<{ items?: MembershipRow[] }>(
        `/api/groups/memberships?${params.toString()}`,
      )
      return data.items ?? []
    },
  })

  const today = localToday()
  const rows = rosterOrder(
    (query.data ?? []).map((row) => ({ ...row, validFrom: row.validFrom ?? '', validTo: row.validTo })),
    today,
  )
  const activeCount = rows.filter((row) => rowStatus(row, today) === 'active').length

  return (
    <section className="bg-card flex flex-col gap-4 rounded-lg border p-4" aria-label={t('groups.personGroups.title')}>
      <SectionHeader title={t('groups.personGroups.title')} count={activeCount} />
      {query.isLoading ? <LoadingMessage label={t('groups.common.loading')} /> : null}
      {query.error ? <ErrorMessage label={errorMessage(query.error, t('groups.personGroups.errors.load'))} /> : null}
      {query.isSuccess && rows.length === 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t('groups.personGroups.empty.title')}</p>
          <p className="text-muted-foreground text-sm">{t('groups.personGroups.empty.text')}</p>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y" aria-label={t('groups.personGroups.list')}>
          {rows.map((row) => {
            const status = rowStatus(row, today)
            const groupName = row.group?.name ?? t('groups.personGroups.unknownGroup')
            return (
              <li
                key={row.id}
                className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                data-membership-status={status}
              >
                <span className="flex min-w-0 flex-col">
                  {row.groupId ? (
                    <Link
                      href={`${GROUPS_HREF}/${row.groupId}`}
                      className="font-medium break-words underline-offset-4 hover:underline"
                    >
                      {groupName}
                    </Link>
                  ) : (
                    <span className="font-medium break-words">{groupName}</span>
                  )}
                  <span className="text-muted-foreground text-xs break-words">
                    {row.group?.sectionName ?? t('groups.common.empty')}
                  </span>
                </span>
                <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                  <span>{roleLabel(t, row.role, row.group?.kind ?? null)}</span>
                  <span>{periodLabel(t, row.validFrom || null, row.validTo)}</span>
                  <StatusBadge variant={status === 'active' ? 'success' : 'neutral'}>
                    {t(`groups.common.status.${status}`)}
                  </StatusBadge>
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
