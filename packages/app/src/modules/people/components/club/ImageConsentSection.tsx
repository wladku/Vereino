'use client'
// The image consent row of the ward page and of M-10 (event photos spec REQ-I06, REQ-I07, J-I01, J-I04; #871): the
// shared `ConsentToggle` with the state line, the effect line ("photos showing {name} on the club's event pages are public
// only while this consent is given"), the count of public photos with links (none before phase 2), the wording and the
// history disclosures. Giving saves at once; withdrawing asks first ("the photos disappear within a minute; copies saved
// by others cannot be taken back"). A guardian saves on their own guardianship (`POST …/guardianships/{id}/consents`),
// an adult on `PUT /api/people/me/consents`, both with the lock token; a 409 shows the platform conflict bar.
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { ConsentToggle, StatusTag, changeConsent } from '@vereino/ui'
import { EarlierWording, useConsentLabel, useConsentStatus } from './ConsentList'
import { MEMBER_PROFILE_QUERY_KEY, formatInstant, type ConsentTexts, type WardConsent } from './member-client'

/** Where the image consent of this row is saved: the guardian's own guardianship, or the adult's own consents. */
export type ImageConsentTarget =
  | { kind: 'guardianship'; guardianshipId: string; lockToken: string | null }
  | { kind: 'own'; lockToken: string | null }

type HistoryItem = {
  granted: boolean
  at: string
  byName: string | null
  byRole: 'guardian' | 'self' | 'club_admin' | 'system'
  currentWording: boolean
}

type HistoryResponse = {
  items: HistoryItem[]
  earlier: { granted: boolean; at: string }[]
  publicPhotos: { count: number; events: { name: string; url: string }[] }
}

export function imageHistoryApi(personId: string): string {
  return `/api/people/me/consents/${encodeURIComponent(personId)}/image-history`
}

function imageHistoryKey(personId: string) {
  return ['people-image-history', personId] as const
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function save(target: ImageConsentTarget, granted: boolean, errorMessage: string): Promise<unknown> {
  const request =
    target.kind === 'guardianship'
      ? {
          url: `/api/people/guardianships/${encodeURIComponent(target.guardianshipId)}/consents`,
          method: 'POST',
          body: { consents: { image: granted } },
        }
      : { url: '/api/people/me/consents', method: 'PUT', body: { changes: { image: granted } } }
  return withScopedApiRequestHeaders(buildOptimisticLockHeader(target.lockToken), () =>
    apiCallOrThrow(
      request.url,
      { method: request.method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(request.body) },
      { errorMessage },
    ),
  )
}

function HistoryLine({ item, timeZone }: { item: HistoryItem; timeZone: string }) {
  const t = useT()
  const locale = useLocale()
  const date = formatInstant(item.at, locale, timeZone) ?? item.at
  const who = item.byName ?? t(`people.consents.image.history.by.${item.byRole}`)
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="club-image-history-item">
      <StatusTag status={item.granted ? 'success' : 'neutral'}>
        {t(item.granted ? 'people.consents.image.history.given' : 'people.consents.image.history.withdrawn')}
      </StatusTag>
      <span>{who}</span>
      <span className="text-muted-foreground">{date}</span>
      <span className="text-muted-foreground">
        {t(
          item.currentWording
            ? 'people.consents.image.history.currentWording'
            : 'people.consents.image.history.earlierWording',
        )}
      </span>
    </li>
  )
}

