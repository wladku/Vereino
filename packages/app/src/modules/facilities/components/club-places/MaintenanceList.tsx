'use client'
// `/club/places/maintenance` — the tasks of the places a person maintains, on the phone (facilities parity spec REQ-R15,
// J-R07; D-029; #283). Three sections, Due / Planned / Done (`maintenanceListGroup`: a planned task is due once a
// reminder would go out for it). A card names the kind of work, the place and the schedule; a planned task offers
// "Done" (the completion dialog; a recurring task gets its next instance) and "Plan" (the task dialog, its window read
// in the club's time zone); every card links to the place's day axis — on the window's day for a window. "Plan
// maintenance" plans a new task on one of the caller's places. The reads are the panel's routes, filtered by the
// caller's places (the `maintenance_planner` grant); a user without `facilities.maintenance.manage` sees a
// permission-denied state. States: loading, empty ("No tasks on your places"), error with retry, 403, and 409
// `maintenance_task_closed` in the completion dialog.
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { calendarDateInZone } from '@vereino/core'
import { MemberSkeleton } from '@vereino/ui'
import { MAINTENANCE_LIST_GROUPS, maintenanceListGroup, type MaintenanceListGroup } from '../../lib/maintenance'
import { instantLabel } from '../facilities-client'
import { MaintenanceCompleteDialog } from '../MaintenanceCompleteDialog'
import { MaintenanceTaskDialog } from '../MaintenanceTaskDialog'
import {
  MAINTENANCE_KEY,
  flashFlagged,
  kindLabel,
  scheduleLabel,
  statusVariant,
  useMaintainerTasks,
  useMaintenancePlaces,
  type MaintenanceTaskRow,
} from '../maintenance-client'
import { FacilitiesClubFrame, type PlacesProfile } from './FacilitiesClubFrame'
import {
  CLUB_PLACES_HREF,
  PLACES_CALENDAR_KEY,
  calendarErrorStatus,
  placeHref,
  zonedLocalInstant,
  zonedLocalValue,
} from './places-client'

function TaskCard({
  task,
  group,
  timeZone,
  onComplete,
  onPlan,
}: {
  task: MaintenanceTaskRow
  group: MaintenanceListGroup
  timeZone: string
  onComplete: (task: MaintenanceTaskRow) => void
  onPlan: (task: MaintenanceTaskRow) => void
}) {
  const t = useT()
  const locale = useLocale()
  const place = task.placeName ?? t('facilities.common.unknownPlace')
  const day = task.startsAt ? calendarDateInZone(new Date(task.startsAt), timeZone) : undefined
  return (
    <li className="flex flex-col gap-3 rounded-md border p-4" data-testid={`club-maintenance-task-${task.id}`}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold break-words">{kindLabel(t, task.kind)}</h3>
          <StatusBadge variant={group === 'due' ? 'warning' : statusVariant(task.status)}>
            {t(`facilities.places.maintenance.groups.${group}`)}
          </StatusBadge>
        </div>
        <p className="text-sm break-words">{place}</p>
        <p className="text-muted-foreground text-sm break-words tabular-nums" data-testid="club-maintenance-schedule">
          {scheduleLabel(t, locale, task)}
        </p>
        {task.status === 'done' && task.doneAt ? (
          <p className="text-muted-foreground text-sm tabular-nums">
            {task.doneByName
              ? t('facilities.maintenance.doneBy', { date: instantLabel(task.doneAt), name: task.doneByName })
              : instantLabel(task.doneAt)}
          </p>
        ) : null}
        {task.notes ? <p className="text-sm break-words">{task.notes}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {task.status === 'planned' ? (
          <>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => {
                onComplete(task)
              }}
              data-testid={`club-maintenance-complete-${task.id}`}
            >
              {t('facilities.places.maintenance.actions.complete')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                onPlan(task)
              }}
              data-testid={`club-maintenance-plan-${task.id}`}
            >
              {t('facilities.places.maintenance.actions.plan')}
            </Button>
          </>
        ) : null}
        <Button asChild variant="outline" className="min-h-11">
          <Link href={placeHref(task.placeId, day)} data-testid={`club-maintenance-day-${task.id}`}>
            {t('facilities.places.maintenance.actions.day', { place })}
          </Link>
        </Button>
      </div>
    </li>
  )
}

