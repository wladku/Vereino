'use client'
// `/backend/club/sections` (club spec UI table): sections in the caller's scope with their coordinators (added by
// the `people` response enricher) and a "no coordinator" warning on an active section without one — a warning, the
// section still works. Since #29 each row shows the section's effective logo (its own, else the club's, else the
// initial of the club name), and a coordinator opens their section's edit page for its public content.
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { deleteCrud, fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { effectiveLogo, nameInitial, staffLogoUrl } from '../lib/files'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { errorMessage, type TableColumns, type Translate } from './client-helpers'
import { coordinatorName, type SectionRow } from './sections-shared'
import { useCanEditSectionContent, useCanManageClub } from './useCanManageClub'

type ClubBranding = { shortName: string | null; logoAttachmentId: string | null }

function SectionLogo({ row, club }: { row: SectionRow; club: ClubBranding | null }) {
  const logo = effectiveLogo({ sectionLogoId: row.logoAttachmentId, clubLogoId: club?.logoAttachmentId ?? null })
  const url = staffLogoUrl(logo.attachmentId, 64)
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={32}
        height={32}
        unoptimized
        className="bg-muted size-8 rounded object-contain"
        data-logo-source={logo.source}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded text-sm font-semibold"
      data-logo-source="initial"
    >
      {nameInitial(club?.shortName)}
    </span>
  )
}

const LIST_HREF = '/backend/club/sections'
const PAGE_SIZE = 50

function buildColumns(t: Translate, club: ClubBranding | null): TableColumns<SectionRow> {
  return [
    {
      accessorKey: 'name',
      header: t('club_core.sections.columns.name'),
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <SectionLogo row={row.original} club={club} />
          <span>{row.original.name}</span>
        </span>
      ),
    },
    {
      id: 'coordinators',
      header: t('club_core.sections.columns.coordinators'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => {
        const enrichment = row.original._people
        if (!enrichment) return <span className="text-muted-foreground">—</span>
        const active = enrichment.coordinators.filter((coordinator) => coordinator.active)
        return (
          <span className="flex flex-wrap items-center gap-1">
            {active.map((coordinator) => (
              <span key={coordinator.assignmentId}>{coordinatorName(coordinator)}</span>
            ))}
            {enrichment.coordinatorMissing ? (
              <StatusBadge variant="warning" dot>
                {t('club_core.sections.noCoordinator')}
              </StatusBadge>
            ) : null}
          </span>
        )
      },
    },
    {
      accessorKey: 'isActive',
      header: t('club_core.sections.columns.status'),
      meta: { priority: 3 },
      cell: ({ row }) => (
        <StatusBadge variant={row.original.isActive ? 'success' : 'neutral'}>
          {row.original.isActive ? t('club_core.common.active') : t('club_core.common.inactive')}
        </StatusBadge>
      ),
    },
  ]
}

export function SectionsTable() {
  const t = useT()
  const canManage = useCanManageClub()
  const canEditContent = useCanEditSectionContent()
  const canOpen = canManage || canEditContent
  const club = useQuery({
    queryKey: ['club_core-settings'],
    queryFn: () => readApiResultOrThrow<ClubBranding>('/api/club_core/settings'),
  })
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['club_core-sections', search, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<SectionRow>('club_core/sections', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
        ...(search ? { search } : {}),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, club.data ?? null), [t, club.data])

  const remove = async (row: SectionRow) => {
    const confirmed = await confirm({ title: t('club_core.sections.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud('club_core/sections', row.id),
      )
      flash(t('club_core.sections.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('club_core.sections.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: ['club_core-sections'] })
  }

  return (
    <>
      <DataTable<SectionRow>
        title={t('club_core.sections.title')}
        titleHeadingLevel={1}
        entityId="club_core:section"
        extensionTableId="club_core.sections"
        actions={
          canManage ? (
            <Button asChild>
              <Link href={`${LIST_HREF}/create`}>{t('club_core.sections.actions.create')}</Link>
            </Button>
          ) : null
        }
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('club_core.sections.errors.load')) : null}
        emptyState={<p className="text-muted-foreground text-sm">{t('club_core.sections.empty')}</p>}
        searchValue={search}
        searchPlaceholder={t('club_core.sections.search')}
        onSearchChange={(value: string) => {
          setSearch(value)
          setPage(1)
        }}
        rowActions={
          canManage
            ? (row: SectionRow) => (
                <RowActions
                  items={[
                    { id: 'edit', label: t('club_core.common.edit'), href: `${LIST_HREF}/${row.id}/edit` },
                    {
                      id: 'delete',
                      label: t('club_core.common.delete'),
                      destructive: true,
                      onSelect: () => {
                        void remove(row)
                      },
                    },
                  ]}
                />
              )
            : canEditContent
              ? (row: SectionRow) => (
                  <RowActions
                    items={[
                      {
                        id: 'edit',
                        label: t('club_core.sections.actions.publicPage'),
                        href: `${LIST_HREF}/${row.id}/edit`,
                      },
                    ]}
                  />
                )
              : undefined
        }
        onRowClick={
          canOpen
            ? (row: SectionRow) => {
                router.push(`${LIST_HREF}/${row.id}/edit`)
              }
            : undefined
        }
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          onPageChange: setPage,
        }}
      />
      {ConfirmDialogElement}
    </>
  )
}
