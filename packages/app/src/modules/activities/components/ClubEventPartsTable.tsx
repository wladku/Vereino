'use client'
// The Parts tab of the club event record (club events spec B-T3, REQ-T02, REQ-T04, REQ-T11, AC-T03; #378): one table
// per day under the day's heading — Time, Title, Category, Our group (Section), Visiting teams, Coach, Status — with
// **Add part** and the row actions of `partActions`: Edit, Copy (`?copyOf=`, the day and group chosen again), Move
// (the session's move with the place locked, DD-T05), Cancel (the session's cancellation, or a reason for an open
// part), Remove (asks first; a part someone declared for answers 409 `club_event_part_in_use` and the page offers
// Cancel instead). A cancelled part stays, struck through, with its reason.
import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { EmptyState } from '@open-mercato/ui/backend/EmptyState'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { partActions, partsByDay, type PartAction } from '../lib/club-events'
import { CancelOccurrenceDialog } from './CancelOccurrenceDialog'
import { ClubEventPartDialog, type PartDialogMode } from './ClubEventPartDialog'
import { ClubEventReasonDialog } from './ClubEventReasonDialog'
import { MoveOccurrenceDialog } from './MoveOccurrenceDialog'
import {
  OWN_FORBIDDEN_STATE,
  errorMessage,
  instantDate,
  statusLabel,
  statusVariant,
  timeRangeOfInstants,
  type OccurrenceDetail,
  type TableColumns,
  type Translate,
} from './client-helpers'
import { partDayLabel, type ClubEventDetail, type ClubEventOptions, type ClubEventPart } from './club-events-client'
import { StatusTag } from '@vereino/ui'

const ACTION_LABELS: Record<PartAction, string> = {
  edit: 'activities.clubEvents.part.actions.edit',
  copy: 'activities.clubEvents.part.actions.copy',
  move: 'activities.clubEvents.part.actions.move',
  cancel: 'activities.clubEvents.part.actions.cancel',
  remove: 'activities.clubEvents.part.actions.remove',
}

function buildColumns(t: Translate): TableColumns<ClubEventPart> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    {
      id: 'time',
      header: t('activities.clubEvents.part.columns.time'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{timeRangeOfInstants(row.original.startAt, row.original.endAt)}</span>
      ),
    },
    {
      id: 'title',
      header: t('activities.clubEvents.part.columns.title'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => {
        const cancelled = row.original.status === 'cancelled'
        return (
          <span className="flex flex-col gap-0.5" data-testid="club-event-part-title">
            <span className={cancelled ? 'font-medium line-through' : 'font-medium'}>{row.original.title}</span>
            {cancelled && row.original.cancelReason ? (
              <span className="text-muted-foreground text-xs">
                {t('activities.clubEvents.part.cancelledReason', { reason: row.original.cancelReason })}
              </span>
            ) : null}
          </span>
        )
      },
    },
    {
      id: 'category',
      header: t('activities.clubEvents.part.columns.category'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => row.original.categoryLabel ?? dash,
    },
    {
      id: 'group',
      header: t('activities.clubEvents.part.columns.group'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) =>
        row.original.kind === 'open' ? (
          <StatusTag status="neutral">{t('activities.clubEvents.part.noGroup')}</StatusTag>
        ) : (
          `${row.original.groupName ?? ''}${row.original.sectionName ? ` (${row.original.sectionName})` : ''}`
        ),
    },
    {
      id: 'teams',
      header: t('activities.clubEvents.part.columns.teams'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) =>
        row.original.visitingTeams.length > 0 ? (
          <span
            title={row.original.visitingTeams.map((team) => team.name).join(', ')}
            data-testid="club-event-part-teams"
          >
            {row.original.visitingTeams.map((team) => team.name).join(', ')}
          </span>
        ) : (
          dash
        ),
    },
    {
      id: 'coach',
      header: t('activities.clubEvents.part.columns.coach'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) =>
        row.original.coachName ??
        (row.original.kind === 'group' && row.original.status === 'planned' ? (
          <StatusTag status="warning">{t('activities.clubEvents.part.needsCoach')}</StatusTag>
        ) : (
          dash
        )),
    },
    {
      id: 'status',
      header: t('activities.clubEvents.part.columns.status'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <StatusTag status={statusVariant(row.original.status)}>{statusLabel(t, row.original.status)}</StatusTag>
      ),
    },
  ]
}