export function ImageConsentSection({
  personId,
  name,
  consent,
  target,
  timeZone,
  texts,
}: {
  personId: string
  /** The first name the effect line and the switch's accessible name use. */
  name: string
  consent: WardConsent
  target: ImageConsentTarget
  timeZone: string
  texts?: ConsentTexts
}) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const status = useConsentStatus(timeZone)
  const label = useConsentLabel(texts)
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const history = useQuery({
    queryKey: imageHistoryKey(personId),
    queryFn: async (): Promise<HistoryResponse> => {
      const call = await apiCall<HistoryResponse>(imageHistoryApi(personId))
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result
    },
  })
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: MEMBER_PROFILE_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: imageHistoryKey(personId) }),
    ])
  }
  const saveError = t('people.consents.image.errors.save')

  const onChange = async (next: boolean) => {
    setError(null)
    setSaving(true)
    const outcome = await changeConsent({
      next,
      confirmWithdrawal: () =>
        confirm({
          title: t('people.consents.image.confirm.title', { name }),
          text: t('people.consents.image.confirm.text'),
          confirmText: t('people.consents.image.confirm.withdraw'),
          cancelText: t('people.consents.image.confirm.keep'),
          variant: 'destructive',
        }),
      save: async (granted) => {
        await save(target, granted, saveError)
      },
    })
    setSaving(false)
    if (outcome.status === 'saved') {
      flash(t(next ? 'people.consents.image.flash.given' : 'people.consents.image.flash.withdrawn'), 'success')
    } else if (outcome.status === 'failed') {
      if (!surfaceRecordConflict(outcome.error, t, { onRefresh: () => void refresh() })) {
        setError(errorText(outcome.error, saveError))
      }
    }
    await refresh()
  }

  const photos = history.data?.publicPhotos
  const wording = texts?.image?.text ?? t('people.consents.image.wording', { name })
  const items = history.data?.items ?? []
  const earlier = history.data?.earlier ?? []
  return (
    <section
      aria-labelledby={`club-image-consent-${personId}`}
      className="flex flex-col gap-2"
      data-testid="club-image-consent"
    >
      <h3 id={`club-image-consent-${personId}`} className="sr-only">
        {t('people.consents.image.heading', { name })}
      </h3>
      <ConsentToggle
        id={`club-image-consent-${personId}-switch`}
        testId={target.kind === 'own' ? 'club-own-consent-image' : 'club-ward-consent-image'}
        label={label('image', 'people.guardianships.consents.image')}
        status={consent.at ? status(consent) : t('people.club.ward.consents.notGiven')}
        badge={<EarlierWording consent={consent} textKey="image" texts={texts} />}
        checked={consent.granted}
        saving={saving}
        savingLabel={t('people.consents.image.saving')}
        error={error}
        onChange={(next) => void onChange(next)}
      >
        <p className="text-muted-foreground max-w-prose text-xs" data-testid="club-consent-effect-image">
          {t('people.consents.image.effect', { name })}{' '}
          <span data-testid="club-image-public-photos">
            {t('people.consents.image.publicPhotos', { count: String(photos?.count ?? 0) })}
          </span>
        </p>
        {photos && photos.events.length > 0 ? (
          <ul className="flex flex-col gap-1 text-xs">
            {photos.events.map((event) => (
              <li key={event.url}>
                <Link href={event.url} className="text-primary inline-flex min-h-11 items-center underline">
                  {event.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </ConsentToggle>
      <details className="text-sm" data-testid="club-image-wording">
        <summary className="text-primary min-h-11 cursor-pointer py-3 underline">
          {t('people.consents.image.wordingToggle')}
        </summary>
        <p className="max-w-prose text-xs whitespace-pre-line">{wording}</p>
      </details>
      <details className="text-sm" data-testid="club-image-history">
        <summary className="text-primary min-h-11 cursor-pointer py-3 underline">
          {t('people.consents.image.historyToggle')}
        </summary>
        {history.isLoading ? (
          <p className="text-muted-foreground text-xs">{t('people.consents.image.history.loading')}</p>
        ) : history.isError ? (
          <div className="flex flex-wrap items-center gap-2 text-xs" role="alert">
            <span>{t('people.consents.image.history.error')}</span>
            <Button type="button" variant="link" className="min-h-11" onClick={() => void history.refetch()}>
              {t('people.consents.image.history.retry')}
            </Button>
          </div>
        ) : items.length === 0 && earlier.length === 0 ? (
          <p className="text-muted-foreground text-xs" data-testid="club-image-history-empty">
            {t('people.consents.image.history.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <HistoryLine key={`${item.at}:${item.byRole}`} item={item} timeZone={timeZone} />
            ))}
            {earlier.map((entry) => (
              <li key={entry.at} className="text-muted-foreground text-xs" data-testid="club-image-history-earlier">
                {t('people.consents.image.history.beforeHistory', {
                  date: formatInstant(entry.at, locale, timeZone) ?? entry.at,
                })}
              </li>
            ))}
          </ul>
        )}
      </details>
      {ConfirmDialogElement}
    </section>
  )
}
