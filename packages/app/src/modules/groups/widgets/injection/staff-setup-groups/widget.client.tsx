'use client'
// "Groups as coach" in the person record's "Staff setup" checklist (people life-cycle spec REQ-L09, J-L07 step 2;
// #312): done when the person is an active coach or assistant of a group (pending when such a membership starts
// later), with the groups named. With `groups.manage` "Add to a group as coach" picks an active group and opens its
// roster with the person and the coach role chosen (`?tab=roster&personId=…&role=coach`, the roster's deep link).
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { STAFF_STEP_VARIANT, periodStep } from '@vereino/core'
import { useClubToday } from '@vereino/ui'
import { isCoachingRole, type MembershipRole } from '../../../lib/groups-rules'
import { GROUPS_HREF, type GroupRow, type MembershipRow } from '../../../components/client-helpers'
import { useCanManageGroups } from '../../../components/useCanManageGroups'

/** What `people`'s person record passes as the spot context. */
export type StaffSetupGroupsContext = { personId?: string }

async function activeGroups(search: string): Promise<LookupSelectItem[]> {
  const params: Record<string, string | number | boolean> = { isActive: true, pageSize: 50, sortField: 'name' }
  if (search.trim().length >= 2) params.search = search.trim()
  const data = await fetchCrudList<GroupRow>('groups/groups', params)
  return data.items.map((group) => ({
    id: group.id,
    title: group.name ?? group.id,
    subtitle: group.sectionName ?? null,
  }))
}

export default function StaffSetupGroupsWidget({
  context,
}: InjectionWidgetComponentProps<StaffSetupGroupsContext, Record<string, unknown>>) {
  const t = useT()
  const today = useClubToday()
  const router = useRouter()
  const canManage = useCanManageGroups()
  const personId = context.personId ?? null
  const query = useQuery({
    queryKey: ['groups-staff-setup', personId],
    enabled: Boolean(personId),
    queryFn: async () => {
      const params = new URLSearchParams({ personId: personId ?? '', pageSize: '100' })
      const data = await readApiResultOrThrow<{ items?: MembershipRow[] }>(
        `/api/groups/memberships?${params.toString()}`,
      )
      return (data.items ?? []).filter(
        (row) => row.validFrom !== null && row.role !== null && isCoachingRole(row.role as MembershipRole),
      )
    },
  })
  const rows = query.data ?? []
  const periods = rows.map((row) => ({
    validFrom: row.validFrom as string,
    validTo: row.validTo,
    name: row.group?.name,
  }))
  const step = periodStep(periods, today)
  const active = [
    ...new Set(
      periods
        .filter((period) => periodStep([period], today) === 'done')
        .map((period) => period.name)
        .filter((name): name is string => Boolean(name)),
    ),
  ]
  const detail = query.isError
    ? t('groups.staffSetup.errors.load')
    : active.length > 0
      ? active.join(', ')
      : t('groups.staffSetup.none')

  return (
    <div
      className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
      data-testid="groups-staff-setup"
      data-step={query.isSuccess ? step : undefined}
    >
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t('groups.staffSetup.title')}</span>
          {query.isSuccess ? (
            <StatusBadge variant={STAFF_STEP_VARIANT[step]}>{t(`groups.staffSetup.step.${step}`)}</StatusBadge>
          ) : null}
        </span>
        <span className="text-muted-foreground text-xs">{query.isLoading ? t('groups.common.loading') : detail}</span>
      </span>
      {canManage && personId ? (
        <div className="sm:w-72" data-testid="groups-staff-setup-add">
          <LookupSelect
            value={null}
            onChange={(groupId) => {
              if (!groupId) return
              const params = new URLSearchParams({ tab: 'roster', personId, role: 'coach' })
              router.push(`${GROUPS_HREF}/${encodeURIComponent(groupId)}?${params.toString()}`)
            }}
            fetchItems={activeGroups}
            minQuery={0}
            placeholder={t('groups.staffSetup.add')}
            searchPlaceholder={t('groups.memberships.move.group.search')}
            emptyLabel={t('groups.staffSetup.add.empty')}
            loadingLabel={t('groups.common.loading')}
            clearLabel={t('groups.common.clear')}
            selectLabel={t('groups.common.select')}
            selectedLabel={t('groups.common.selected')}
          />
        </div>
      ) : null}
    </div>
  )
}
