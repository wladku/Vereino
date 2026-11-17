'use client'
// The roster of a group (B-12; club spec glossary *Membership*; parity spec REQ-A03, J-A01; #267): a `DataTable` with
// server paging — Person / Role / Age / From / To / Status, coaches first, then assistants, then participants, the
// latest start first (`sortField=roster`) — and the views Active / Upcoming / History with their totals in the URL
// (`?tab=roster&status=active`). With `groups.manage` a coordinator of the group's section or the club administrator
// adds a person ("Add to roster"; `?personId=…&role=…` opens the dialog with the person and role chosen, spec L J-L07),
// edits the role and dates, ends a membership on a chosen day and removes one entered by mistake. A started membership
// that was used cannot be removed (409 `membership_in_use`): the confirmation then offers End. An upcoming membership
// offers Edit and Remove only. A removed row comes back through the platform's undo.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { EmptyState } from '@open-mercato/ui/backend/EmptyState'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { useClubToday } from '@vereino/ui'
import {
  MEMBERSHIP_ROLES,
  ROSTER_VIEWS,
  membershipActions,
  type MembershipRole,
  type PeriodStatus,
} from '../lib/groups-rules'
import {
  errorMessage,
  personHref,
  personName,
  roleLabel,
  rowStatus,
  type MembershipRow,
  type TableColumns,
  type Translate,
} from './client-helpers'
import { EndMembershipDialog, MembershipDialog, personOptionLabel, type PersonOption } from './MembershipDialogs'
import { useHasFeature } from './useCanManageGroups'

const PAGE_SIZE = 50

const STATUS_VARIANT: Readonly<Record<PeriodStatus, 'success' | 'info' | 'neutral'>> = {
  active: 'success',
  upcoming: 'info',
  ended: 'neutral',
}

function viewFrom(value: string | null): PeriodStatus {
  return ROSTER_VIEWS.find((view) => view === value) ?? 'active'
}

function roleFrom(value: string | null): MembershipRole | null {
  return MEMBERSHIP_ROLES.find((role) => role === value) ?? null
}

