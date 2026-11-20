'use client'
// The roster of a group (B-12; club spec glossary *Membership*; parity spec REQ-A03, J-A01; #267): a `DataTable` with
// server paging — Person / Role / Age / From / To / Status, coaches first, then assistants, then participants, the
// latest start first (`sortField=roster`) — and the views Active / Upcoming / History with their totals in the URL
// (`?tab=roster&status=active`). With `groups.manage` a coordinator of the group's section or the club administrator
// adds a person ("Add to roster"; `?personId=…&role=…` opens the dialog with the person and role chosen, spec L J-L07),
// edits the role and dates, ends a membership on a chosen day and removes one entered by mistake. A started membership
// that was used cannot be removed (409 `membership_in_use`): the confirmation then offers End. An active membership
// also offers "Move…" to another group (spec L REQ-L11; #312). An upcoming membership offers Edit and Remove only. A removed row comes back through the platform's undo.
// In the Active view rows can be selected: the bulk action "Move to another group" opens the several-children move
// (spec L REQ-L15, J-L09; #383) with the selection ticked; its success notice offers Undo for the whole move.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { EmptyState } from '@open-mercato/ui/backend/EmptyState'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusTag, useClubToday } from '@vereino/ui'
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
import { MoveChildrenDialog, MoveChildrenNotice, type MoveChildrenResult } from './MoveChildrenDialog'
import {
  EndMembershipDialog,
  MembershipDialog,
  MoveMembershipDialog,
  personOptionLabel,
  type PersonOption,
} from './MembershipDialogs'
import { useHasFeature } from './useCanManageGroups'
import { useRemoveMembership } from './useRemoveMembership'

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
        return <StatusTag status={STATUS_VARIANT[status]}>{t(`groups.common.status.${status}`)}</StatusTag>
      },
    },
  ]
}

type Dialogs =
  | { kind: 'add'; person: { id: string; label: string } | null; role: MembershipRole | null }
  | { kind: 'edit'; row: MembershipRow }
  | { kind: 'end'; row: MembershipRow }
  | { kind: 'move'; row: MembershipRow }
  | { kind: 'moveMany'; selectedIds: string[] }
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
  const view = viewFrom(searchParams.get('status'))
  const [page, setPage] = React.useState(1)
  const [dialog, setDialog] = React.useState<Dialogs>(null)
  const [moveResult, setMoveResult] = React.useState<MoveChildrenResult | null>(null)

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

  const endInstead = React.useCallback((row: MembershipRow) => {
    setDialog({ kind: 'end', row })
  }, [])
  const { remove, ConfirmDialogElement } = useRemoveMembership({ today, refresh, onEndInstead: endInstead })

  const rowActions = (row: MembershipRow) => {
    const status = rowStatus(row, today)
    const items: RowActionItem[] = membershipActions(status).map((action) => ({
      id: action,
      label: t(`groups.memberships.actions.${action}`),
      destructive: action === 'remove',
      onSelect: () => {
        if (action === 'edit') setDialog({ kind: 'edit', row })
        else if (action === 'end') setDialog({ kind: 'end', row })
        else void remove(row)
      },
    }))
    // "Move…" (spec L REQ-L11, REQ-L15 one child; #312): an active membership moves to another group.
    if (status === 'active') {
      items.splice(2, 0, {
        id: 'move',
        label: t('groups.memberships.actions.moveEllipsis'),
        onSelect: () => {
          setDialog({ kind: 'move', row })
        },
      })
    }
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
  // Several participants move together (REQ-L15); coaches and assistants move one by one with "Move…" (Q-L23).
  const bulkActions =
    canManage && view === 'active'
      ? [
          {
            id: 'move-many',
            label: t('groups.memberships.moveMany.action'),
            onExecute: (rows: MembershipRow[]) => {
              setDialog({
                kind: 'moveMany',
                selectedIds: rows.filter((row) => row.role === 'participant').map((row) => row.id),
              })
              return false
            },
          },
        ]
      : undefined
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
      {moveResult ? (
        <MoveChildrenNotice
          result={moveResult}
          onDismiss={() => {
            setMoveResult(null)
          }}
          onUndone={async () => {
            setMoveResult(null)
            flash(t('groups.memberships.moveMany.undone'), 'success')
            await refresh()
          }}
        />
      ) : null}
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
          {bulkActions ? (
            <p className="text-muted-foreground mb-2 text-sm" data-testid="roster-move-many-hint">
              {t('groups.memberships.moveMany.selectHint')}
            </p>
          ) : null}
          <DataTable<MembershipRow>
            title={t('groups.memberships.title')}
            actions={addButton}
            columns={columns}
            data={listQuery.data?.items ?? []}
            isLoading={listQuery.isLoading}
            error={listQuery.error ? errorMessage(listQuery.error, t('groups.memberships.errors.load')) : null}
            emptyState={emptyState}
            rowActions={canManage ? rowActions : undefined}
            bulkActions={bulkActions}
            selectionScopeKey={`${view}:${String(page)}`}
            // The query time ("… in 326ms") cannot shrink and widens the page past 320 px in Polish (WCAG 1.4.10).
            showQueryTime={false}
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
      {dialog?.kind === 'move' ? (
        <MoveMembershipDialog
          open
          onOpenChange={close}
          membership={dialog.row}
          today={today}
          onSaved={async () => {
            flash(t('groups.memberships.flash.moved'), 'success')
            await refresh()
          }}
          onRefresh={() => void refresh()}
        />
      ) : null}
      {dialog?.kind === 'moveMany' ? (
        <MoveChildrenDialog
          open
          onOpenChange={close}
          groupId={groupId}
          today={today}
          initialSelectedIds={dialog.selectedIds}
          onMoved={async (result) => {
            setMoveResult(result)
            await refresh()
          }}
        />
      ) : null}
      {ConfirmDialogElement}
    </section>
  )
}
