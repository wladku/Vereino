'use client'
// `/club/club-events/[id]` — the club event on the phone (club events spec REQ-T02, REQ-T04, REQ-T08, REQ-T12, UI row
// `/club/club-events/[id]` and its 375 px drawing; J-T01, the phone half of J-T05; E14-S05, #380): the name and the
// status, the dates, the place with the external mark and its map link, the Public page link while published and
// **Edit club event**; then the days with a card per part — time in the club's zone, title, category, our group or
// "No club group", the number of visiting teams and the status — whose menu button (named after the part) opens a
// bottom sheet with Edit, Copy, Move, Cancel and Remove (`partActions`, as the panel). Move opens the session edit
// `/club/occurrences/{id}/edit?as=coordinator`, whose place is locked for a part; Cancel cancels the part's session
// (the toast names how many people were told) or, for an open part, the part itself with a reason; Remove asks first,
// and a part somebody declared for offers Cancel instead (409 `club_event_part_in_use`). Below: the files block
// (poster and logos, camera or file), **Add part** in a bar above the bottom navigation and **Cancel club event**
// last. A reader who does not manage the event sees it without the actions.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { MemberSkeleton, StatusTag } from '@vereino/ui'
import { partActions, partsByDay, type PartAction } from '../../lib/club-events'
import { partDayInZone, partTimeRangeInZone } from '../../lib/member-club-event'
import { ClubEventReasonDialog } from '../ClubEventReasonDialog'
import { OWN_FORBIDDEN_STATE, errorMessage, statusLabel, statusVariant } from '../client-helpers'
import {
  MEMBER_CLUB_EVENTS_HREF,
  clubEventDatesLabel,
  clubEventQueryKey,
  clubEventStatusVariant,
  memberClubEventEditHref,
  memberPartEditHref,
  memberPartNewHref,
  partDayLabel,
  useClubEvent,
  type ClubEventDetail,
  type ClubEventPart,
} from '../club-events-client'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import { ClubEventFilesBlock } from './ClubEventFilesBlock'
import { CancelSessionDialog, type CancellableSession } from './CoachSessionBlock'
import { CALENDAR_QUERY_KEY, sessionEditHref, type Translate } from './club-client'

const ACTION_LABELS: Record<PartAction, string> = {
  edit: 'activities.clubEvents.part.actions.edit',
  copy: 'activities.clubEvents.part.actions.copy',
  move: 'activities.clubEvents.part.actions.move',
  cancel: 'activities.clubEvents.part.actions.cancel',
  remove: 'activities.clubEvents.part.actions.remove',
}

