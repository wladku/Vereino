'use client'
// The "Messages" tile of `/club` — Today (foundation III REQ-M10, DD-M13; README M-02; E06-S16 #98): a link to the
// inbox with the number of the member's conversations that have an unread message; no badge at zero, and when the
// count could not be read the tile says so and offers "Try again" while the link keeps working.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'

const TILE_CLASS = 'bg-card flex h-full flex-col gap-2 rounded-lg border p-4'
const LINK_CLASS =
  'hover:bg-accent focus-visible:shadow-focus -m-2 flex min-h-11 flex-col gap-2 rounded-md p-2 outline-none'

/** The same key the member thread page invalidates after it marks a thread read. */
const UNREAD_COUNT_QUERY_KEY = ['communication-unread-count'] as const

class UnreadCountLoadError extends Error {}

export default function ClubMessagesTileWidget() {
  const t = useT()
  const query = useQuery({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    // One retry: a failed count shows its error and "Try again" within seconds, not after the default three.
    retry: 1,
    queryFn: async () => {
      const call = await apiCall<{ count: number }>('/api/communication/threads/unread-count')
      if (!call.ok || typeof call.result?.count !== 'number') throw new UnreadCountLoadError(String(call.status))
      return call.result.count
    },
  })
  const count = query.data ?? null
  return (
    <section aria-labelledby="club-today-messages" className="flex flex-col gap-3">
      <h2 id="club-today-messages" className="sr-only">
        {t('communication.tile.title')}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <li>
          <div className={TILE_CLASS}>
            <Link href="/club/messages" className={LINK_CLASS} data-testid="club-tile-messages">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t('communication.tile.title')}</span>
                {count && count > 0 ? (
                  <span data-testid="club-tile-messages-unread" data-count={String(count)}>
                    <StatusBadge variant="info">{t('communication.tile.unread', { count: String(count) })}</StatusBadge>
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground max-w-prose text-sm">{t('communication.tile.description')}</span>
            </Link>
            {query.isError && !query.isFetching ? (
              <div className="flex flex-col items-start gap-2" data-testid="club-tile-messages-error">
                <p className="text-sm">{t('communication.tile.error')}</p>
                <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
                  {t('communication.actions.retry')}
                </Button>
              </div>
            ) : null}
          </div>
        </li>
      </ul>
    </section>
  )
}
