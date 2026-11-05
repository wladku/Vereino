'use client'
// `/club/messages` — the member inbox (foundation III REQ-M10, *UI and Interaction Contracts*; club spec UI row
// `/club/messages`): the member's own threads (`as=member`), newest activity first, each with its scope, the time of
// the newest message they may see and an unread marker. States: loading, error with retry, empty. Phone-first. "Write
// to the coach" opens `/club/messages/new` when the household has a group with staff today (REQ-M12, DD-M18).
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { CLUB_MESSAGE_NEW_HREF, clubThreadHref, formatDateTime, scopeLabel, type ThreadList } from '../client-helpers'
import { MessagesClubFrame } from './MessagesClubFrame'
import { hasStaff, useDirectOptions } from './useDirectOptions'

class InboxLoadError extends Error {}

export const INBOX_QUERY_KEY = ['communication-inbox'] as const

function useInbox() {
  return useQuery({
    queryKey: INBOX_QUERY_KEY,
    queryFn: async () => {
      const call = await apiCall<ThreadList>('/api/communication/threads?as=member&pageSize=100')
      if (!call.ok || !call.result) throw new InboxLoadError(String(call.status))
      return call.result
    },
  })
}

/** "Write to the coach", offered only when a household member takes part in a group with staff today. */
function WriteAction() {
  const t = useT()
  const options = useDirectOptions()
  if (!options.data?.some(hasStaff)) return null
  return (
    <Button asChild className="min-h-11 self-start">
      <Link href={CLUB_MESSAGE_NEW_HREF} data-testid="club-messages-write">
        {t('communication.direct.action')}
      </Link>
    </Button>
  )
}

function Inbox() {
  const t = useT()
  const locale = useLocale()
  const query = useInbox()
  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <LoadingMessage label={t('communication.club.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('communication.club.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('communication.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.items.length === 0) {
    body = (
      <p className="text-muted-foreground" data-testid="club-messages-empty">
        {t('communication.club.empty')}
      </p>
    )
  } else {
    body = (
      <ul className="flex flex-col gap-2" data-testid="club-messages">
        {query.data.items.map((thread) => (
          <li key={thread.id}>
            <Link
              href={clubThreadHref(thread.id)}
              className="bg-card hover:bg-accent focus-visible:shadow-focus flex min-h-11 flex-col gap-1 rounded-lg border p-3 outline-none"
              data-testid="club-thread"
              data-unread={thread.unread ? 'true' : 'false'}
            >
              <span className="flex flex-wrap items-center gap-2">
                {thread.unread ? (
                  <span data-testid="club-thread-unread">
                    <StatusBadge variant="info">{t('communication.club.unread')}</StatusBadge>
                  </span>
                ) : null}
                <span className={thread.unread ? 'font-semibold break-words' : 'break-words'}>{thread.subject}</span>
              </span>
              <span className="text-muted-foreground text-sm">
                {scopeLabel(t, thread)} · {formatDateTime(thread.lastMessageAt, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">{t('communication.club.title')}</h1>
        <WriteAction />
      </div>
      {body}
    </>
  )
}

export function ClubMessagesPage() {
  return <MessagesClubFrame>{() => <Inbox />}</MessagesClubFrame>
}
