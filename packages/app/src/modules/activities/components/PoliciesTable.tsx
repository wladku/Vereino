'use client'
// `/backend/activities/policies` (club spec UI table, REQ-007; #32): the club's declaration policies — who declares
// for a minor with an account per scope (club, group, away trip, activity type), the confirmation limit and the default
// after it. Read with `activities.view`; add, edit and delete for `activities.manage`. What is declared per activity
// type (absence only or confirmation) is the club setting edited on `/backend/club/settings` (D-026).
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { deleteCrud, fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { POLICY_SCOPES } from '../lib/policy'
import {
  CLUB_SETTINGS_HREF,
  POLICIES_HREF,
  declarationModeLabel,
  errorMessage,
  policyEditHref,
  policyScopeLabel,
  timeoutDefaultLabel,
  type PolicyRow,
  type TableColumns,
  type Translate,
} from './client-helpers'
import { useActivitiesFeatures } from './useActivitiesFeatures'

const PAGE_SIZE = 50
const API_PATH = 'activities/attendance-policies'

function buildColumns(t: Translate): TableColumns<PolicyRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    {
      id: 'scope',
      header: t('activities.policies.columns.scope'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="font-medium">{policyScopeLabel(t, row.original)}</span>,
    },
    {
      accessorKey: 'minorDeclarationMode',
      header: t('activities.policies.columns.mode'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => declarationModeLabel(t, row.original.minorDeclarationMode),
    },
    {
      accessorKey: 'confirmTimeoutHours',
      header: t('activities.policies.columns.timeout'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.confirmTimeoutHours ?? dash,
    },
    {
      accessorKey: 'defaultAfterTimeout',
      header: t('activities.policies.columns.afterTimeout'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => timeoutDefaultLabel(t, row.original.defaultAfterTimeout),
    },
  ]
}

/** The list query parameters of the applied filters (`GET /api/activities/attendance-policies`). */
function filterParams(values: FilterValues): Record<string, string> {
  const scope: unknown = values.scope
  return typeof scope === 'string' && scope ? { scope } : {}
}

export function PoliciesTable() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const features = useActivitiesFeatures()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['activities-policies', filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<PolicyRow>(API_PATH, {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'createdAt',
        sortDir: 'asc',
        ...filterParams(filters),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t), [t])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'scope',
        label: t('activities.policies.filters.scope'),
        type: 'select',
        options: POLICY_SCOPES.map((scope) => ({ value: scope, label: t(`activities.policies.scope.${scope}`) })),
      },
    ],
    [t],
  )

  const remove = async (row: PolicyRow) => {
    const confirmed = await confirm({
      title: t('activities.policies.confirm.delete'),
      text: t('activities.policies.confirm.deleteText'),
      confirmText: t('activities.common.delete'),
      cancelText: t('activities.common.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () => deleteCrud(API_PATH, row.id))
      flash(t('activities.policies.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('activities.policies.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: ['activities-policies'] })
  }

  return (
    <>
      <p className="text-muted-foreground mb-4 text-sm">
        {t('activities.policies.description')}{' '}
        <Link className="underline underline-offset-4" href={CLUB_SETTINGS_HREF}>
          {t('activities.policies.description.link')}
        </Link>
      </p>
      <DataTable<PolicyRow>
        title={t('activities.policies.title')}
        titleHeadingLevel={1}
        entityId="activities:attendance_policy"
        extensionTableId="activities.attendance_policies"
        actions={
          features.manage ? (
            <Button asChild>
              <Link href={`${POLICIES_HREF}/create`}>{t('activities.policies.actions.create')}</Link>
            </Button>
          ) : null
        }
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('activities.policies.errors.load')) : null}
        emptyState={<p className="text-muted-foreground text-sm">{t('activities.policies.empty')}</p>}
        filters={filterDefs}
        filterValues={filters}
        onFiltersApply={(values: FilterValues) => {
          setFilters(values)
          setPage(1)
        }}
        onFiltersClear={() => {
          setFilters({})
          setPage(1)
        }}
        rowActions={(row: PolicyRow) =>
          features.manage ? (
            <RowActions
              items={[
                { id: 'edit', label: t('activities.policies.actions.edit'), href: policyEditHref(row.id) },
                {
                  id: 'delete',
                  label: t('activities.common.delete'),
                  destructive: true,
                  onSelect: () => {
                    void remove(row)
                  },
                },
              ]}
            />
          ) : null
        }
        onRowClick={
          features.manage
            ? (row: PolicyRow) => {
                router.push(policyEditHref(row.id))
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
