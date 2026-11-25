'use client'
// Sharing an outline in the library (training outlines spec J-O06, M-O5, BR-O4, DD-O11; REQ-O11, REQ-O14; E24-S05,
// #685): on the outline page, for whoever may edit it. While the outline stays in the club ("club" is the default of
// every outline, Q-O02) the coach picks "clubs on Vereino" or "public" up to the club's widest level and accepts the
// library terms (CC BY-SA 4.0) at the first publication; a shared outline shows its level, can be published again
// after edits (the snapshot is not live, DD-O11) and withdrawn. The author's name shows only with their name consent.
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusTag } from '@vereino/ui'
import type { PublishVisibility } from '../../lib/library'
import { OUTLINE_QUERY_KEY, errorText, type Outline } from './club-client'
import { libraryEntryHref, publishOptions, publishOutline, withdrawOutline } from './library-client'

export function PublishPanel({ outline }: { outline: Outline }) {
  const t = useT()
  const id = React.useId()
  const client = useQueryClient()
  const options = publishOptions(outline.library.maxVisibility)
  const [visibility, setVisibility] = React.useState<PublishVisibility>(
    outline.publication?.visibility ?? options[0] ?? 'clubs',
  )
  const [terms, setTerms] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  if (!outline.library.enabled) return null
  const refresh = () => client.invalidateQueries({ queryKey: [OUTLINE_QUERY_KEY, outline.id] })
  const run = (action: () => Promise<unknown>, success: string, failure: string) => {
    setBusy(true)
    void action()
      .then(async () => {
        flash(success, 'success')
        await refresh()
      })
      .catch((error: unknown) => {
        flash(errorText(error, failure), 'error')
      })
      .finally(() => {
        setBusy(false)
      })
  }
  const published = outline.publication
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border p-4"
      aria-labelledby={`${id}-title`}
      data-testid="training-publish-panel"
    >
      <h2 id={`${id}-title`} className="font-semibold">
        {t('training.publish.title')}
      </h2>
      {outline.origin ? (
        <p className="text-muted-foreground text-sm" data-testid="training-outline-origin">
          {outline.origin.authorName
            ? t('training.library.credit.adaptedFromAuthor', {
                author: outline.origin.authorName,
                club: outline.origin.clubName,
              })
            : t('training.library.credit.adaptedFromClub', { club: outline.origin.clubName })}
        </p>
      ) : null}
      {published ? (
        <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="training-publish-state">
          <StatusTag status={published.visibility === 'public' ? 'success' : 'info'}>
            {t(`training.library.visibility.${published.visibility}`)}
          </StatusTag>
          <Link href={libraryEntryHref(published.entryId)} className="text-primary underline">
            {t('training.publish.open')}
          </Link>
        </p>
      ) : (
        <p className="text-muted-foreground text-sm" data-testid="training-publish-state">
          {t('training.publish.clubOnly')}
        </p>
      )}
      {options.length === 0 ? (
        <p className="text-muted-foreground text-sm" data-testid="training-publish-club-level">
          {t('training.publish.clubLevel')}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-visibility`}>{t('training.publish.visibility')}</Label>
            <select
              id={`${id}-visibility`}
              className="border-input bg-background focus-visible:ring-ring min-h-11 rounded-md border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
              value={visibility}
              onChange={(event) => {
                setVisibility(event.target.value as PublishVisibility)
              }}
              data-testid="training-publish-visibility"
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {t(`training.library.visibility.${option}`)}
                </option>
              ))}
            </select>
          </div>
          {outline.library.termsAccepted ? null : (
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={terms}
                onChange={(event) => {
                  setTerms(event.target.checked)
                }}
                data-testid="training-publish-terms"
              />
              <span>{t('training.publish.terms')}</span>
            </label>
          )}
          <p className="text-muted-foreground text-xs">{t('training.publish.nameNote')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={busy || (!outline.library.termsAccepted && !terms)}
              onClick={() => {
                run(
                  () =>
                    publishOutline(
                      outline.id,
                      { visibility, ...(outline.library.termsAccepted ? {} : { acceptTerms: true }) },
                      t('training.publish.error'),
                    ),
                  t('training.publish.done'),
                  t('training.publish.error'),
                )
              }}
              data-testid="training-publish-submit"
            >
              {t(published ? 'training.publish.update' : 'training.publish.submit')}
            </Button>
            {published ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={() => {
                  run(
                    () => withdrawOutline(outline.id, t('training.publish.withdrawError')),
                    t('training.publish.withdrawn'),
                    t('training.publish.withdrawError'),
                  )
                }}
                data-testid="training-publish-withdraw"
              >
                {t('training.publish.withdraw')}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}
