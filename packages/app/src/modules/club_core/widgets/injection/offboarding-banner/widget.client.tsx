'use client'
// The banner of `widget.ts`: shown only while `GET /api/club_core/offboarding` answers a recorded notice. It names the
// deletion date, starts the export (`POST /api/club_core/offboarding/export`), follows it while it runs and offers the
// download of the finished archive. Loading and "no notice" render nothing; a failed read shows a retry.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorMessage } from '../../../components/client-helpers'
import type { OffboardingView } from '../../../lib/club-export'

export const OFFBOARDING_API = '/api/club_core/offboarding'
export const OFFBOARDING_EXPORT_API = '/api/club_core/offboarding/export'
const QUERY_KEY = ['club_core-offboarding'] as const
/** How often the banner re-reads the state while an export is being prepared. */
const RUNNING_POLL_MS = 4_000

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value))
}

function formatSize(bytes: number | null, locale: string): string {
  const megabytes = (bytes ?? 0) / (1024 * 1024)
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(megabytes)} MB`
}

export default function OffboardingBanner() {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const [starting, setStarting] = React.useState(false)
  const state = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => readApiResultOrThrow<OffboardingView>(OFFBOARDING_API),
    refetchInterval: (query) => {
      const status = query.state.data?.export?.status
      return status === 'pending' || status === 'running' ? RUNNING_POLL_MS : false
    },
  })

  const start = React.useCallback(async () => {
    setStarting(true)
    try {
      await apiCallOrThrow(
        OFFBOARDING_EXPORT_API,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        { errorMessage: t('club_core.offboarding.banner.startError') },
      )
      flash(t('club_core.offboarding.banner.started'), 'success')
    } catch (error: unknown) {
      flash(errorMessage(error, t('club_core.offboarding.banner.startError')), 'error')
    } finally {
      setStarting(false)
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    }
  }, [queryClient, t])

  if (state.isLoading) return null
  if (state.isError) {
    return (
      <Alert style="light" status="error" className="mb-4" data-testid="club-core-offboarding-banner-error">
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>{t('club_core.offboarding.banner.loadError')}</span>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            onClick={() => void state.refetch()}
          >
            {t('club_core.offboarding.banner.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  const view = state.data
  if (!view?.deleteAfter) return null

  // Compared with the moment the state was read (pure in render), not the clock.
  const due = new Date(view.deleteAfter).getTime() <= state.dataUpdatedAt
  const job = view.export
  const running = job?.status === 'pending' || job?.status === 'running'
  const ready = job?.status === 'completed'
  return (
    <Alert style="light" status="warning" className="mb-4" data-testid="club-core-offboarding-banner">
      <AlertTitle>{t('club_core.offboarding.banner.title')}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p data-testid="club-core-offboarding-banner-date">
          {t(due ? 'club_core.offboarding.banner.due' : 'club_core.offboarding.banner.notice', {
            date: formatDate(view.deleteAfter, locale),
          })}
        </p>
        <p>{t('club_core.offboarding.banner.private')}</p>
        <div role="status" aria-live="polite" data-testid="club-core-offboarding-banner-status">
          {running ? t('club_core.offboarding.banner.running') : null}
          {ready && job?.finishedAt
            ? t('club_core.offboarding.banner.ready', {
                date: formatDate(job.finishedAt, locale),
                size: formatSize(job.bytes, locale),
              })
            : null}
          {job?.status === 'failed' ? t('club_core.offboarding.banner.failed') : null}
        </div>
        {view.exportAvailable ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {ready ? (
              <Button asChild size="sm" className="min-h-11 w-full sm:w-auto">
                <a href={OFFBOARDING_EXPORT_API} download data-testid="club-core-offboarding-download">
                  {t('club_core.offboarding.banner.download')}
                </a>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={ready ? 'outline' : 'default'}
              className="min-h-11 w-full sm:w-auto"
              disabled={starting || running}
              onClick={() => void start()}
              data-testid="club-core-offboarding-export"
            >
              {t(ready ? 'club_core.offboarding.banner.again' : 'club_core.offboarding.banner.start')}
            </Button>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
