'use client'
// `/backend/activities/club-events/[id]` (club events spec B-T3, REQ-T01, REQ-T02, REQ-T11; #378): the club event
// record — a header with the dates, the place (external mark) and the section, the status, the Public page link while
// the event is published and **Cancel club event** (a reason; it says how many planned parts' families will be told,
// and the toast how many people were). Tabs Details and Parts under `?tab=`, default Parts. A reader who does not
// manage the event (a coordinator of another section, or of a whole-club event) sees them read-only. The Files tab
// holds the poster and the funder logos (E14-S04, #379).
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { ClubEventFilesPanel } from './ClubEventFilesPanel'
import { ClubEventDetailsForm } from './ClubEventForm'
import { ClubEventPartsTable } from './ClubEventPartsTable'
import { ClubEventReasonDialog } from './ClubEventReasonDialog'
import { OWN_FORBIDDEN_STATE, errorMessage, type Translate } from './client-helpers'
import {
  CLUB_EVENTS_HREF,
  clubEventDatesLabel,
  clubEventStatusVariant,
  useClubEventOptions,
  type ClubEventDetail,
} from './club-events-client'

type Load = { status: 'ok'; event: ClubEventDetail } | { status: 'not_found' } | { status: 'denied' }

const TABS = ['details', 'parts', 'files'] as const
type Tab = (typeof TABS)[number]

function tabFrom(value: string | null): Tab {
  return TABS.find((tab) => tab === value) ?? 'parts'
}

