'use client'
// The "Messages" tile of `/club` — Today (foundation III REQ-M10, DD-M13): a link to the inbox with the number of the
// member's conversations that have an unread message; no badge at zero, and no count when it could not be read.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'

const TILE_CLASS =
  'bg-card hover:bg-accent focus-visible:shadow-focus flex h-full min-h-11 flex-col gap-2 rounded-lg border p-4 outline-none'

/** The same key the member thread page invalidates after it marks a thread read. */
const UNREAD_COUNT_QUERY_KEY = ['communication-unread-count'] as const

export default function ClubMessagesTileWidget() {
  const t = useT()
  const query = useQuery({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    queryFn: async () => {
      const call = await apiCall<{ count: number }>('/api/communication/threads/unread-count')
      return call.ok && typeof call.result?.count === 'number' ? call.result.count : null
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
          <Link href="/club/messages" className={TILE_CLASS} data-testid="club-tile-messages">
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
        </li>
      </ul>
    </section>
  )
}
