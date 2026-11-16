'use client'
// The "Messages" tile of `/club` — Today (foundation III REQ-M10, DD-M13; README M-02; E06-S16 #98; navigation spec
// REQ-N14, #263): the heading with an "All" link to the inbox, then the number of the member's conversations that have
// an unread message and the subject of the newest one as a link to it (`GET /api/communication/threads?as=member&
// unread=1&pageSize=1`, newest activity first), or "No new messages."; when the list could not be read the tile says so
// and offers "Try again" while the "All" link keeps working.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  CLUB_MESSAGES_HREF,
  clubThreadHref,
  type ThreadList,
  type ThreadListItem,
} from '../../../components/client-helpers'

const TILE_CLASS = 'bg-card flex h-full flex-col gap-3 rounded-lg border p-4'
const LINK_CLASS = 'inline-flex min-h-11 items-center underline underline-offset-4'

/** The same key the member thread page invalidates after it marks a thread read. */
const UNREAD_COUNT_QUERY_KEY = ['communication-unread-count'] as const

const UNREAD_URL = '/api/communication/threads?as=member&unread=1&pageSize=1'

class UnreadLoadError extends Error {}

type Unread = { count: number; newest: ThreadListItem | null }

export default function ClubMessagesTileWidget() {
  const t = useT()
  const query = useQuery({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    // One retry: a failed read shows its error and "Try again" within seconds, not after the default three.
    retry: 1,
    queryFn: async (): Promise<Unread> => {
      const call = await apiCall<ThreadList>(UNREAD_URL)
      if (!call.ok || typeof call.result?.total !== 'number') throw new UnreadLoadError(String(call.status))
      return { count: call.result.total, newest: call.result.items[0] ?? null }
    },
  })
  const unread = query.data ?? null
  return (
    <section aria-labelledby="club-today-messages" className="flex flex-col gap-3">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <li>
          <div className={TILE_CLASS}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="club-today-messages" className="font-semibold">
                {t('communication.tile.title')}
              </h2>
              <Link href={CLUB_MESSAGES_HREF} className={`${LINK_CLASS} text-sm`} data-testid="club-tile-messages">
                {t('communication.tile.all')}
                <span className="sr-only"> ({t('communication.tile.open')})</span>
              </Link>
            </div>
            {unread && unread.count > 0 ? (
              <div className="flex flex-col gap-1">
                <span data-testid="club-tile-messages-unread" data-count={String(unread.count)}>
                  <StatusBadge variant="info">
                    {t('communication.tile.unread', { count: String(unread.count) })}
                  </StatusBadge>
                </span>
                {unread.newest ? (
                  <Link
                    href={clubThreadHref(unread.newest.id)}
                    className={`${LINK_CLASS} font-medium break-words`}
                    data-testid="club-tile-messages-newest"
                  >
                    {unread.newest.subject}
                  </Link>
                ) : null}
              </div>
            ) : null}
            {unread && unread.count === 0 ? (
              <p className="text-muted-foreground text-sm" data-testid="club-tile-messages-none">
                {t('communication.tile.noNew')}
              </p>
            ) : null}
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
