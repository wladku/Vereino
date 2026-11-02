'use client'
// `/backend/communication/threads/[id]` (foundation III *UI and Interaction Contracts*, the thread detail mock-up;
// REQ-M05, REQ-M06, REQ-M08; J-M01 steps 4–5): the subject, the scope and the author, the messages with their history,
// the reply box, "Copy text for group chat" with an `aria-live` confirmation, and — for the author, the section's
// coordinator and the administrator — the recipients of the first message in `DeliveryStatusList` (P-32) with "not
// delivered" and the "problems only" filter. Its own 403 and 404 states (`OWN_FORBIDDEN_STATE`).
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall, apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { DeliveryStatusList, type DeliveryPage } from '@vereino/ui'
import {
  OWN_FORBIDDEN_STATE,
  errorMessage,
  formatDateTime,
  roleLabel,
  scopeLabel,
  type ThreadDetail,
  type Translate,
} from './client-helpers'
import { MessageList, ReplyBox } from './ThreadMessages'

type ThreadLoad = { status: 'ok'; thread: ThreadDetail } | { status: 'forbidden' } | { status: 'not_found' }

class ThreadLoadError extends Error {}

export function useThread(id: string) {
  return useQuery({
    queryKey: ['communication-thread', id],
    queryFn: async (): Promise<ThreadLoad> => {
      const call = await apiCall<ThreadDetail>(
        `/api/communication/threads/${encodeURIComponent(id)}`,
        OWN_FORBIDDEN_STATE,
      )
      if (call.status === 403) return { status: 'forbidden' }
      if (call.status === 404) return { status: 'not_found' }
      if (!call.ok || !call.result) throw new ThreadLoadError(String(call.status))
      return { status: 'ok', thread: call.result }
    },
  })
}

/** Moves the reader's read marker once per opened thread version. */
export function useMarkRead(thread: ThreadDetail | null, onDone: () => void) {
  const marked = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!thread || !thread.unread) return
    const key = `${thread.id}:${thread.lastMessageAt}`
    if (marked.current === key) return
    marked.current = key
    void apiCall(`/api/communication/threads/${encodeURIComponent(thread.id)}/read`, { method: 'POST' }).then(
      (call) => {
        if (call.ok) onDone()
      },
    )
  }, [thread, onDone])
}

export async function postReply(t: Translate, threadId: string, body: string): Promise<boolean> {
  try {
    await apiCallOrThrow(
      `/api/communication/threads/${encodeURIComponent(threadId)}/replies`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) },
      { errorMessage: t('communication.reply.errors.send') },
    )
    flash(t('communication.reply.flash'), 'success')
    return true
  } catch (error: unknown) {
    flash(errorMessage(error, t('communication.reply.errors.send')), 'error')
    return false
  }
}

function ShareTextPanel({ thread }: { thread: ThreadDetail }) {
  const t = useT()
  const [text, setText] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<'idle' | 'copied' | 'manual' | 'error'>('idle')
  const copy = async () => {
    const params = new URLSearchParams(
      thread.scopeType === 'occurrence' && thread.scopeId ? { occurrenceId: thread.scopeId } : { threadId: thread.id },
    )
    const call = await apiCall<{ text: string }>(`/api/communication/share-text?${params.toString()}`)
    if (!call.ok || !call.result) {
      setStatus('error')
      return
    }
    setText(call.result.text)
    try {
      await navigator.clipboard.writeText(call.result.text)
      setStatus('copied')
    } catch {
      setStatus('manual')
    }
  }
  return (
    <section className="flex flex-col gap-2" aria-labelledby="thread-share-title">
      <h2 id="thread-share-title" className="sr-only">
        {t('communication.share.label')}
      </h2>
      <div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => void copy()}
          data-testid="thread-share"
        >
          {t('communication.share.action')}
        </Button>
      </div>
      {text ? (
        <p className="bg-muted rounded-md p-2 text-sm break-all" data-testid="thread-share-text">
          {text}
        </p>
      ) : null}
      <p aria-live="polite" className="text-muted-foreground text-sm" data-testid="thread-share-status">
        {status === 'copied'
          ? t('communication.share.copied')
          : status === 'manual'
            ? t('communication.share.manual')
            : status === 'error'
              ? t('communication.share.error')
              : ''}
      </p>
    </section>
  )
}