/** The OpenStreetMap search of the event's place (the event read carries its name, not its address). */
function placeSearchHref(name: string | null | undefined): string | null {
  const query = name?.trim()
  return query ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}` : null
}

function PartCard({
  part,
  timeZone,
  actions,
  onMenu,
  t,
}: {
  part: ClubEventPart
  timeZone: string
  actions: PartAction[]
  onMenu: () => void
  t: Translate
}) {
  const cancelled = part.status === 'cancelled'
  const teams = part.visitingTeams.length
  return (
    <li className="bg-card flex items-start gap-3 rounded-lg border p-3" data-testid="club-event-member-part">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium tabular-nums">
          {partTimeRangeInZone(part.startAt, part.endAt, timeZone)}
        </span>
        <span className={`font-semibold break-words ${cancelled ? 'line-through' : ''}`}>{part.title}</span>
        {cancelled && part.cancelReason ? (
          <span className="text-muted-foreground text-xs">
            {t('activities.clubEvents.part.cancelledReason', { reason: part.cancelReason })}
          </span>
        ) : null}
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {part.categoryLabel ? <span>{part.categoryLabel}</span> : null}
          {part.categoryLabel ? <span aria-hidden>·</span> : null}
          {part.kind === 'open' ? (
            <StatusTag status="neutral">{t('activities.clubEvents.part.noGroup')}</StatusTag>
          ) : (
            <span>{part.groupName}</span>
          )}
          <span aria-hidden>·</span>
          <span data-testid="club-event-member-part-teams">
            {t('activities.clubEvents.club.event.teams', { count: teams })}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <StatusTag status={statusVariant(part.status)}>{statusLabel(t, part.status)}</StatusTag>
          {part.kind === 'group' && !part.coachName && part.status === 'planned' ? (
            <StatusTag status="warning">{t('activities.clubEvents.part.needsCoach')}</StatusTag>
          ) : null}
        </span>
      </div>
      {actions.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11 shrink-0"
          aria-label={t('activities.clubEvents.club.event.menu', { title: part.title })}
          aria-haspopup="dialog"
          data-testid="club-event-member-part-menu"
          onClick={onMenu}
        >
          <span aria-hidden>⋯</span>
        </Button>
      ) : null}
    </li>
  )
}

type Pending =
  | { kind: 'menu'; part: ClubEventPart }
  | { kind: 'cancelSession'; session: CancellableSession }
  | { kind: 'cancelOpen'; part: ClubEventPart }
  | { kind: 'cancelEvent' }
  | null

function EventView({ event, timeZone, t }: { event: ClubEventDetail; timeZone: string; t: Translate }) {
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [pending, setPending] = React.useState<Pending>(null)
  const planned = event.status === 'planned'
  const editable = event.mayManage === true && planned
  const days = React.useMemo(
    () => partsByDay(event.parts, (part) => partDayInZone(part.startAt, timeZone)),
    [event.parts, timeZone],
  )
  const dates = clubEventDatesLabel(locale, event)
  const mapHref = placeSearchHref(event.placeName)
  const plannedParts = event.parts.filter((part) => part.status === 'planned' && part.kind === 'group').length

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: clubEventQueryKey(event.id) })
    await queryClient.invalidateQueries({ queryKey: ['activities-member-club-events'] })
    await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
  }, [queryClient, event.id])

  /** The part's session as it is now: its lock token is the session's, not the part's. */
  const loadSession = async (part: ClubEventPart): Promise<CancellableSession | null> => {
    if (!part.occurrenceId) return null
    const call = await apiCall<{ id: string; updatedAt: string }>(
      `/api/activities/occurrences/${encodeURIComponent(part.occurrenceId)}`,
      OWN_FORBIDDEN_STATE,
    )
    if (!call.ok || !call.result) {
      flash(t('activities.occurrences.errors.loadOne'), 'error')
      return null
    }
    return { id: call.result.id, updatedAt: call.result.updatedAt }
  }

  const startCancel = async (part: ClubEventPart) => {
    if (part.kind === 'open') {
      setPending({ kind: 'cancelOpen', part })
      return
    }
    const session = await loadSession(part)
    setPending(session ? { kind: 'cancelSession', session } : null)
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
      await refresh()
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
        await refresh()
        if (cancelInstead) await startCancel(part)
      } else if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
        flash(errorMessage(error, t('activities.clubEvents.part.errors.remove')), 'error')
      }
    }
  }

  const run = async (action: PartAction, part: ClubEventPart) => {
    setPending(null)
    if (action === 'edit') router.push(memberPartEditHref(event.id, part.id))
    else if (action === 'copy') router.push(memberPartNewHref(event.id, part.id))
    else if (action === 'move' && part.occurrenceId) router.push(sessionEditHref(part.occurrenceId, 'coordinator'))
    else if (action === 'cancel') await startCancel(part)
    else if (action === 'remove') await remove(part)
  }

  const menuPart = pending?.kind === 'menu' ? pending.part : null
  const menuActions = menuPart
    ? partActions(menuPart, { mayManage: event.mayManage === true, status: event.status })
    : []

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold break-words">
            {event.name ?? t('activities.clubEvents.record.title')}
          </h1>
          <StatusTag status={clubEventStatusVariant(event.status)}>
            {t(`activities.clubEvents.status.${planned ? 'planned' : 'cancelled'}`)}
          </StatusTag>
        </div>
        <p className="text-muted-foreground text-sm">{dates ?? t('activities.clubEvents.record.noDates')}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>{event.placeName ?? t('activities.common.empty')}</span>
          {event.placeExternal ? (
            <StatusTag status="neutral">{t('activities.clubEvents.place.external')}</StatusTag>
          ) : null}
          {mapHref ? (
            <a
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex min-h-11 items-center underline"
              aria-label={t('activities.clubEvents.club.event.mapOf', { place: event.placeName ?? '' })}
              data-testid="club-event-member-map"
            >
              {t('activities.clubEvents.club.event.map')}
            </a>
          ) : null}
          {event.publicPath ? (
            <a
              href={event.publicPath}
              target="_blank"
              rel="noopener"
              className="text-primary inline-flex min-h-11 items-center underline"
              data-testid="club-event-member-public-link"
            >
              {t('activities.clubEvents.actions.publicPage')}
            </a>
          ) : null}
        </p>
        <p className="text-muted-foreground text-sm">
          {event.sectionId ? (event.sectionName ?? '') : t('activities.clubEvents.section.wholeClub')}
        </p>
        {editable ? (
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href={memberClubEventEditHref(event.id)} data-testid="club-event-member-edit">
              {t('activities.clubEvents.club.event.edit')}
            </Link>
          </Button>
        ) : null}
      </header>
      {!planned ? (
        <Alert status="error" data-testid="club-event-member-cancelled">
          <AlertTitle>{t('activities.clubEvents.cancelled.title')}</AlertTitle>
          {event.cancelReason ? (
            <AlertDescription>
              {t('activities.clubEvents.cancelled.reason', { reason: event.cancelReason })}
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}
      {event.description ? <p className="max-w-prose text-sm whitespace-pre-wrap">{event.description}</p> : null}
      {days.length === 0 ? (
        <section
          className="flex flex-col gap-2 rounded-lg border border-dashed p-4"
          data-testid="club-event-member-no-parts"
        >
          <h2 className="text-lg font-semibold">{t('activities.clubEvents.part.empty.title')}</h2>
          <p className="text-muted-foreground text-sm">{t('activities.clubEvents.part.empty.text')}</p>
        </section>
      ) : (
        days.map((day) => (
          <section
            key={day.date || 'none'}
            className="flex flex-col gap-2"
            aria-labelledby={`club-event-day-${day.date || 'none'}`}
            data-testid="club-event-member-day"
          >
            <h2 id={`club-event-day-${day.date || 'none'}`} className="text-lg font-semibold first-letter:uppercase">
              {partDayLabel(t, locale, day.date)}
            </h2>
            <ul className="flex flex-col gap-2">
              {day.parts.map((part) => (
                <PartCard
                  key={part.id}
                  part={part}
                  timeZone={timeZone}
                  actions={partActions(part, { mayManage: event.mayManage === true, status: event.status })}
                  onMenu={() => {
                    setPending({ kind: 'menu', part })
                  }}
                  t={t}
                />
              ))}
            </ul>
          </section>
        ))
      )}
      <ClubEventFilesBlock event={event} editable={editable} onChanged={refresh} />
      {editable ? (
        <div
          className="bg-background sticky bottom-24 z-30 -mx-4 flex flex-col gap-2 border-t px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:p-0"
          data-testid="club-event-member-actions"
        >
          <Button asChild className="min-h-11 w-full">
            <Link href={memberPartNewHref(event.id)} data-testid="club-event-member-add-part">
              {t('activities.clubEvents.part.actions.add')}
            </Link>
          </Button>
        </div>
      ) : null}
      {editable ? (
        <Button
          type="button"
          variant="destructive"
          className="min-h-11 w-full"
          data-testid="club-event-member-cancel"
          onClick={() => {
            setPending({ kind: 'cancelEvent' })
          }}
        >
          {t('activities.clubEvents.actions.cancel')}
        </Button>
      ) : null}
      <Sheet
        open={menuPart !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-dvh rounded-t-xl"
          closeLabel={t('activities.common.close')}
          data-testid="club-event-member-part-sheet"
        >
          <SheetHeader>
            <SheetTitle>{menuPart?.title ?? ''}</SheetTitle>
            <SheetDescription>
              {menuPart ? partTimeRangeInZone(menuPart.startAt, menuPart.endAt, timeZone) : ''}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {menuActions.map((action) => (
              <Button
                key={action}
                type="button"
                variant={action === 'cancel' || action === 'remove' ? 'destructive' : 'outline'}
                className="min-h-11 w-full justify-start"
                data-testid={`club-event-member-part-${action}`}
                onClick={() => {
                  if (menuPart) void run(action, menuPart)
                }}
              >
                {t(ACTION_LABELS[action])}
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      {pending?.kind === 'cancelSession' ? (
        <CancelSessionDialog
          occurrence={pending.session}
          open
          onOpenChange={(open) => {
            if (!open) setPending(null)
          }}
          onDone={async (message) => {
            if (message) flash(message, 'success')
            await refresh()
          }}
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
          testId="club-event-member-part-cancel"
          onConfirm={async (reason) => {
            const part = pending.part
            try {
              await withScopedApiRequestHeaders(buildOptimisticLockHeader(part.updatedAt), () =>
                apiCallOrThrow(
                  `/api/activities/club-events/${encodeURIComponent(event.id)}/parts/${encodeURIComponent(part.id)}/cancel`,
                  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) },
                  { errorMessage: t('activities.clubEvents.part.errors.cancel') },
                ),
              )
            } catch (error: unknown) {
              if (surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
                setPending(null)
                return null
              }
              return errorMessage(error, t('activities.clubEvents.part.errors.cancel'))
            }
            flash(t('activities.clubEvents.part.flash.cancelled'), 'success')
            setPending(null)
            await refresh()
            return null
          }}
        />
      ) : null}
      {pending?.kind === 'cancelEvent' ? (
        <ClubEventReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) setPending(null)
          }}
          title={t('activities.clubEvents.cancel.title', { name: event.name ?? '' })}
          description={t('activities.clubEvents.cancel.text', { count: plannedParts })}
          confirmLabel={t('activities.clubEvents.actions.cancel')}
          testId="club-event-member-cancel-dialog"
          onConfirm={async (reason) => {
            try {
              const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(event.updatedAt), () =>
                apiCallOrThrow<{ notified?: number }>(
                  `/api/activities/club-events/${encodeURIComponent(event.id)}/cancel`,
                  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) },
                  { errorMessage: t('activities.clubEvents.errors.cancel') },
                ),
              )
              flash(t('activities.clubEvents.flash.cancelled', { count: call.result?.notified ?? 0 }), 'success')
            } catch (error: unknown) {
              if (surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
                setPending(null)
                return null
              }
              if (errorCodeOf(error) === 'club_event_cancelled') {
                setPending(null)
                await refresh()
                return null
              }
              return errorMessage(error, t('activities.clubEvents.errors.cancel'))
            }
            setPending(null)
            await refresh()
            return null
          }}
        />
      ) : null}
      {ConfirmDialogElement}
    </>
  )
}

function EventContent({ id, timeZone, t }: { id: string; timeZone: string; t: Translate }) {
  const query = useClubEvent(id)
  const load = query.data
  let body: React.ReactNode
  if (!load && query.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('activities.clubEvents.loading')} />
  } else if (load?.status === 'not_found') {
    body = (
      <Alert status="information" data-testid="club-event-member-not-found">
        <p>{t('activities.clubEvents.errors.notFound')}</p>
      </Alert>
    )
  } else if (load?.status === 'denied') {
    body = (
      <Alert status="information" data-testid="club-event-member-denied">
        <p>{t('activities.clubEvents.errors.denied')}</p>
      </Alert>
    )
  } else if (load?.status === 'ok') {
    body = <EventView event={load.event} timeZone={timeZone} t={t} />
  } else {
    body = (
      <ErrorMessage
        label={t('activities.clubEvents.errors.loadOne')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  return (
    <>
      <Link href={MEMBER_CLUB_EVENTS_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
        {t('activities.clubEvents.actions.back')}
      </Link>
      {load?.status === 'ok' ? null : (
        <h1 className="text-2xl font-semibold">{t('activities.clubEvents.record.title')}</h1>
      )}
      {body}
    </>
  )
}

export function ClubEventDetailPage({ id }: { id: string }) {
  const t = useT()
  return (
    <ActivitiesClubFrame>
      {(profile) => <EventContent id={id} timeZone={profile.club.timezone} t={t} />}
    </ActivitiesClubFrame>
  )
}