type Pending =
  | { kind: 'part'; mode: PartDialogMode }
  | { kind: 'move'; occurrence: OccurrenceDetail }
  | { kind: 'cancelSession'; occurrence: OccurrenceDetail }
  | { kind: 'cancelOpen'; part: ClubEventPart }
  | null

export function ClubEventPartsTable({
  event,
  options,
  onChanged,
}: {
  event: ClubEventDetail
  options: ClubEventOptions | null
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [pending, setPending] = React.useState<Pending>(null)
  const columns = React.useMemo(() => buildColumns(t), [t])
  const days = React.useMemo(() => partsByDay(event.parts, (part) => instantDate(part.startAt)), [event.parts])
  const canAdd = event.mayManage === true && event.status === 'planned' && options !== null
  const placeLabel = event.placeName ?? ''

  // `?copyOf=<partId>` opens the part dialog prefilled from that part (B-T3; the phone pages use the same link).
  const copyOf = searchParams.get('copyOf')
  const copySource = copyOf ? (event.parts.find((part) => part.id === copyOf) ?? null) : null
  const setCopyOf = React.useCallback(
    (partId: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (partId) params.set('copyOf', partId)
      else params.delete('copyOf')
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const loadSession = async (part: ClubEventPart): Promise<OccurrenceDetail | null> => {
    if (!part.occurrenceId) return null
    const call = await apiCall<OccurrenceDetail>(
      `/api/activities/occurrences/${encodeURIComponent(part.occurrenceId)}`,
      OWN_FORBIDDEN_STATE,
    )
    if (!call.ok || !call.result) {
      flash(t('activities.occurrences.errors.loadOne'), 'error')
      return null
    }
    return call.result
  }

  const startCancel = async (part: ClubEventPart) => {
    if (part.kind === 'open') {
      setPending({ kind: 'cancelOpen', part })
      return
    }
    const occurrence = await loadSession(part)
    if (occurrence) setPending({ kind: 'cancelSession', occurrence })
  }

  const remove = async (part: ClubEventPart) => {
    const confirmed = await confirm({
      title: t('activities.clubEvents.part.remove.title', { title: part.title }),
      text: t(
        part.kind === 'group'
          ? 'activities.clubEvents.part.remove.textGroup'
          : 'activities.clubEvents.part.remove.textOpen',
      ),
      confirmText: t('activities.clubEvents.part.actions.remove'),
      cancelText: t('activities.common.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(part.updatedAt), () =>
        apiCallOrThrow(
          `/api/activities/club-events/${encodeURIComponent(event.id)}/parts/${encodeURIComponent(part.id)}`,
          { method: 'DELETE' },
          { errorMessage: t('activities.clubEvents.part.errors.remove') },
        ),
      )
      flash(t('activities.clubEvents.part.flash.removed'), 'success')
      await onChanged()
    } catch (error: unknown) {
      if (errorCodeOf(error) === 'club_event_part_in_use') {
        // AC-T03: a part someone declared for cannot be removed; cancelling it tells its families.
        const cancelInstead = await confirm({
          title: t('activities.clubEvents.part.inUse.title'),
          text: t('activities.clubEvents.part.inUse.text'),
          confirmText: t('activities.clubEvents.part.actions.cancel'),
          cancelText: t('activities.common.back'),
          variant: 'destructive',
        })
        await onChanged()
        if (cancelInstead) await startCancel(part)
      } else if (!surfaceRecordConflict(error, t, { onRefresh: () => void onChanged() })) {
        flash(errorMessage(error, t('activities.clubEvents.part.errors.remove')), 'error')
      }
    }
  }

  const run = async (action: PartAction, part: ClubEventPart) => {
    if (action === 'edit') setPending({ kind: 'part', mode: { kind: 'edit', part } })
    else if (action === 'copy') setCopyOf(part.id)
    else if (action === 'move') {
      const occurrence = await loadSession(part)
      if (occurrence) setPending({ kind: 'move', occurrence })
    } else if (action === 'cancel') await startCancel(part)
    else await remove(part)
  }

  const rowActions = (part: ClubEventPart) => {
    const actions = partActions(part, { mayManage: event.mayManage === true, status: event.status })
    if (actions.length === 0) return null
    const items: RowActionItem[] = actions.map((action) => ({
      id: action,
      label: t(ACTION_LABELS[action]),
      destructive: action === 'cancel' || action === 'remove',
      onSelect: () => {
        void run(action, part)
      },
    }))
    return <RowActions items={items} />
  }

  const partDialog =
    options && (pending?.kind === 'part' || copySource) ? (
      <ClubEventPartDialog
        key={
          pending?.kind === 'part'
            ? pending.mode.kind === 'edit'
              ? pending.mode.part.id
              : 'new'
            : `copy-${copySource?.id ?? ''}`
        }
        event={event}
        options={options}
        mode={pending?.kind === 'part' ? pending.mode : { kind: 'create', source: copySource }}
        open
        onOpenChange={(open) => {
          if (open) return
          setPending(null)
          if (copyOf) setCopyOf(null)
        }}
        onDone={onChanged}
      />
    ) : null

  const addButton = (
    <Button
      type="button"
      data-testid="club-event-add-part"
      onClick={() => {
        setPending({ kind: 'part', mode: { kind: 'create' } })
      }}
    >
      {t('activities.clubEvents.part.actions.add')}
    </Button>
  )

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="club-event-parts">
      {canAdd && days.length > 0 ? <div className="flex justify-end">{addButton}</div> : null}
      {days.length === 0 ? (
        <div data-testid="club-event-parts-empty">
          <EmptyState
            title={t('activities.clubEvents.part.empty.title')}
            description={t('activities.clubEvents.part.empty.text')}
            actions={canAdd ? addButton : undefined}
          />
        </div>
      ) : (
        days.map((day) => (
          <section key={day.date || 'none'} className="flex min-w-0 flex-col gap-2" data-testid="club-event-part-day">
            <h2 className="text-base font-semibold first-letter:uppercase">{partDayLabel(t, locale, day.date)}</h2>
            <DataTable<ClubEventPart>
              embedded
              columns={columns}
              data={day.parts}
              rowActions={rowActions}
              disableRowClick
            />
          </section>
        ))
      )}
      {partDialog}
      {pending?.kind === 'move' ? (
        <MoveOccurrenceDialog
          key={pending.occurrence.id}
          occurrence={pending.occurrence}
          lockedPlace={{ label: placeLabel }}
          open
          onOpenChange={(open) => {
            if (!open) setPending(null)
          }}
          onDone={onChanged}
        />
      ) : null}
      {pending?.kind === 'cancelSession' ? (
        <CancelOccurrenceDialog
          key={pending.occurrence.id}
          occurrence={pending.occurrence}
          open
          onOpenChange={(open) => {
            if (!open) setPending(null)
          }}
          onDone={onChanged}
        />
      ) : null}
      {pending?.kind === 'cancelOpen' ? (
        <ClubEventReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) setPending(null)
          }}
          title={t('activities.clubEvents.part.cancelOpen.title')}
          description={t('activities.clubEvents.part.cancelOpen.text', { title: pending.part.title })}
          confirmLabel={t('activities.clubEvents.part.actions.cancel')}
          testId="club-event-part-cancel"
          onConfirm={async (reason) => {
            const part = pending.part
            try {
              await withScopedApiRequestHeaders(buildOptimisticLockHeader(part.updatedAt), () =>
                apiCallOrThrow(
                  `/api/activities/club-events/${encodeURIComponent(event.id)}/parts/${encodeURIComponent(part.id)}/cancel`,
                  {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ reason }),
                  },
                  { errorMessage: t('activities.clubEvents.part.errors.cancel') },
                ),
              )
            } catch (error: unknown) {
              if (surfaceRecordConflict(error, t, { onRefresh: () => void onChanged() })) {
                setPending(null)
                return null
              }
              return errorMessage(error, t('activities.clubEvents.part.errors.cancel'))
            }
            flash(t('activities.clubEvents.part.flash.cancelled'), 'success')
            setPending(null)
            await onChanged()
            return null
          }}
        />
      ) : null}
      {ConfirmDialogElement}
    </div>
  )
}