function TaskSections({ profile }: { profile: PlacesProfile }) {
  const t = useT()
  const queryClient = useQueryClient()
  const timeZone = profile.club.timezone
  const query = useMaintainerTasks()
  const places = useMaintenancePlaces()
  const [dialog, setDialog] = React.useState<{ key: number; task: MaintenanceTaskRow | null } | null>(null)
  const [completing, setCompleting] = React.useState<MaintenanceTaskRow | null>(null)
  const placeOptions = places.data?.options ?? []
  const canPlan = places.data?.canPlan === true && placeOptions.length > 0

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [MAINTENANCE_KEY] }),
      queryClient.invalidateQueries({ queryKey: [PLACES_CALENDAR_KEY] }),
    ])
  }
  const openDialog = (task: MaintenanceTaskRow | null) => {
    setDialog((current) => ({ key: (current?.key ?? 0) + 1, task }))
  }

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = (
      <MemberSkeleton
        shape="rows"
        label={t('facilities.places.maintenance.loading')}
        data-testid="club-maintenance-loading"
      />
    )
  } else if (!query.data && calendarErrorStatus(query.error) === 403) {
    body = (
      <Alert status="warning" data-testid="club-maintenance-denied">
        <p className="max-w-prose">{t('facilities.places.maintenance.forbidden')}</p>
      </Alert>
    )
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('facilities.maintenance.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('facilities.places.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.planned.length === 0 && query.data.done.length === 0) {
    body = (
      <p className="text-muted-foreground" data-testid="club-maintenance-empty">
        {t('facilities.places.maintenance.empty')}
      </p>
    )
  } else {
    const now = new Date()
    const today = calendarDateInZone(now, timeZone)
    const grouped = new Map<MaintenanceListGroup, MaintenanceTaskRow[]>(
      MAINTENANCE_LIST_GROUPS.map((group) => [group, []]),
    )
    for (const task of [...query.data.planned, ...query.data.done]) {
      const group = maintenanceListGroup(task, today, now)
      if (group) grouped.get(group)?.push(task)
    }
    body = MAINTENANCE_LIST_GROUPS.map((group) => {
      const tasks = grouped.get(group) ?? []
      const headingId = `club-maintenance-${group}-heading`
      return (
        <section
          key={group}
          aria-labelledby={headingId}
          className="flex flex-col gap-3"
          data-testid={`club-maintenance-${group}`}
        >
          <h2 id={headingId} className="text-lg font-semibold">
            {t(`facilities.places.maintenance.groups.${group}`)}{' '}
            <span className="text-muted-foreground text-sm font-normal tabular-nums">({tasks.length})</span>
          </h2>
          {tasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('facilities.places.maintenance.groupEmpty')}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  group={group}
                  timeZone={timeZone}
                  onComplete={setCompleting}
                  onPlan={openDialog}
                />
              ))}
            </ul>
          )}
        </section>
      )
    })
  }

  return (
    <>
      <Link href={CLUB_PLACES_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
        {t('facilities.places.back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('facilities.places.maintenance.title')}</h1>
        {canPlan ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              openDialog(null)
            }}
            data-testid="club-maintenance-create"
          >
            {t('facilities.maintenance.actions.plan')}
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground max-w-prose text-sm">{t('facilities.places.maintenance.intro')}</p>
      {body}
      {dialog ? (
        <MaintenanceTaskDialog
          key={dialog.key}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          places={placeOptions}
          task={dialog.task}
          toInstant={(local) => zonedLocalInstant(local, timeZone)}
          toLocal={(iso) => zonedLocalValue(iso, timeZone)}
          windowHelp={t('facilities.maintenance.plan.zone', { zone: timeZone })}
          testId="club-maintenance-dialog"
          onRefresh={() => void refresh()}
          onSaved={async (result) => {
            flashFlagged(
              t,
              result,
              dialog.task ? t('facilities.maintenance.flash.saved') : t('facilities.maintenance.flash.planned'),
            )
            await refresh()
          }}
        />
      ) : null}
      {completing ? (
        <MaintenanceCompleteDialog
          key={completing.id}
          task={completing}
          toInstant={(local) => zonedLocalInstant(local, timeZone)}
          toLocal={(iso) => zonedLocalValue(iso, timeZone)}
          onOpenChange={(open) => {
            if (!open) setCompleting(null)
          }}
          onRefresh={() => void refresh()}
          onDone={async (nextTaskId) => {
            flash(
              nextTaskId ? t('facilities.maintenance.flash.doneNext') : t('facilities.maintenance.flash.done'),
              'success',
            )
            await refresh()
          }}
        />
      ) : null}
    </>
  )
}

export function MaintenanceList() {
  return <FacilitiesClubFrame>{(profile) => <TaskSections profile={profile} />}</FacilitiesClubFrame>
}
