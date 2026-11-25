'use client'
// `/library/o/[entryId]` — a training outline shared with the public (training outlines spec P-O1, REQ-O13, REQ-O15;
// #685): the read view with the credit and the licence notice, and "Report" (rate-limited); no rating. Without a
// session. States: loading (when the server could not read it), not found, error with retry.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { LibraryEntry } from './club/library-client'
import { LibraryEntryView } from './LibraryEntryView'
import type { PublicEntryLoad } from './public-library-server'
import { ReportForm } from './ReportForm'

export function PublicLibraryEntry({ entryId, initial }: { entryId: string; initial?: PublicEntryLoad }) {
  const t = useT()
  const query = useQuery({
    queryKey: ['training-public-library-entry', entryId],
    initialData: initial,
    queryFn: async (): Promise<PublicEntryLoad> => {
      const call = await apiCall<LibraryEntry>(`/api/training/public/library/${encodeURIComponent(entryId)}`)
      if (call.status === 404) return { status: 'not_found' }
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return { status: 'ok', entry: call.result }
    },
  })
  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <p className="text-muted-foreground">{t('training.public.loading')}</p>
  } else if (!query.data) {
    body = (
      <div className="flex flex-col gap-3">
        <p>{t('training.public.error')}</p>
        <div>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('training.club.actions.retry')}
          </Button>
        </div>
      </div>
    )
  } else if (query.data.status === 'not_found') {
    body = (
      <p className="text-muted-foreground" data-testid="training-public-missing">
        {t('training.public.notFound')}
      </p>
    )
  } else {
    const entry = query.data.entry
    body = (
      <>
        <h1 className="text-2xl font-semibold" data-testid="training-public-title">
          {entry.topic}
        </h1>
        <LibraryEntryView entry={entry} />
        <ReportForm entryId={entry.id} isPublic />
      </>
    )
  }
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6" data-testid="training-public-entry">
      <p className="text-muted-foreground text-sm">{t('training.public.kicker')}</p>
      {body}
    </main>
  )
}
