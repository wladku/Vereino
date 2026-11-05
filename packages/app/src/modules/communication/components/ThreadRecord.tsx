'use client'
// `/backend/communication/threads/[id]` (B-19; foundation III *UI and Interaction Contracts*, the thread detail
// mock-up; REQ-M05, REQ-M06, REQ-M08; J-M01 steps 4–5): the subject, the scope and the author, the messages with their
// history, the reply box, "Copy text for group chat" with an `aria-live` confirmation, and — for the author, the
// section's coordinator and the administrator — under every message its delivery counts by status and, on request,
// its recipients in `DeliveryStatusList` (P-32) with "not delivered" and the "problems only" filter (the first
// message's list open, #103). Its own 403 and 404 states (`OWN_FORBIDDEN_STATE`). Cases (REQ-M09, #36): "Mark as case"
// for the section's coordinator and the administrator, behind a confirmation because it cannot be undone, sent with
// the thread's version (409 conflicts surfaced with a refresh); a case shows a read-only banner with who marked it and
// when. "Delete message" (DD-M10, #103) on each message the reader may delete — its author, the section's coordinator,
// the administrator — while the thread is not a case, behind a confirmation and with the thread's version; the message
// then reads "deleted" and the history keeps it.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { DeliveryStatusList, type DeliveryPage } from '@vereino/ui'
import {
  OWN_FORBIDDEN_STATE,
  errorMessage,
  formatDateTime,
  roleLabel,
  scopeLabel,
  type DeliveryCounts,
  type ThreadDetail,
  type ThreadMessageItem,
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

/** "Copy text for group chat" (DD-M14): the text with the link to the clipboard, shown, and confirmed live. */
export function ShareTextPanel({ thread }: { thread: ThreadDetail }) {
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

/** The read-only banner of a case: who marked it and when; its messages can no longer be edited or deleted. */
export function CaseBanner({ thread }: { thread: ThreadDetail }) {
  const t = useT()
  const locale = useLocale()
  const opened = thread.caseOpenedAt ? formatDateTime(thread.caseOpenedAt, locale) : ''
  return (
    <Alert status="information" data-testid="thread-case-banner">
      <AlertTitle>{t('communication.cases.banner.title')}</AlertTitle>
      <AlertDescription>
        <p>{t('communication.cases.banner.text')}</p>
        <p data-testid="thread-case-opened">
          {thread.caseOpenedByName
            ? t('communication.cases.banner.openedBy', { name: thread.caseOpenedByName, date: opened })
            : t('communication.cases.banner.opened', { date: opened })}
        </p>
      </AlertDescription>
    </Alert>
  )
}

/** "Mark as case": confirmed first (it cannot be undone), then sent with the thread's version. */
function useMarkCase(thread: ThreadDetail | null, refresh: () => void) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [marking, setMarking] = React.useState(false)
  const markCase = React.useCallback(async () => {
    if (!thread) return
    const confirmed = await confirm({
      title: t('communication.cases.confirm.title'),
      text: t('communication.cases.confirm.text'),
      confirmText: t('communication.cases.actions.mark'),
      cancelText: t('communication.cases.confirm.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    setMarking(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(thread.updatedAt), () =>
        apiCallOrThrow(
          `/api/communication/threads/${encodeURIComponent(thread.id)}/case`,
          { method: 'POST' },
          { errorMessage: t('communication.cases.errors.mark') },
        ),
      )
      flash(t('communication.cases.flash.marked'), 'success')
      refresh()
    } catch (error: unknown) {
      if (errorCodeOf(error) === 'case_already_open') {
        flash(errorMessage(error, t('communication.errors.case_already_open')), 'error')
        refresh()
      } else if (!surfaceRecordConflict(error, t, { onRefresh: refresh })) {
        flash(errorMessage(error, t('communication.cases.errors.mark')), 'error')
      }
    } finally {
      setMarking(false)
    }
  }, [thread, confirm, t, refresh])
  return { markCase, marking, ConfirmDialogElement }
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

const NO_DELIVERIES: DeliveryCounts = { queued: 0, sent: 0, failed: 0, skipped: 0 }

/** The delivery counts of one message by status: always the sent ones, the others when there are any. */
function DeliveryCountsLine({ counts }: { counts: DeliveryCounts }) {
  const t = useT()
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-sm"
      data-testid="thread-message-deliveries"
      data-sent={counts.sent}
      data-failed={counts.failed}
      data-skipped={counts.skipped}
      data-queued={counts.queued}
    >
      <span className="sr-only">{t('communication.deliveries.summary.label')}:</span>
      <StatusBadge variant="success">
        {t('communication.deliveries.summary.sent', { count: String(counts.sent) })}
      </StatusBadge>
      {counts.failed > 0 ? (
        <StatusBadge variant="error">
          {t('communication.deliveries.summary.failed', { count: String(counts.failed) })}
        </StatusBadge>
      ) : null}
      {counts.skipped > 0 ? (
        <StatusBadge variant="neutral" appearance="stroke">
          {t('communication.deliveries.summary.skipped', { count: String(counts.skipped) })}
        </StatusBadge>
      ) : null}
      {counts.queued > 0 ? (
        <StatusBadge variant="neutral">
          {t('communication.deliveries.summary.queued', { count: String(counts.queued) })}
        </StatusBadge>
      ) : null}
    </div>
  )
}

/** One message's delivery counts and, behind a toggle, its recipients (`DeliveryStatusList` for that message). */
function MessageDeliveries({
  thread,
  message,
  initiallyOpen,
}: {
  thread: ThreadDetail
  message: ThreadMessageItem
  initiallyOpen: boolean
}) {
  const t = useT()
  const locale = useLocale()
  const listId = React.useId()
  const [open, setOpen] = React.useState(initiallyOpen)
  const labels = React.useMemo(() => deliveryLabels(t), [t])
  const load = React.useCallback(
    async (page: number, filter: { problemsOnly: boolean; pageSize?: number }): Promise<DeliveryPage> => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(filter.pageSize ?? 50),
        messageId: message.id,
      })
      if (filter.problemsOnly) params.set('problems', '1')
      const call = await apiCallOrThrow<DeliveryPage>(
        `/api/communication/threads/${encodeURIComponent(thread.id)}/deliveries?${params.toString()}`,
      )
      return call.result as DeliveryPage
    },
    [thread.id, message.id],
  )
  const formatTime = React.useCallback((iso: string) => formatDateTime(iso, locale), [locale])
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DeliveryCountsLine counts={message.deliveryCounts ?? NO_DELIVERIES} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            setOpen((value) => !value)
          }}
          data-testid="thread-message-deliveries-toggle"
        >
          {open ? t('communication.deliveries.hide') : t('communication.deliveries.show')}
        </Button>
      </div>
      <div id={listId} hidden={!open} className="min-w-0">
        {open ? (
          <DeliveryStatusList load={load} labels={labels} formatTime={formatTime} refreshKey={thread.lastMessageAt} />
        ) : null}
      </div>
    </div>
  )
}

