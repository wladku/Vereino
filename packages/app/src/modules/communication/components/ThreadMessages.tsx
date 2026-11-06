'use client'
// The messages of a thread and the reply box, shared by the admin thread page and the member thread page (foundation
// III DD-M10, DD-M12; R01, R15): each message with its author and the role they wrote in, "edited" / "deleted", a
// system message for a cancellation (naming who cancelled and in which role, #139), and the "staff and family only"
// marker on a member's reply. Club text is shown as written (line breaks kept, never as markup). The admin page adds
// its own part under each message (`renderFooter`: the delivery status and "Delete message", B-19).
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDateTime, roleLabel, type ThreadMessageItem } from './client-helpers'

export function MessageList({
  messages,
  renderFooter,
}: {
  messages: ThreadMessageItem[]
  /** What the page shows under a message (nothing by default). */
  renderFooter?: (message: ThreadMessageItem) => React.ReactNode
}) {
  const t = useT()
  const locale = useLocale()
  return (
    <ol className="flex flex-col gap-3" data-testid="thread-messages">
      {messages.map((message) => (
        <li
          key={message.id}
          className="bg-card flex min-w-0 flex-col gap-2 rounded-lg border p-3"
          data-testid="thread-message"
          data-message-id={message.id}
          data-audience={message.audience}
        >
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-foreground font-medium" data-testid="thread-message-author">
              {message.system
                ? t('communication.roles.system')
                : `${message.authorName ?? ''} (${roleLabel(t, message.actingRole)})`}
            </span>
            <span>{formatDateTime(message.createdAt, locale)}</span>
            {message.editedAt && !message.deleted ? <span>· {t('communication.message.edited')}</span> : null}
            {message.audience === 'staff' ? (
              <StatusBadge variant="neutral">{t('communication.message.staffOnly')}</StatusBadge>
            ) : null}
          </p>
          {message.deleted ? (
            <p className="text-muted-foreground italic">{t('communication.message.deleted')}</p>
          ) : message.system ? (
            <div className="flex flex-col gap-1">
              <p className="font-medium">{t('communication.message.system')}</p>
              {message.authorName ? (
                // A cancellation notice names who cancelled and in which role (R01, #139).
                <p className="break-words whitespace-pre-line" data-testid="thread-message-cancelled-by">
                  {t('communication.message.cancelledBy', {
                    name: message.authorName,
                    role: roleLabel(t, message.actingRole),
                    reason: message.body ?? '',
                  })}
                </p>
              ) : message.body ? (
                <p className="break-words whitespace-pre-line">
                  {t('communication.message.systemReason', { reason: message.body })}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="break-words whitespace-pre-line" data-testid="thread-message-body">
              {message.body}
            </p>
          )}
          {renderFooter ? renderFooter(message) : null}
        </li>
      ))}
    </ol>
  )
}

export function ReplyBox({
  onSend,
  hint,
  pending,
}: {
  onSend: (body: string) => Promise<boolean>
  hint: string | null
  pending: boolean
}) {
  const t = useT()
  const id = React.useId()
  const [body, setBody] = React.useState('')
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const text = body.trim()
        if (!text) return
        void onSend(text).then((sent) => {
          if (sent) setBody('')
        })
      }}
    >
      <label htmlFor={`${id}-reply`} className="text-sm font-medium">
        {t('communication.reply.label')}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      <textarea
        id={`${id}-reply`}
        className="border-input bg-background focus-visible:shadow-focus min-h-24 w-full rounded-md border p-3 text-sm outline-none"
        value={body}
        maxLength={10000}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => {
          setBody(event.target.value)
        }}
        data-testid="thread-reply-body"
      />
      <div>
        <Button
          type="submit"
          className="min-h-11"
          disabled={pending || body.trim().length === 0}
          data-testid="thread-reply-send"
        >
          {t('communication.reply.send')}
        </Button>
      </div>
    </form>
  )
}
