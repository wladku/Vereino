'use client'
// `/backend/groups/groups/[id]` (club spec UI table): the group record with the tabs "Details", "Roster" (memberships
// with their history) and "Public page" (B-12, #91: the group's public fields, for those who edit the group), in the
// mockup's order under `?tab=details|roster|public`, default `roster` (parity spec REQ-A02, #266), so a reload or a
// link keeps the tab. The header links to the group's activities (for `activities.view`) and, for a public group of a
// public section, to its public preview. A coach reads the roster of their own group; a coordinator of the group's
// section and the club administrator also edit the group and its roster (`groups.manage`). The server decides the
// scope: a group outside it answers 403 and the page shows the permission-denied state.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { GroupDetailsForm } from './GroupForm'
import { GroupPublicForm } from './GroupPublicForm'
import { RosterPanel } from './RosterPanel'
import {
  GROUPS_HREF,
  OWN_FORBIDDEN_STATE,
  groupActivitiesHref,
  kindLabel,
  type GroupDetail,
  type Translate,
} from './client-helpers'
import { useCanManageGroups, useHasFeature } from './useCanManageGroups'
import { StatusTag } from '@vereino/ui'

/** The record's tabs in the mockup's order (B-12). */
const GROUP_RECORD_TABS = ['details', 'roster', 'public'] as const
type GroupRecordTab = (typeof GROUP_RECORD_TABS)[number]

/** The tab of `?tab=` when it is shown, else Roster (always shown). */
function tabFrom(value: string | null, allowed: readonly GroupRecordTab[]): GroupRecordTab {
  return allowed.find((tab) => tab === value) ?? 'roster'
}

type SectionSlugRow = { id: string; isPublic?: boolean; publicSlug?: string | null }

/**
 * The public page of the group's section (`/p/<club>/sections/<slug>`), which lists the public group, or null when the
 * group or its section is not public or the caller cannot read the club's and the section's slugs (`club_core.view`).
 */
function usePublicPreviewHref(group: GroupDetail): string | null {
  const sectionId = group.sectionId
  const enabled = group.isPublic === true && Boolean(sectionId)
  const query = useQuery({
    queryKey: ['groups-public-preview', sectionId],
    enabled,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      const [settings, sections] = await Promise.all([
        apiCall<{ publicSlug?: string | null }>('/api/club_core/settings'),
        apiCall<{ items?: SectionSlugRow[] }>(
          `/api/club_core/sections?ids=${encodeURIComponent(String(sectionId))}&pageSize=1`,
        ),
      ])
      const clubSlug = settings.ok ? settings.result?.publicSlug : null
      const section = sections.ok ? sections.result?.items?.find((item) => item.id === sectionId) : undefined
      if (!clubSlug || !section?.isPublic || !section.publicSlug) return null
      return `/p/${encodeURIComponent(clubSlug)}/sections/${encodeURIComponent(section.publicSlug)}`
    },
  })
  return enabled ? (query.data ?? null) : null
}

function RecordHeaderLinks({ group, t }: { group: GroupDetail; t: Translate }) {
  const canViewActivities = useHasFeature('activities.view')
  const previewHref = usePublicPreviewHref(group)
  if (!canViewActivities && !previewHref) return null
  return (
    <div className="flex flex-wrap gap-2">
      {canViewActivities ? (
        <Button asChild variant="outline" size="sm">
          <Link href={groupActivitiesHref(group.id)} data-testid="group-activities-link">
            {t('groups.groups.actions.activities')}
          </Link>
        </Button>
      ) : null}
      {previewHref ? (
        <Button asChild variant="outline" size="sm">
          <a href={previewHref} target="_blank" rel="noreferrer" data-testid="group-public-preview-link">
            {t('groups.groups.actions.publicPreview')}
          </a>
        </Button>
      ) : null}
    </div>
  )
}

type GroupLoad =
  { status: 'ok'; group: GroupDetail } | { status: 'not_found' } | { status: 'denied' } | { status: 'unlinked' }

function ReadOnlyDetails({ group, t }: { group: GroupDetail; t: Translate }) {
  const rows: Array<[string, string | null | undefined]> = [
    [t('groups.groups.fields.name'), group.name],
    [t('groups.groups.fields.kind'), kindLabel(t, group.kind)],
    [t('groups.groups.fields.section'), group.sectionName],
    [t('groups.groups.fields.description'), group.description],
    [t('groups.groups.fields.levelLabel'), group.levelLabel],
  ]
  if (group.kind === 'team') {
    rows.push(
      [t('groups.groups.fields.ageCategory'), group.ageCategoryName],
      [t('groups.groups.fields.league'), group.league],
      [t('groups.groups.fields.season'), group.seasonName],
    )
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
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = useQuery({
    queryKey: ['groups-group', id],
    queryFn: async (): Promise<GroupLoad> => {
      const call = await apiCall<GroupDetail>(`/api/groups/groups/${encodeURIComponent(id)}`, OWN_FORBIDDEN_STATE)
      if (call.status === 404) return { status: 'not_found' }
      // 403 `scope_unlinked`: the account is not linked to a person of this club (#76).
      if (call.status === 403) {
        return errorCodeOf(call.result) === 'scope_unlinked' ? { status: 'unlinked' } : { status: 'denied' }
      }
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
  if (load.status === 'unlinked') return <AccessDeniedMessage label={t('foundation.errors.scope_unlinked')} />
  if (load.status === 'denied') return <AccessDeniedMessage label={t('groups.groups.errors.denied')} />

  const group = load.group
  // A coach reads the group without `groups.manage`; the server refuses writes outside the caller's sections anyway.
  const canEdit = canManage
  const allowedTabs = GROUP_RECORD_TABS.filter((value) => value !== 'public' || canEdit)
  const tab = tabFrom(searchParams.get('tab'), allowedTabs)
  const selectTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words">{group.name ?? t('groups.groups.record.title')}</h1>
          <span className="text-muted-foreground text-sm">
            {[kindLabel(t, group.kind), group.sectionName].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RecordHeaderLinks group={group} t={t} />
          <StatusTag status={group.isActive ? 'success' : 'neutral'}>
            {group.isActive ? t('groups.common.active') : t('groups.common.inactive')}
          </StatusTag>
        </div>
      </header>
      <Tabs value={tab} onValueChange={selectTab} variant="underline">
        <div className="overflow-x-auto">
          <TabsList aria-label={t('groups.groups.tabs.label')}>
            <TabsTrigger value="details">{t('groups.groups.tabs.details')}</TabsTrigger>
            <TabsTrigger value="roster">{t('groups.groups.tabs.roster')}</TabsTrigger>
            {canEdit ? <TabsTrigger value="public">{t('groups.groups.tabs.public')}</TabsTrigger> : null}
          </TabsList>
        </div>
        <TabsContent value="details" className="pt-4">
          {canEdit ? <GroupDetailsForm group={group} onSaved={refetch} /> : <ReadOnlyDetails group={group} t={t} />}
        </TabsContent>
        <TabsContent value="roster" className="pt-4">
          <RosterPanel groupId={group.id} groupKind={group.kind} canManage={canEdit} />
        </TabsContent>
        {canEdit ? (
          <TabsContent value="public" className="pt-4">
            <GroupPublicForm group={group} onSaved={refetch} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}
