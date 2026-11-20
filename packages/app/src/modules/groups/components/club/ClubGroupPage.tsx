'use client'
// `/club/groups/[id]` — a group's roster on the phone (groups and activities parity spec REQ-A11, J-A01 step 4; D-031
// §3; B-12 `screenGroup`; #274): the memberships as cards — name, role, age and dates, never an e-mail, a phone or a
// PESEL (the roster API carries none) — coaches first, in the views Active / Upcoming / History with their totals and
// "Show more" through every page. With `groups.manage` a section coordinator adds a person, edits a membership, ends it
// on a chosen last day and removes a mistake, each in a bottom sheet with the panel's forms and rules (E10-S02: 409
// overlap, 409 `membership_in_use` with End offered instead, 422 `membership_not_started`, 409 version). A coach reads
// the roster without actions. The group read decides the page: another section's group is "not yours" (403), an
// unknown one "not found". States: loading, error with retry, empty ("This group has no members yet" with Add). The
// coordinator also moves several children to another group in one previewed step (spec L REQ-L15, J-L09 step 6; #383):
// "Move to another group" opens the panel's bulk move as a full-screen sheet; the success notice offers Undo.
import * as React from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { CLUB_GROUPS_HREF, MemberSkeleton, useClubToday } from '@vereino/ui'
import { ROSTER_VIEWS, membershipActions, type MembershipAction, type PeriodStatus } from '../../lib/groups-rules'
import {
  OWN_FORBIDDEN_STATE,
  personName,
  roleLabel,
  rowStatus,
  type GroupDetail,
  type MembershipRow,
  type Translate,
} from '../client-helpers'
import { EndMembershipDialog, MembershipDialog } from '../MembershipDialogs'
import { MoveChildrenDialog, MoveChildrenNotice, type MoveChildrenResult } from '../MoveChildrenDialog'
import { useCanManageGroups } from '../useCanManageGroups'
import { useRemoveMembership } from '../useRemoveMembership'
import { GroupsClubFrame } from './GroupsClubFrame'

const PAGE_SIZE = 50

const STATUS_VARIANT: Readonly<Record<PeriodStatus, 'success' | 'info' | 'neutral'>> = {
  active: 'success',
  upcoming: 'info',
  ended: 'neutral',
}

type GroupLoad =
  { status: 'ok'; group: GroupDetail } | { status: 'denied' } | { status: 'unlinked' } | { status: 'not_found' }

class GroupLoadError extends Error {}

function useGroup(id: string) {
  return useQuery({
    queryKey: ['groups-club-group', id],
    queryFn: async (): Promise<GroupLoad> => {
      const call = await apiCall<GroupDetail>(`/api/groups/groups/${encodeURIComponent(id)}`, OWN_FORBIDDEN_STATE)
      if (call.status === 404) return { status: 'not_found' }
      // 403 `scope_unlinked`: the account is not linked to a person of this club (#76).
      if (call.status === 403) {
        return errorCodeOf(call.result) === 'scope_unlinked' ? { status: 'unlinked' } : { status: 'denied' }
      }
      if (!call.ok || !call.result) throw new GroupLoadError(String(call.status))
      return { status: 'ok', group: call.result }
    },
  })
}

/** A calendar day (`YYYY-MM-DD`) in the reader's locale, e.g. "30.11.2026"; the day itself, never shifted by a zone. */
function formatDay(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  )
}

function datesLine(t: Translate, row: MembershipRow, locale: string): string {
  if (!row.validFrom) return t('groups.common.empty')
  const from = formatDay(row.validFrom, locale)
  return row.validTo
    ? t('groups.club.roster.dates', { from, to: formatDay(row.validTo, locale) })
    : t('groups.club.roster.since', { from })
}

type Sheets =
  | { kind: 'add' }
  | { kind: 'edit'; row: MembershipRow }
  | { kind: 'end'; row: MembershipRow }
  | { kind: 'moveMany' }
  | null

