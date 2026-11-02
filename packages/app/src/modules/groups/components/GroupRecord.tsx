'use client'
// `/backend/groups/groups/[id]` (club spec UI table): the group record with the tabs "Roster" (memberships with their
// history) and "Details". A coach reads the roster of their own group; a coordinator of the group's section and the
// club administrator also edit the group and its roster (`groups.manage`). The server decides the scope: a group
// outside it answers 403 and the page shows the permission-denied state.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { GroupDetailsForm } from './GroupForm'
import { RosterPanel } from './RosterPanel'
import { GROUPS_HREF, OWN_FORBIDDEN_STATE, kindLabel, type GroupDetail, type Translate } from './client-helpers'
import { useCanManageGroups } from './useCanManageGroups'

type GroupLoad = { status: 'ok'; group: GroupDetail } | { status: 'not_found' } | { status: 'denied' }

function ReadOnlyDetails({ group, t }: { group: GroupDetail; t: Translate }) {
  const rows: Array<[string, string | null | undefined]> = [
    [t('groups.groups.fields.name'), group.name],
    [t('groups.groups.fields.kind'), kindLabel(t, group.kind)],
    [t('groups.groups.fields.section'), group.sectionName],
    [t('groups.groups.fields.description'), group.description],
  ]
  if (group.kind === 'team') {
    rows.push([t('groups.groups.fields.league'), group.league], [t('groups.groups.fields.season'), group.seasonName])
  }
  return (
    <section className="bg-card flex flex-col gap-3 rounded-lg border p-4" aria-label={t('groups.groups.tabs.details')}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-sm break-words whitespace-pre-wrap">{value || t('groups.common.empty')}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function GroupRecord({ id }: { id: string }) {
  const t = useT()
  const canManage = useCanManageGroups()
  const [tab, setTab] = React.useState('roster')
  const query = useQuery({
    queryKey: ['groups-group', id],
    queryFn: async (): Promise<GroupLoad> => {
      const call = await apiCall<GroupDetail>(`/api/groups/groups/${encodeURIComponent(id)}`, OWN_FORBIDDEN_STATE)
      if (call.status === 404) return { status: 'not_found' }
      if (call.status === 403) return { status: 'denied' }
      if (!call.ok || !call.result) throw new Error(t('groups.groups.errors.loadOne'))
      return { status: 'ok', group: call.result }
    },
  })
  const refetch = React.useCallback(async () => {
    await query.refetch()
  }, [query])

  if (query.isLoading) return <LoadingMessage label={t('groups.groups.loading')} />
  if (query.error) return <ErrorMessage label={t('groups.groups.errors.loadOne')} />
  const load = query.data
  if (!load || load.status === 'not_found') {
    return (
      <RecordNotFoundState
        label={t('groups.groups.errors.notFound')}
        backHref={GROUPS_HREF}
        backLabel={t('groups.groups.actions.back')}
      />
    )
  }
  if (load.status === 'denied') return <AccessDeniedMessage label={t('groups.groups.errors.denied')} />

  const group = load.group
  // A coach reads the group without `groups.manage`; the server refuses writes outside the caller's sections anyway.
  const canEdit = canManage
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words">{group.name ?? t('groups.groups.record.title')}</h1>
          <span className="text-muted-foreground text-sm">
            {[kindLabel(t, group.kind), group.sectionName].filter(Boolean).join(' · ')}
          </span>
        </div>
        <StatusBadge variant={group.isActive ? 'success' : 'neutral'}>
          {group.isActive ? t('groups.common.active') : t('groups.common.inactive')}
        </StatusBadge>
      </header>
      <Tabs value={tab} onValueChange={setTab} variant="underline">
        <div className="overflow-x-auto">
          <TabsList aria-label={t('groups.groups.tabs.label')}>
            <TabsTrigger value="roster">{t('groups.groups.tabs.roster')}</TabsTrigger>
            <TabsTrigger value="details">{t('groups.groups.tabs.details')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="roster" className="pt-4">
          <RosterPanel groupId={group.id} groupKind={group.kind} canManage={canEdit} />
        </TabsContent>
        <TabsContent value="details" className="pt-4">
          {canEdit ? <GroupDetailsForm group={group} onSaved={refetch} /> : <ReadOnlyDetails group={group} t={t} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}
