'use client'
// `/club/messages/[threadId]` — a member's thread (foundation III REQ-M06, REQ-M10; DD-M12, R15): the messages for
// everyone and the member's own household's replies (never another family's), the reply box (a member's reply reaches
// the staff only), and the read marker moved when the thread is opened, so the inbox dot and the tile count clear. Its
// own 403 ("not yours") and 404 states.
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CLUB_MESSAGES_HREF, scopeLabel } from '../client-helpers'
import { MessageList, ReplyBox } from '../ThreadMessages'
import { postReply, useMarkRead, useThread } from '../ThreadRecord'
import { INBOX_QUERY_KEY } from './ClubMessagesPage'
import { MessagesClubFrame } from './MessagesClubFrame'

export const UNREAD_COUNT_QUERY_KEY = ['communication-unread-count'] as const

function Thread({ id }: { id: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const query = useThread(id)
  const [pending, setPending] = React.useState(false)
  const thread = query.data?.status === 'ok' ? query.data.thread : null
  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['communication-thread', id] })
    void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY })
  }, [queryClient, id])
  useMarkRead(thread, refresh)

  const back = (
    <Link href={CLUB_MESSAGES_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
      {t('communication.club.back')}
    </Link>
  )
  if (!query.data && query.isFetching) return <LoadingMessage label={t('communication.club.loading')} />
  if (!query.data) {
    return (
      <ErrorMessage
        label={t('communication.club.errors.thread')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('communication.actions.retry')}
          </Button>
        }
      />
    )
  }
  if (query.data.status !== 'ok' || !thread) {
    return (
      <>
        {back}
        <p className="text-muted-foreground" data-testid={`club-thread-${query.data.status}`}>
          {query.data.status === 'forbidden' ? t('communication.club.forbidden') : t('communication.club.notFound')}
        </p>
      </>
    )
  }
  return (
    <>
      {back}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold break-words" data-testid="club-thread-subject">
          {thread.subject}
        </h1>
        <p className="text-muted-foreground text-sm">{scopeLabel(t, thread)}</p>
      </header>
      <MessageList messages={thread.messages} />
      <ReplyBox
        pending={pending}
        hint={thread.staff ? null : t('communication.reply.memberHint')}
        onSend={async (body) => {
          setPending(true)
          const sent = await postReply(t, thread.id, body)
          setPending(false)
          if (sent) refresh()
          return sent
        }}
      />
    </>
  )
}

export function ClubThreadPage({ threadId }: { threadId: string }) {
  return <MessagesClubFrame>{() => <Thread id={threadId} />}</MessagesClubFrame>
}