function ReadOnlyDetails({ event, t }: { event: ClubEventDetail; t: Translate }) {
  const rows: Array<[string, string | null | undefined]> = [
    [t('activities.clubEvents.fields.name'), event.name],
    [t('activities.clubEvents.fields.slug'), event.publicSlug],
    [
      t('activities.clubEvents.fields.section'),
      event.sectionId ? event.sectionName : t('activities.clubEvents.section.wholeClub'),
    ],
    [t('activities.clubEvents.fields.place'), event.placeName],
    [t('activities.clubEvents.fields.description'), event.description],
    [
      t('activities.clubEvents.fields.isPublic'),
      event.isPublic ? t('activities.clubEvents.public.yes') : t('activities.clubEvents.public.no'),
    ],
  ]
  return (
    <section className="bg-card flex flex-col gap-3 rounded-lg border p-4" data-testid="club-event-details-readonly">
      <p className="text-muted-foreground text-sm">{t('activities.clubEvents.readOnly')}</p>
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

export function ClubEventRecord({ id }: { id: string }) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = tabFrom(searchParams.get('tab'))
  const [cancelling, setCancelling] = React.useState(false)
  const query = useQuery({
    queryKey: ['activities-club-event', id],
    queryFn: async (): Promise<Load> => {
      const call = await apiCall<ClubEventDetail>(
        `/api/activities/club-events/${encodeURIComponent(id)}`,
        OWN_FORBIDDEN_STATE,
      )
      if (call.status === 404) return { status: 'not_found' }
      if (call.status === 403) return { status: 'denied' }
      if (!call.ok || !call.result) throw new Error(t('activities.clubEvents.errors.loadOne'))
      return { status: 'ok', event: call.result }
    },
  })
  const load = query.data
  const manages = load?.status === 'ok' && load.event.mayManage === true
  const options = useClubEventOptions(manages)
  const refetch = React.useCallback(async () => {
    await query.refetch()
  }, [query])

  const selectTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  if (query.isLoading) return <LoadingMessage label={t('activities.clubEvents.loading')} />
  if (query.error) return <ErrorMessage label={t('activities.clubEvents.errors.loadOne')} />
  if (!load || load.status === 'not_found') {
    return (
      <RecordNotFoundState
        label={t('activities.clubEvents.errors.notFound')}
        backHref={CLUB_EVENTS_HREF}
        backLabel={t('activities.clubEvents.actions.back')}
      />
    )
  }
  if (load.status === 'denied') return <AccessDeniedMessage label={t('activities.clubEvents.errors.denied')} />

  const event = load.event
  const planned = event.status === 'planned'
  const editable = manages && planned
  const plannedParts = event.parts.filter((part) => part.status === 'planned' && part.kind === 'group').length
  const dates = clubEventDatesLabel(locale, event)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words">
            {event.name ?? t('activities.clubEvents.record.title')}
          </h1>
          <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            {dates ? <span>{dates}</span> : <span>{t('activities.clubEvents.record.noDates')}</span>}
            <span aria-hidden>·</span>
            <span>{event.placeName ?? t('activities.common.empty')}</span>
            {event.placeExternal ? (
              <StatusBadge variant="neutral">{t('activities.clubEvents.place.external')}</StatusBadge>
            ) : null}
            <span aria-hidden>·</span>
            <span>{event.sectionId ? (event.sectionName ?? '') : t('activities.clubEvents.section.wholeClub')}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={clubEventStatusVariant(event.status)}>
            {t(`activities.clubEvents.status.${planned ? 'planned' : 'cancelled'}`)}
          </StatusBadge>
          {event.publicPath ? (
            <Button asChild variant="outline">
              <Link href={event.publicPath} target="_blank" rel="noopener" data-testid="club-event-public-link">
                {t('activities.clubEvents.actions.publicPage')}
              </Link>
            </Button>
          ) : null}
          {editable ? (
            <Button
              type="button"
              variant="destructive"
              data-testid="club-event-cancel"
              onClick={() => {
                setCancelling(true)
              }}
            >
              {t('activities.clubEvents.actions.cancel')}
            </Button>
          ) : null}
        </div>
      </header>
      {!planned ? (
        <Alert status="error" data-testid="club-event-cancelled">
          <AlertTitle>{t('activities.clubEvents.cancelled.title')}</AlertTitle>
          {event.cancelReason ? (
            <AlertDescription>
              {t('activities.clubEvents.cancelled.reason', { reason: event.cancelReason })}
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}
      <Tabs value={tab} onValueChange={selectTab} variant="underline">
        <div className="overflow-x-auto">
          <TabsList aria-label={t('activities.clubEvents.record.tabs')}>
            <TabsTrigger value="details">{t('activities.clubEvents.record.details')}</TabsTrigger>
            <TabsTrigger value="parts">
              {t('activities.clubEvents.record.parts', { count: event.parts.length })}
            </TabsTrigger>
            <TabsTrigger value="files">
              {t('activities.clubEvents.record.files', { count: event.files?.length ?? 0 })}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="details" className="pt-4">
          {editable ? (
            <ClubEventDetailsForm event={event} onSaved={refetch} />
          ) : (
            <ReadOnlyDetails event={event} t={t} />
          )}
        </TabsContent>
        <TabsContent value="parts" className="pt-4">
          <ClubEventPartsTable event={event} options={manages ? (options.data ?? null) : null} onChanged={refetch} />
        </TabsContent>
        <TabsContent value="files" className="pt-4">
          <ClubEventFilesPanel event={event} editable={editable} onChanged={refetch} />
        </TabsContent>
      </Tabs>
      {editable ? (
        <ClubEventReasonDialog
          open={cancelling}
          onOpenChange={setCancelling}
          title={t('activities.clubEvents.cancel.title', { name: event.name ?? '' })}
          description={t('activities.clubEvents.cancel.text', { count: plannedParts })}
          confirmLabel={t('activities.clubEvents.actions.cancel')}
          testId="club-event-cancel-dialog"
          onConfirm={async (reason) => {
            try {
              const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(event.updatedAt), () =>
                apiCallOrThrow<{ notified?: number }>(
                  `/api/activities/club-events/${encodeURIComponent(event.id)}/cancel`,
                  {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ reason }),
                  },
                  { errorMessage: t('activities.clubEvents.errors.cancel') },
                ),
              )
              flash(t('activities.clubEvents.flash.cancelled', { count: call.result?.notified ?? 0 }), 'success')
            } catch (error: unknown) {
              if (surfaceRecordConflict(error, t, { onRefresh: () => void refetch() })) {
                setCancelling(false)
                return null
              }
              if (errorCodeOf(error) === 'club_event_cancelled') {
                setCancelling(false)
                await refetch()
                return null
              }
              return errorMessage(error, t('activities.clubEvents.errors.cancel'))
            }
            setCancelling(false)
            await refetch()
            return null
          }}
        />
      ) : null}
    </div>
  )
}
