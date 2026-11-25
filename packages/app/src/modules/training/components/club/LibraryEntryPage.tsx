'use client'
// `/club/training/library/[entryId]` — one shared outline (training outlines spec M-O8, J-O03, J-O06; REQ-O12, REQ-O15;
// E24-S05, #685): the read view with its credit and licence, "Copy to my club" (from a session's card, the copy goes
// straight into that session), the 1–5 rating (enabled once the coach closed a session that used it, BR-O6) and
// "Report". States: loading, error with retry, not found (hidden, removed or unknown), library off.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton, Notice } from '@vereino/ui'
import { STARS } from '../../lib/library'
import { LibraryEntryView } from '../LibraryEntryView'
import { ReportForm } from '../ReportForm'
import { TrainingClubFrame } from './TrainingClubFrame'
import { attachOutline, errorText, outlineHref, sessionHref } from './club-client'
import {
  LIBRARY_ENTRY_QUERY_KEY,
  copyEntry,
  libraryHref,
  publicEntryHref,
  rateEntry,
  useLibraryEntry,
  type LibraryEntry,
} from './library-client'

function Stars({ entry }: { entry: LibraryEntry }) {
  const t = useT()
  const client = useQueryClient()
  const [busy, setBusy] = React.useState(false)
  const used = entry.mine?.used === true
  const current = entry.mine?.stars ?? null
  const values = Array.from({ length: STARS.max - STARS.min + 1 }, (_, index) => STARS.min + index)
  return (
    <div className="flex flex-col gap-2" data-testid="training-library-stars">
      <span className="text-sm font-semibold" id="training-library-stars-label">
        {t('training.library.rating.yours')}
      </span>
      <div role="group" aria-labelledby="training-library-stars-label" className="flex flex-wrap gap-2">
        {values.map((stars) => (
          <Button
            key={stars}
            type="button"
            className="min-h-11 min-w-11"
            variant={current !== null && stars <= current ? 'default' : 'outline'}
            aria-pressed={current === stars}
            aria-label={t('training.library.rating.give', { stars })}
            disabled={!used || busy}
            onClick={() => {
              setBusy(true)
              void rateEntry(entry.id, stars, t('training.library.rating.error'))
                .then(() => {
                  flash(t('training.library.rating.saved'), 'success')
                  return client.invalidateQueries({ queryKey: [LIBRARY_ENTRY_QUERY_KEY, entry.id] })
                })
                .catch((error: unknown) => {
                  flash(errorText(error, t('training.library.rating.error')), 'error')
                })
                .finally(() => {
                  setBusy(false)
                })
            }}
            data-testid={`training-library-star-${String(stars)}`}
          >
            {'★'.repeat(stars)}
          </Button>
        ))}
      </div>
      {used ? null : (
        <p className="text-muted-foreground text-sm" data-testid="training-library-rate-after-use">
          {t('training.library.rating.afterUse')}
        </p>
      )}
    </div>
  )
}

function Entry({ entryId }: { entryId: string }) {
  const t = useT()
  const router = useRouter()
  const occurrenceId = useSearchParams().get('occurrenceId') ?? undefined
  const query = useLibraryEntry(entryId)
  const [copying, setCopying] = React.useState(false)

  if (!query.data && query.isFetching) return <MemberSkeleton shape="rows" label={t('training.library.loading')} />
  if (!query.data) {
    return (
      <ErrorMessage
        label={t('training.library.errors.loadEntry')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('training.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  if (query.data.status === 'off')
    return <Notice data-testid="training-library-off">{t('training.library.off')}</Notice>
  if (query.data.status === 'not_found') {
    return <Notice data-testid="training-library-missing">{t('training.library.notFound')}</Notice>
  }
  const entry = query.data.entry
  const copy = () => {
    setCopying(true)
    void copyEntry(entry.id, t('training.library.copy.error'))
      .then(async ({ id }) => {
        if (occurrenceId) {
          await attachOutline(id, { occurrenceId }, t('training.widget.errors.attach'))
          flash(t('training.library.copy.attached'), 'success')
          router.push(sessionHref(occurrenceId))
          return
        }
        flash(t('training.library.copy.done'), 'success')
        router.push(outlineHref(id))
      })
      .catch((error: unknown) => {
        flash(errorText(error, t('training.library.copy.error')), 'error')
      })
      .finally(() => {
        setCopying(false)
      })
  }
  return (
    <>
      <h1 className="text-xl font-semibold" data-testid="training-library-title">
        {entry.topic}
      </h1>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11"
          disabled={copying}
          onClick={copy}
          data-testid="training-library-copy"
        >
          {t(occurrenceId ? 'training.library.copy.toSession' : 'training.library.copy.action')}
        </Button>
        {entry.visibility === 'public' ? (
          <Button asChild variant="outline" className="min-h-11">
            <Link href={publicEntryHref(entry.id)} data-testid="training-library-public-link">
              {t('training.library.publicPage')}
            </Link>
          </Button>
        ) : null}
      </div>
      <LibraryEntryView entry={entry} />
      {entry.mine ? <Stars entry={entry} /> : null}
      {entry.ownClub ? null : <ReportForm entryId={entry.id} alreadyReported={entry.mine?.reported === true} />}
    </>
  )
}

export function LibraryEntryPage({ entryId }: { entryId: string }) {
  const t = useT()
  const occurrenceId = useSearchParams().get('occurrenceId') ?? undefined
  return (
    <TrainingClubFrame>
      {() => (
        <section className="flex flex-col gap-4" aria-label={t('training.library.entryTitle')}>
          <Link
            href={libraryHref({ occurrenceId })}
            className="text-primary inline-flex min-h-11 items-center text-sm underline"
          >
            {t('training.library.back')}
          </Link>
          <Entry entryId={entryId} />
        </section>
      )}
    </TrainingClubFrame>
  )
}