/**
 * "Delete message": confirmed first, then sent with the thread's version (S5.2). A refusal on the way — 409
 * `case_immutable` (the thread was marked as a case meanwhile), an already deleted or a system message — refreshes the
 * page with the reason; a stale version is surfaced as a conflict with a refresh.
 */
function useDeleteMessage(thread: ThreadDetail | null, refresh: () => void, afterDelete: () => void) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const deleteMessage = React.useCallback(
    async (message: ThreadMessageItem) => {
      if (!thread) return
      const confirmed = await confirm({
        title: t('communication.message.delete.confirm.title'),
        text: t('communication.message.delete.confirm.text'),
        confirmText: t('communication.message.actions.delete'),
        cancelText: t('communication.message.delete.confirm.cancel'),
        variant: 'destructive',
      })
      if (!confirmed) return
      setDeleting(message.id)
      try {
        await withScopedApiRequestHeaders(buildOptimisticLockHeader(thread.updatedAt), () =>
          apiCallOrThrow(
            `/api/communication/threads/${encodeURIComponent(thread.id)}/messages/${encodeURIComponent(message.id)}`,
            { method: 'DELETE' },
            { errorMessage: t('communication.message.delete.errors.delete') },
          ),
        )
        flash(t('communication.message.delete.flash'), 'success')
        refresh()
        afterDelete()
      } catch (error: unknown) {
        const code = errorCodeOf(error)
        if (code === 'case_immutable' || code === 'message_deleted' || code === 'message_not_editable') {
          flash(errorMessage(error, t(`communication.errors.${code}`)), 'error')
          refresh()
        } else if (!surfaceRecordConflict(error, t, { onRefresh: refresh })) {
          flash(errorMessage(error, t('communication.message.delete.errors.delete')), 'error')
        }
      } finally {
        setDeleting(null)
      }
    },
    [thread, confirm, t, refresh, afterDelete],
  )
  return { deleteMessage, deleting, ConfirmDialogElement }
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
    void queryClient.invalidateQueries({ queryKey: ['communication-cases'] })
  }, [queryClient, id])
  useMarkRead(thread, refresh)
  const { markCase, marking, ConfirmDialogElement } = useMarkCase(thread, refresh)
  const messagesTitleRef = React.useRef<HTMLHeadingElement>(null)
  // The deleted message loses its button, so the focus moves to the messages' heading instead of the page start.
  const focusMessages = React.useCallback(() => {
    messagesTitleRef.current?.focus()
  }, [])
  const deletion = useDeleteMessage(thread, refresh, focusMessages)

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
  const firstWithDeliveries = thread.messages.find((message) => message.hasDeliveries)
  const footer = (message: ThreadMessageItem) => {
    const deletable = message.canDelete && !thread.isCase
    if (!message.hasDeliveries && !deletable) return null
    return (
      <div className="flex min-w-0 flex-col gap-2 border-t pt-2" data-testid="thread-message-footer">
        {message.hasDeliveries ? (
          <MessageDeliveries thread={thread} message={message} initiallyOpen={message.id === firstWithDeliveries?.id} />
        ) : null}
        {deletable ? (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={deletion.deleting !== null}
              onClick={() => void deletion.deleteMessage(message)}
              data-testid="thread-message-delete"
            >
              {t('communication.message.actions.delete')}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-6" data-testid="thread-record">
      <header className="flex flex-col gap-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="min-w-0 text-2xl font-semibold break-words" data-testid="thread-subject">
            {thread.subject}
          </h1>
          {thread.canMarkCase ? (
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={marking}
                onClick={() => void markCase()}
                data-testid="thread-mark-case"
              >
                {t('communication.cases.actions.mark')}
              </Button>
            </div>
          ) : null}
        </div>
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
          {thread.isCase ? (
            <span data-testid="thread-case-badge">
              <StatusBadge variant="warning">{t('communication.cases.badge')}</StatusBadge>
            </span>
          ) : null}
          {thread.unread ? <StatusBadge variant="info">{t('communication.threads.unread')}</StatusBadge> : null}
        </p>
      </header>
      {thread.isCase ? <CaseBanner thread={thread} /> : null}
      {thread.staff ? <ShareTextPanel thread={thread} /> : null}
      <section className="flex flex-col gap-3" aria-labelledby="thread-messages-title">
        <h2
          id="thread-messages-title"
          ref={messagesTitleRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {t('communication.threads.record.messagesTitle')}
        </h2>
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
      </section>
      {ConfirmDialogElement}
      {deletion.ConfirmDialogElement}
    </div>
  )
}