function MemberCard({
  row,
  groupKind,
  today,
  canManage,
  onAction,
}: {
  row: MembershipRow
  groupKind: string | null
  today: string
  canManage: boolean
  onAction: (action: MembershipAction, row: MembershipRow) => void
}) {
  const t = useT()
  const locale = useLocale()
  const status = rowStatus(row, today)
  const name = personName(row.person) || t('groups.memberships.unknownPerson')
  const age = typeof row.person?.age === 'number' ? t('groups.club.roster.age', { age: String(row.person.age) }) : null
  return (
    <li
      className="bg-card flex min-w-0 flex-col gap-2 rounded-lg border p-3"
      data-testid="club-roster-member"
      data-membership-id={row.id}
      data-person-id={row.personId ?? ''}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium break-words" data-testid="club-roster-name">
          {name}
        </span>
        <StatusBadge variant={STATUS_VARIANT[status]}>{t(`groups.common.status.${status}`)}</StatusBadge>
      </div>
      <p className="text-muted-foreground text-sm break-words">
        {[roleLabel(t, row.role, groupKind), age].filter(Boolean).join(' · ')}
      </p>
      <p className="text-muted-foreground text-sm tabular-nums" data-testid="club-roster-dates">
        {datesLine(t, row, locale)}
      </p>
      {canManage ? (
        <div className="flex flex-wrap gap-2" data-testid="club-roster-actions">
          {membershipActions(status).map((action) => {
            const label = t(`groups.memberships.actions.${action}`)
            return (
              <Button
                key={action}
                type="button"
                size="sm"
                variant={action === 'remove' ? 'destructive' : 'outline'}
                className="min-h-11"
                aria-label={t('groups.club.roster.actionFor', { action: label, name })}
                data-testid={`club-roster-${action}`}
                onClick={() => {
                  onAction(action, row)
                }}
              >
                {label}
              </Button>
            )
          })}
        </div>
      ) : null}
    </li>
  )
}

