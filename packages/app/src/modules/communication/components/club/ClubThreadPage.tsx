'use client'
// `/club/messages/[threadId]` — a member's thread (foundation III REQ-M06, REQ-M10; DD-M12, R15): the messages for
// everyone and the member's own household's replies (never another family's), the reply box (a member's reply reaches
// the staff only), and the read marker moved when the thread is opened, so the inbox dot and the tile count clear. Its
// own 403 ("not yours") and 404 states. README M-07 (E06-S20): the "Case" mark and its read-only banner, "Copy text for
// group chat" for the thread's staff (its author, the scope's coaches, the section's coordinator), and under the
// reader's own messages "E-mail: {n} delivered · {m} not delivered". The section coordinator's phone actions (groups
// and activities parity spec REQ-A12, D-031 §3, Q-A26; #274), behind `communication.cases.manage` and the thread's own
// flags: "Mark as case" (confirmed, it cannot be undone) and "Delete" under each message they may delete while the
// thread is not a case — the message then reads "deleted". A refusal (409 `case_immutable` when the thread became a
// case meanwhile) is shown in the page as text.
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import { emailDeliverySummary } from '../../lib/member-inbox'
import { CLUB_MESSAGES_HREF, scopeLabel, type ThreadMessageItem, type Translate } from '../client-helpers'
import { MessageList, ReplyBox } from '../ThreadMessages'
import {
  CaseBanner,
  ShareTextPanel,
  postReply,
  useDeleteMessage,
  useMarkCase,
  useMarkRead,
  useThread,
} from '../ThreadRecord'
import { useHasFeature } from '../useCanPost'
import { INBOX_QUERY_KEY } from './ClubMessagesPage'
import { MessagesClubFrame } from './MessagesClubFrame'

export const UNREAD_COUNT_QUERY_KEY = ['communication-unread-count'] as const

/** "E-mail: 3 delivered · 1 not delivered" under the reader's own message; nothing without e-mail deliveries. */
function emailLine(t: Translate, message: ThreadMessageItem): React.ReactNode {
  const summary = emailDeliverySummary(message.emailCounts)
  if (!summary) return null
  const parts = [
    t('communication.club.email.delivered', { count: String(summary.delivered) }),
    t('communication.club.email.notDelivered', { count: String(summary.notDelivered) }),
    ...(summary.pending > 0 ? [t('communication.club.email.pending', { count: String(summary.pending) })] : []),
  ]
  return (
    <p
      className="text-muted-foreground border-t pt-2 text-sm"
      data-testid="club-message-email"
      data-delivered={summary.delivered}
      data-not-delivered={summary.notDelivered}
      data-pending={summary.pending}
    >
      {t('communication.club.email.label', { summary: parts.join(' · ') })}
    </p>
  )
}

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
  const canManageCases = useHasFeature('communication.cases.manage')
  const { markCase, marking, ConfirmDialogElement } = useMarkCase(thread, refresh)
  const [refusal, setRefusal] = React.useState<string | null>(null)
  const subjectRef = React.useRef<HTMLHeadingElement>(null)
  // The deleted message loses its button, so the focus moves to the subject instead of the page start.
  const focusSubject = React.useCallback(() => {
    subjectRef.current?.focus()
  }, [])
  const deletion = useDeleteMessage(thread, refresh, focusSubject, setRefusal)

  const back = (
    <Link href={CLUB_MESSAGES_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
      {t('communication.club.back')}
    </Link>
  )
  if (!query.data && query.isFetching) return <MemberSkeleton shape="rows" label={t('communication.club.loading')} />
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
  const footer = (message: ThreadMessageItem) => {
    const email = emailLine(t, message)
    const deletable = canManageCases && message.canDelete && !thread.isCase
    if (!deletable) return email
    return (
      <>
        {email}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={deletion.deleting !== null}
            onClick={() => {
              setRefusal(null)
              void deletion.deleteMessage(message)
            }}
            data-testid="club-message-delete"
          >
            {t('communication.message.actions.delete')}
          </Button>
        </div>
      </>
    )
  }
  return (
    <>
      {back}
      <header className="flex flex-col gap-1">
        <h1
          ref={subjectRef}
          tabIndex={-1}
          className="text-2xl font-semibold break-words outline-none"
          data-testid="club-thread-subject"
        >
          {thread.subject}
        </h1>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <span data-testid="club-thread-scope">{scopeLabel(t, thread)}</span>
          {thread.isCase ? (
            <span data-testid="club-thread-case">
              <StatusBadge variant="warning">{t('communication.cases.badge')}</StatusBadge>
            </span>
          ) : null}
        </div>
      </header>
      {canManageCases && thread.canMarkCase ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={marking}
            onClick={() => void markCase()}
            data-testid="club-thread-mark-case"
          >
            {t('communication.cases.actions.mark')}
          </Button>
        </div>
      ) : null}
      {refusal ? (
        <Alert status="error" data-testid="club-thread-refusal">
          <AlertDescription>{refusal}</AlertDescription>
        </Alert>
      ) : null}
      {thread.isCase ? <CaseBanner thread={thread} /> : null}
      {thread.staff ? <ShareTextPanel thread={thread} /> : null}
      <MessageList messages={thread.messages} renderFooter={footer} />
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
      {ConfirmDialogElement}
      {deletion.ConfirmDialogElement}
    </>
  )
}

export function ClubThreadPage({ threadId }: { threadId: string }) {
  return <MessagesClubFrame>{() => <Thread id={threadId} />}</MessagesClubFrame>
}
