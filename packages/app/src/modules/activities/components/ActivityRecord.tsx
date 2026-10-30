'use client'
// `/backend/activities/activities/[id]` (club spec UI table): the activity record with the tabs "Details" (the edit
// form with the session preview for `activities.manage`, read-only otherwise) and "Sessions" (its sessions in date
// order). Deleting asks first; an activity with sessions in its history answers 409 `activity_has_sessions` and the
// page explains to deactivate it instead. The server decides the scope: an activity outside it answers 403 and the
// page shows the permission-denied state.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { deleteCrud } from '@open-mercato/ui/backend/utils/crud'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ActivityDetailsForm } from './ActivityForm'
import { ActivitySessions } from './OccurrencesTable'
import {
  ACTIVITIES_HREF,
  errorCode,
  errorMessage,
  scheduleSummary,
  typeLabel,
  type ActivityDetail,
  type Translate,
} from './client-helpers'
import { useActivitiesFeatures } from './useActivitiesFeatures'

type ActivityLoad = { status: 'ok'; activity: ActivityDetail } | { status: 'not_found' } | { status: 'denied' }

function ReadOnlyDetails({ activity, t }: { activity: ActivityDetail; t: Translate }) {
  const rows: Array<[string, string | null | undefined]> = [
    [t('activities.fields.group'), activity.groupName],
    [t('activities.fields.section'), activity.sectionName],
    [t('activities.fields.name'), activity.name],
    [t('activities.fields.type'), typeLabel(t, activity.type)],
    [t('activities.fields.schedule'), scheduleSummary(t, activity)],
    [t('activities.fields.startsOn'), activity.startsOn],
    [t('activities.fields.endsOn'), activity.endsOn],
    [t('activities.fields.place'), activity.placeName],
    [t('activities.fields.coach'), activity.coachName],
    [t('activities.fields.description'), activity.description],
    [t('activities.fields.generatedUntil'), activity.generatedUntil],
  ]
  return (
    <section
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      aria-label={t('activities.activities.record.details')}
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-sm break-words whitespace-pre-wrap">{value || t('activities.common.empty')}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function ActivityRecord({ id }: { id: string }) {
  const t = useT()
  const router = useRouter()
  const features = useActivitiesFeatures()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [tab, setTab] = React.useState('details')
  const [deleting, setDeleting] = React.useState(false)
  const [hasSessions, setHasSessions] = React.useState(false)
  const query = useQuery({
    queryKey: ['activities-activity', id],
    queryFn: async (): Promise<ActivityLoad> => {
      const call = await apiCall<ActivityDetail>(`/api/activities/activities/${encodeURIComponent(id)}`)
      if (call.status === 404) return { status: 'not_found' }
      if (call.status === 403) return { status: 'denied' }
      if (!call.ok || !call.result) throw new Error(t('activities.activities.errors.loadOne'))
      return { status: 'ok', activity: call.result }
    },
  })
  const refetch = React.useCallback(async () => {
    await query.refetch()
  }, [query])

  if (query.isLoading) return <LoadingMessage label={t('activities.activities.loading')} />
  if (query.error) return <ErrorMessage label={t('activities.activities.errors.loadOne')} />
  const load = query.data
  if (!load || load.status === 'not_found') {
    return (
      <RecordNotFoundState
        label={t('activities.activities.errors.notFound')}
        backHref={ACTIVITIES_HREF}
        backLabel={t('activities.activities.actions.back')}
      />
    )
  }
  if (load.status === 'denied') return <AccessDeniedMessage label={t('activities.activities.errors.denied')} />

  const activity = load.activity

  const remove = async () => {
    const confirmed = await confirm({
      title: t('activities.activities.confirm.delete'),
      text: t('activities.activities.confirm.deleteText'),
      confirmText: t('activities.common.delete'),
      cancelText: t('activities.common.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(activity.updatedAt), () =>
        deleteCrud('activities/activities', activity.id, { errorMessage: t('activities.activities.errors.delete') }),
      )
      flash(t('activities.activities.flash.deleted'), 'success')
      router.push(ACTIVITIES_HREF)
    } catch (error: unknown) {
      if (errorCode(error) === 'activity_has_sessions') {
        setHasSessions(true)
        flash(errorMessage(error, t('activities.activities.errors.delete')), 'error')
      } else if (!surfaceRecordConflict(error, t, { onRefresh: () => void refetch() })) {
        flash(errorMessage(error, t('activities.activities.errors.delete')), 'error')
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words">
            {activity.name ?? t('activities.activities.record.title')}
          </h1>
          <span className="text-muted-foreground text-sm break-words">
            {[activity.groupName, typeLabel(t, activity.type), scheduleSummary(t, activity)]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={activity.isActive ? 'success' : 'neutral'}>
            {activity.isActive ? t('activities.common.active') : t('activities.common.inactive')}
          </StatusBadge>
          {features.manage ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={deleting}
              data-testid="activity-delete-button"
              onClick={() => {
                void remove()
              }}
            >
              {t('activities.common.delete')}
            </Button>
          ) : null}
        </div>
      </header>
      {hasSessions ? (
        <Alert status="warning" data-testid="activity-has-sessions">
          <AlertTitle>{t('activities.activities.hasSessions.title')}</AlertTitle>
          <AlertDescription>{t('activities.activities.hasSessions.help')}</AlertDescription>
        </Alert>
      ) : null}
      <Tabs value={tab} onValueChange={setTab} variant="underline">
        <div className="overflow-x-auto">
          <TabsList aria-label={t('activities.activities.record.tabs')}>
            <TabsTrigger value="details">{t('activities.activities.record.details')}</TabsTrigger>
            <TabsTrigger value="sessions">{t('activities.activities.record.sessions')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="details" className="pt-4">
          {features.manage ? (
            <ActivityDetailsForm activity={activity} onSaved={refetch} />
          ) : (
            <ReadOnlyDetails activity={activity} t={t} />
          )}
        </TabsContent>
        <TabsContent value="sessions" className="pt-4">
          <ActivitySessions activityId={activity.id} />
        </TabsContent>
      </Tabs>
      {ConfirmDialogElement}
    </div>
  )
}