function Roster({ group }: { group: GroupDetail }) {
  const t = useT()
  const today = useClubToday()
  const canManage = useCanManageGroups()
  const queryClient = useQueryClient()
  const [view, setView] = React.useState<PeriodStatus>('active')
  const [sheet, setSheet] = React.useState<Sheets>(null)
  const [moveResult, setMoveResult] = React.useState<MoveChildrenResult | null>(null)

  const list = useInfiniteQuery({
    queryKey: ['groups-club-roster', group.id, view],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchCrudList<MembershipRow>('groups/memberships', {
        groupId: group.id,
        status: view,
        sortField: 'roster',
        page: pageParam,
        pageSize: PAGE_SIZE,
      }),
    getNextPageParam: (last, pages) => (pages.length < (last.totalPages ?? 0) ? pages.length + 1 : undefined),
  })
  // Each view's total for its tab (one row per request; the list counts with the same filter).
  const counts = useQuery({
    queryKey: ['groups-club-roster-counts', group.id],
    queryFn: async () => {
      const totals = await Promise.all(
        ROSTER_VIEWS.map((status) =>
          fetchCrudList<MembershipRow>('groups/memberships', { groupId: group.id, status, page: 1, pageSize: 1 }),
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
      queryClient.invalidateQueries({ queryKey: ['groups-club-roster', group.id] }),
      queryClient.invalidateQueries({ queryKey: ['groups-club-roster-counts', group.id] }),
      queryClient.invalidateQueries({ queryKey: ['groups-club-groups'] }),
    ])
  }, [queryClient, group.id])
  const endInstead = React.useCallback((row: MembershipRow) => {
    setSheet({ kind: 'end', row })
  }, [])
  const { remove, ConfirmDialogElement } = useRemoveMembership({ today, refresh, onEndInstead: endInstead })
  const onAction = (action: MembershipAction, row: MembershipRow) => {
    if (action === 'edit') setSheet({ kind: 'edit', row })
    else if (action === 'end') setSheet({ kind: 'end', row })
    else void remove(row)
  }
  const close = (open: boolean) => {
    if (!open) setSheet(null)
  }

  const addButton = canManage ? (
    <Button
      type="button"
      className="min-h-11 w-full sm:w-auto"
      data-testid="club-roster-add"
      onClick={() => {
        setSheet({ kind: 'add' })
      }}
    >
      {t('groups.memberships.actions.add')}
    </Button>
  ) : null
  const rows = list.data?.pages.flatMap((page) => page.items) ?? []
  let body: React.ReactNode
  if (!list.data && list.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('groups.club.loading')} />
  } else if (!list.data) {
    body = (
      <ErrorMessage
        label={t('groups.club.errors.roster')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void list.refetch()}>
            {t('groups.club.retry')}
          </Button>
        }
      />
    )
  } else if (rows.length === 0) {
    body = (
      <div className="flex flex-col items-start gap-3" data-testid={`club-roster-empty-${view}`}>
        <p className="text-muted-foreground">
          {view === 'active' ? t('groups.club.roster.empty') : t(`groups.memberships.empty.${view}.title`)}
        </p>
        {view === 'active' ? addButton : null}
      </div>
    )
  } else {
    body = (
      <>
        <ul className="flex flex-col gap-2" data-testid="club-roster">
          {rows.map((row) => (
            <MemberCard
              key={row.id}
              row={row}
              groupKind={group.kind}
              today={today}
              canManage={canManage}
              onAction={onAction}
            />
          ))}
        </ul>
        {list.hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            disabled={list.isFetchingNextPage}
            data-testid="club-roster-more"
            onClick={() => void list.fetchNextPage()}
          >
            {t('groups.club.roster.more')}
          </Button>
        ) : null}
      </>
    )
  }

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold break-words" data-testid="club-group-name">
          {group.name}
        </h1>
        {group.sectionName ? <p className="text-muted-foreground text-sm">{group.sectionName}</p> : null}
        {canManage ? null : (
          <p className="text-muted-foreground text-sm" data-testid="club-roster-read-only">
            {t('groups.club.roster.readOnly')}
          </p>
        )}
      </header>
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
      {canManage && rows.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {addButton}
          {view === 'active' ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              data-testid="club-roster-move-many"
              onClick={() => {
                setSheet({ kind: 'moveMany' })
              }}
            >
              {t('groups.memberships.moveMany.action')}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Tabs
        value={view}
        onValueChange={(value) => {
          setView(ROSTER_VIEWS.find((entry) => entry === value) ?? 'active')
        }}
      >
        <TabsList aria-label={t('groups.memberships.views.label')} className="max-w-full overflow-x-auto">
          {ROSTER_VIEWS.map((status) => (
            <TabsTrigger key={status} value={status} className="min-h-11">
              {typeof counts.data?.[status] === 'number'
                ? t('groups.memberships.views.withCount', {
                    label: t(`groups.memberships.views.${status}`),
                    count: counts.data[status],
                  })
                : t(`groups.memberships.views.${status}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={view} className="flex flex-col gap-2">
          {body}
        </TabsContent>
      </Tabs>
      {sheet?.kind === 'add' || sheet?.kind === 'edit' ? (
        <MembershipDialog
          open
          surface="sheet"
          onOpenChange={close}
          groupId={group.id}
          groupKind={group.kind}
          today={today}
          membership={sheet.kind === 'edit' ? sheet.row : null}
          onSaved={async () => {
            flash(t('groups.memberships.flash.saved'), 'success')
            await refresh()
          }}
          onRefresh={() => void refresh()}
        />
      ) : null}
      {sheet?.kind === 'end' ? (
        <EndMembershipDialog
          open
          surface="sheet"
          onOpenChange={close}
          membership={sheet.row}
          today={today}
          onSaved={async () => {
            flash(t('groups.memberships.flash.ended'), 'success')
            await refresh()
          }}
          onRefresh={() => void refresh()}
        />
      ) : null}
      {sheet?.kind === 'moveMany' ? (
        <MoveChildrenDialog
          open
          surface="sheet"
          onOpenChange={close}
          groupId={group.id}
          today={today}
          initialSelectedIds={[]}
          onMoved={async (result) => {
            setMoveResult(result)
            await refresh()
          }}
        />
      ) : null}
      {ConfirmDialogElement}
    </>
  )
}

function Group({ id }: { id: string }) {
  const t = useT()
  const query = useGroup(id)
  const back = (
    <Link href={CLUB_GROUPS_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
      {t('groups.club.back')}
    </Link>
  )
  if (!query.data && query.isFetching) return <MemberSkeleton shape="rows" label={t('groups.club.loading')} />
  if (!query.data) {
    return (
      <ErrorMessage
        label={t('groups.club.errors.group')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('groups.club.retry')}
          </Button>
        }
      />
    )
  }
  if (query.data.status !== 'ok') {
    const message =
      query.data.status === 'not_found'
        ? t('groups.club.notFound')
        : query.data.status === 'unlinked'
          ? t('foundation.errors.scope_unlinked')
          : t('groups.club.forbidden')
    return (
      <>
        {back}
        <p className="text-muted-foreground" data-testid={`club-group-${query.data.status}`}>
          {message}
        </p>
      </>
    )
  }
  return (
    <>
      {back}
      <Roster group={query.data.group} />
    </>
  )
}

export function ClubGroupPage({ groupId }: { groupId: string }) {
  return <GroupsClubFrame>{() => <Group id={groupId} />}</GroupsClubFrame>
}