function deliveryLabels(t: Translate) {
  return {
    title: t('communication.deliveries.title'),
    problemsOnly: t('communication.deliveries.problemsOnly'),
    columns: {
      recipient: t('communication.deliveries.columns.recipient'),
      reason: t('communication.deliveries.columns.reason'),
      channel: t('communication.deliveries.columns.channel'),
      status: t('communication.deliveries.columns.status'),
      lastAttempt: t('communication.deliveries.columns.lastAttempt'),
    },
    status: {
      queued: t('communication.deliveries.status.queued'),
      sent: t('communication.deliveries.status.sent'),
      failed: t('communication.deliveries.status.failed'),
      skipped: t('communication.deliveries.status.skipped'),
    },
    channel: {
      in_app: t('communication.deliveries.channel.in_app'),
      email: t('communication.deliveries.channel.email'),
    },
    reason: (reason: string) => t(`communication.deliveries.reason.${reason}`, reason),
    skipReason: (code: string) => t(`communication.deliveries.skip.${code}`, code),
    failureCode: (code: string) => t(`communication.deliveries.failure.${code}`, code),
    unknownRecipient: t('communication.deliveries.unknownRecipient'),
    empty: t('communication.deliveries.empty'),
    emptyProblems: t('communication.deliveries.emptyProblems'),
    loading: t('communication.deliveries.loading'),
    error: t('communication.deliveries.error'),
    retry: t('communication.actions.retry'),
    previous: t('communication.deliveries.previous'),
    next: t('communication.deliveries.next'),
    pageOf: (page: number, total: number) =>
      t('communication.deliveries.pageOf', { page: String(page), total: String(total) }),
    tableLabel: t('communication.deliveries.tableLabel'),
  }
}

function Deliveries({ thread }: { thread: ThreadDetail }) {
  const t = useT()
  const locale = useLocale()
  const labels = React.useMemo(() => deliveryLabels(t), [t])
  const first = thread.messages.find((message) => message.hasDeliveries)
  const load = React.useCallback(
    async (page: number, filter: { problemsOnly: boolean; pageSize?: number }): Promise<DeliveryPage> => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(filter.pageSize ?? 50) })
      if (filter.problemsOnly) params.set('problems', '1')
      if (first) params.set('messageId', first.id)
      const call = await apiCallOrThrow<DeliveryPage>(
        `/api/communication/threads/${encodeURIComponent(thread.id)}/deliveries?${params.toString()}`,
      )
      return call.result as DeliveryPage
    },
    [thread.id, first],
  )
  const formatTime = React.useCallback((iso: string) => formatDateTime(iso, locale), [locale])
  if (!first) return null
  return (
    <section className="flex flex-col gap-3" aria-labelledby="thread-deliveries-title">
      <h2 id="thread-deliveries-title" className="text-lg font-semibold">
        {t('communication.deliveries.title')}
      </h2>
      <DeliveryStatusList load={load} labels={labels} formatTime={formatTime} refreshKey={thread.lastMessageAt} />
    </section>
  )
}

export function ThreadRecord({ id }: { id: string }) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const query = useThread(id)
  const [pending, setPending] = React.useState(false)
  const thread = query.data?.status === 'ok' ? query.data.thread : null
  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['communication-thread', id] })
    void queryClient.invalidateQueries({ queryKey: ['communication-threads'] })
  }, [queryClient, id])
  useMarkRead(thread, refresh)

  if (!query.data && query.isFetching) return <LoadingMessage label={t('communication.club.loading')} />
  if (!query.data) {
    return (
      <ErrorMessage
        label={t('communication.threads.record.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('communication.actions.retry')}
          </Button>
        }
      />
    )
  }
  if (query.data.status === 'forbidden') {
    return (
      <p className="text-muted-foreground" data-testid="thread-forbidden">
        {t('communication.threads.record.forbidden')}
      </p>
    )
  }
  if (query.data.status === 'not_found' || !thread) {
    return (
      <p className="text-muted-foreground" data-testid="thread-not-found">
        {t('communication.threads.record.notFound')}
      </p>
    )
  }
  const first = thread.messages.at(0)
  return (
    <div className="flex flex-col gap-6" data-testid="thread-record">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold break-words" data-testid="thread-subject">
          {thread.subject}
        </h1>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span data-testid="thread-scope">{scopeLabel(t, thread)}</span>
          <span>·</span>
          <span>
            {thread.authorName && first
              ? t('communication.threads.record.postedBy', {
                  name: thread.authorName,
                  role: roleLabel(t, first.actingRole),
                })
              : t('communication.threads.record.systemThread')}
          </span>
          {first ? (
            <>
              <span>·</span>
              <span data-testid="thread-recipient-count">
                {t('communication.threads.record.recipients', { count: String(first.recipientCount) })}
              </span>
            </>
          ) : null}
          <span>·</span>
          <span>{formatDateTime(thread.createdAt, locale)}</span>
          {thread.unread ? <StatusBadge variant="info">{t('communication.threads.unread')}</StatusBadge> : null}
        </p>
      </header>
      {thread.staff ? <ShareTextPanel thread={thread} /> : null}
      <section className="flex flex-col gap-3" aria-labelledby="thread-messages-title">
        <h2 id="thread-messages-title" className="text-lg font-semibold">
          {t('communication.threads.record.messagesTitle')}
        </h2>
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
      </section>
      {thread.canSeeDeliveries ? <Deliveries thread={thread} /> : null}
    </div>
  )
}