function buildColumns(
  t: Translate,
  groupKind: string | null,
  today: string,
  canViewPeople: boolean,
): TableColumns<MembershipRow> {
  const dash = <span className="text-muted-foreground">{t('groups.common.empty')}</span>
  return [
    {
      id: 'person',
      header: t('groups.memberships.columns.person'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => {
        const name = personName(row.original.person) || t('groups.memberships.unknownPerson')
        return canViewPeople && row.original.personId && row.original.person ? (
          <Link className="font-medium underline-offset-4 hover:underline" href={personHref(row.original.personId)}>
            {name}
          </Link>
        ) : (
          <span className="font-medium">{name}</span>
        )
      },
    },
    {
      id: 'role',
      header: t('groups.memberships.columns.role'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => roleLabel(t, row.original.role, groupKind),
    },
    {
      id: 'age',
      header: () => <span className="block text-right">{t('groups.memberships.columns.age')}</span>,
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) =>
        typeof row.original.person?.age === 'number' ? (
          <span className="block text-right tabular-nums" data-testid="roster-age">
            {row.original.person.age}
          </span>
        ) : (
          dash
        ),
    },
    {
      id: 'validFrom',
      header: t('groups.memberships.columns.from'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => <span className="tabular-nums">{row.original.validFrom ?? t('groups.common.empty')}</span>,
    },
    {
      id: 'validTo',
      header: t('groups.memberships.columns.to'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => (row.original.validTo ? <span className="tabular-nums">{row.original.validTo}</span> : dash),
    },
    {
      id: 'status',
      header: t('groups.memberships.columns.status'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => {
        const status = rowStatus(row.original, today)
        return <StatusBadge variant={STATUS_VARIANT[status]}>{t(`groups.common.status.${status}`)}</StatusBadge>
      },
    },
  ]
}

type Dialogs =
  | { kind: 'add'; person: { id: string; label: string } | null; role: MembershipRole | null }
  | { kind: 'edit'; row: MembershipRow }
  | { kind: 'end'; row: MembershipRow }
  | null

export function RosterPanel({
  groupId,
  groupKind,
  canManage,
}: {
  groupId: string
  groupKind: string | null
  canManage: boolean
}) {
  const t = useT()
  const today = useClubToday()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const canViewPeople = useHasFeature('people.view')
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const view = viewFrom(searchParams.get('status'))
  const [page, setPage] = React.useState(1)
  const [dialog, setDialog] = React.useState<Dialogs>(null)

  const listQuery = useQuery({
    queryKey: ['groups-roster', groupId, view, page],
    queryFn: () =>
      fetchCrudList<MembershipRow>('groups/memberships', {
        groupId,
        status: view,
        sortField: 'roster',
        page,
        pageSize: PAGE_SIZE,
      }),
  })
  // Each view's total for its tab (one row per request; the CRUD list counts with the same filter).
  const countsQuery = useQuery({
    queryKey: ['groups-roster-counts', groupId],
    queryFn: async () => {
      const totals = await Promise.all(
        ROSTER_VIEWS.map((status) =>
          fetchCrudList<MembershipRow>('groups/memberships', { groupId, status, page: 1, pageSize: 1 }),
        ),
      )
      return Object.fromEntries(ROSTER_VIEWS.map((status, index) => [status, totals[index]?.total ?? 0])) as Record<
        PeriodStatus,
        number
      >
    },
  })

  const refresh = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['groups-roster', groupId] }),
      queryClient.invalidateQueries({ queryKey: ['groups-roster-counts', groupId] }),
    ])
  }, [queryClient, groupId])

  const replaceParams = React.useCallback(
    (change: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      change(params)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  // `?personId=…[&role=…]` (spec L J-L07, "Add to a group as coach") opens the add dialog with that person chosen.
  const deepLinkPerson = canManage ? searchParams.get('personId') : null
  const deepLinkRole = roleFrom(searchParams.get('role'))
  React.useEffect(() => {
    if (!deepLinkPerson) return
    let cancelled = false
    void fetchCrudList<PersonOption>('people/persons', { ids: deepLinkPerson, pageSize: 1 })
      .then((data) => data.items.find((person) => person.id === deepLinkPerson) ?? null)
      .catch(() => null)
      .then((person) => {
        if (cancelled) return
        setDialog({
          kind: 'add',
          person: person ? { id: person.id, label: personOptionLabel(t, person) } : null,
          role: deepLinkRole,
        })
        replaceParams((params) => {
          params.delete('personId')
          params.delete('role')
        })
      })
    return () => {
      cancelled = true
    }
  }, [deepLinkPerson, deepLinkRole, replaceParams, t])

  const selectView = (value: string) => {
    setPage(1)
    replaceParams((params) => {
      params.set('tab', 'roster')
      params.set('status', viewFrom(value))
    })
  }

  const remove = async (row: MembershipRow) => {
    const name = personName(row.person) || t('groups.memberships.unknownPerson')
    const confirmed = await confirm({
      title: t('groups.memberships.confirm.remove.title', { name }),
      text: t('groups.memberships.confirm.remove.text'),
      confirmText: t('groups.memberships.actions.remove'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        apiCallOrThrow(
          `/api/groups/memberships?id=${encodeURIComponent(row.id)}`,
          { method: 'DELETE' },
          { errorMessage: t('groups.memberships.errors.remove') },
        ),
      )
      flash(t('groups.memberships.flash.removed', { name }), 'success')
    } catch (error: unknown) {
      if (errorCodeOf(error) === 'membership_in_use') {
        // J-A01 step 5: a used membership is ended instead.
        const endInstead = await confirm({
          title: t('groups.memberships.confirm.inUse.title'),
          text: t('groups.memberships.confirm.inUse.text', { name }),
          confirmText: t('groups.memberships.actions.end'),
        })
        if (endInstead) setDialog({ kind: 'end', row })
      } else if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
        flash(errorMessage(error, t('groups.memberships.errors.remove')), 'error')
      }
    } finally {
      await refresh()
    }
  }

  const rowActions = (row: MembershipRow) => {
    const items: RowActionItem[] = membershipActions(rowStatus(row, today)).map((action) => ({
      id: action,
      label: t(`groups.memberships.actions.${action}`),
      destructive: action === 'remove',
      onSelect: () => {
        if (action === 'edit') setDialog({ kind: 'edit', row })
        else if (action === 'end') setDialog({ kind: 'end', row })
        else void remove(row)
      },
    }))
    return (
      <span data-testid={`roster-actions-${row.id}`}>
        <RowActions items={items} />
      </span>
    )
  }

  const columns = React.useMemo(
    () => buildColumns(t, groupKind, today, canViewPeople),
    [t, groupKind, today, canViewPeople],
  )
  const counts = countsQuery.data
  const addButton = canManage ? (
    <Button
      type="button"
      className="min-h-11"
      data-testid="roster-add"
      onClick={() => {
        setDialog({ kind: 'add', person: null, role: null })
      }}
    >
      {t('groups.memberships.actions.add')}
    </Button>
  ) : null
  const emptyState = (
    <div data-testid={`roster-empty-${view}`}>
      <EmptyState
        title={t(`groups.memberships.empty.${view}.title`)}
        description={t(`groups.memberships.empty.${view}.text`)}
        actions={view === 'active' ? addButton : undefined}
      />
    </div>
  )
  const close = (open: boolean) => {
    if (!open) setDialog(null)
  }
  const saved = async () => {
    flash(t('groups.memberships.flash.saved'), 'success')
    await refresh()
  }

  return (
    <section className="flex flex-col gap-3" aria-label={t('groups.memberships.title')}>
      <Tabs value={view} onValueChange={selectView}>
        <TabsList aria-label={t('groups.memberships.views.label')} className="max-w-full overflow-x-auto">
          {ROSTER_VIEWS.map((status) => (
            <TabsTrigger key={status} value={status}>
              {typeof counts?.[status] === 'number'
                ? t('groups.memberships.views.withCount', {
                    label: t(`groups.memberships.views.${status}`),
                    count: counts[status],
                  })
                : t(`groups.memberships.views.${status}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={view}>
          <DataTable<MembershipRow>
            title={t('groups.memberships.title')}
            actions={addButton}
            columns={columns}
            data={listQuery.data?.items ?? []}
            isLoading={listQuery.isLoading}
            error={listQuery.error ? errorMessage(listQuery.error, t('groups.memberships.errors.load')) : null}
            emptyState={emptyState}
            rowActions={canManage ? rowActions : undefined}
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: listQuery.data?.total ?? 0,
              totalPages: listQuery.data?.totalPages ?? 0,
              onPageChange: setPage,
            }}
          />
        </TabsContent>
      </Tabs>
      {dialog?.kind === 'add' || dialog?.kind === 'edit' ? (
        <MembershipDialog
          open
          onOpenChange={close}
          groupId={groupId}
          groupKind={groupKind}
          today={today}
          membership={dialog.kind === 'edit' ? dialog.row : null}
          initialPerson={dialog.kind === 'add' ? dialog.person : null}
          initialRole={dialog.kind === 'add' ? dialog.role : null}
          onSaved={saved}
          onRefresh={() => void refresh()}
        />
      ) : null}
      {dialog?.kind === 'end' ? (
        <EndMembershipDialog
          open
          onOpenChange={close}
          membership={dialog.row}
          today={today}
          onSaved={async () => {
            flash(t('groups.memberships.flash.ended'), 'success')
            await refresh()
          }}
          onRefresh={() => void refresh()}
        />
      ) : null}
      {ConfirmDialogElement}
    </section>
  )
}
