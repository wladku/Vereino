'use client'
// The messages of a thread and the reply box, shared by the admin thread page and the member thread page (foundation
// III DD-M10, DD-M12; R01, R15): each message with its author and the role they wrote in, "edited" / "deleted", a
// system message for a cancellation (naming who cancelled and in which role, #139) or a moved session (#271), and the "staff and family only"
// marker on a member's reply. Club text is shown as written (line breaks kept, never as markup). The admin page adds
// its own part under each message (`renderFooter`: the delivery status and "Delete message", B-19). With `onEdit`
// the author edits their own message in place (B-19, M-07; people life-cycle spec REQ-L12, #304): never another
// author's, a deleted or a system message, nor any message of a case.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { mayEditMessage } from '../lib/case-rules'
import { formatDateTime, roleLabel, type ThreadMessageItem } from './client-helpers'

const MESSAGE_MAX_LENGTH = 10000

const TEXTAREA_CLASS =
  'border-input bg-background focus-visible:focus-indicator min-h-24 w-full rounded-md border p-3 text-sm outline-none'

/** The inline editor of one's own message: the text, "Save" and "Cancel" (Escape cancels too). */
function MessageEditor({
  message,
  onSave,
  onCancel,
}: {
  message: ThreadMessageItem
  onSave: (body: string) => Promise<boolean>
  onCancel: () => void
}) {
  const t = useT()
  const id = React.useId()
  const [body, setBody] = React.useState(message.body ?? '')
  const [pending, setPending] = React.useState(false)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  // The editor opens on the reader's "Edit", so the text takes the focus.
  React.useEffect(() => {
    textareaRef.current?.focus()
  }, [])
  const text = body.trim()
  return (
    <form
      className="flex flex-col gap-2"
      aria-label={t('communication.message.edit.label')}
      onSubmit={(event) => {
        event.preventDefault()
        if (!text) return
        setPending(true)
        void onSave(text).finally(() => {
          setPending(false)
        })
      }}
    >
      <label htmlFor={`${id}-edit`} className="sr-only">
        {t('communication.message.edit.label')}
      </label>
      <textarea
        id={`${id}-edit`}
        ref={textareaRef}
        className={TEXTAREA_CLASS}
        value={body}
        maxLength={MESSAGE_MAX_LENGTH}
        required
        disabled={pending}
        onChange={(event) => {
          setBody(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        data-testid="thread-message-edit-body"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          className="min-h-11"
          disabled={pending || !text || text === message.body}
          data-testid="thread-message-edit-save"
        >
          {t('communication.message.edit.save')}
        </Button>
        <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={pending} onClick={onCancel}>
          {t('communication.message.edit.cancel')}
        </Button>
      </div>
    </form>
  )
}

export function MessageList({
  messages,
  renderFooter,
  isCase = false,
  onEdit,
}: {
  messages: ThreadMessageItem[]
  /** What the page shows under a message (nothing by default). */
  renderFooter?: (message: ThreadMessageItem) => React.ReactNode
  /** The thread is a case: no message is offered for editing. */
  isCase?: boolean
  /** Saves the author's new text; true closes the editor. Without it no "Edit" is offered. */
  onEdit?: (message: ThreadMessageItem, body: string) => Promise<boolean>
}) {
  const t = useT()
  const locale = useLocale()
  const [editingId, setEditingId] = React.useState<string | null>(null)
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
            {message.editedAt && !message.deleted ? (
              <span data-testid="thread-message-edited">· {t('communication.message.edited')}</span>
            ) : null}
            {message.audience === 'staff' ? (
              <StatusBadge variant="neutral">{t('communication.message.staffOnly')}</StatusBadge>
            ) : null}
          </p>
          {message.deleted ? (
            <p className="text-muted-foreground italic">{t('communication.message.deleted')}</p>
          ) : message.system ? (
            <div className="flex flex-col gap-1">
              <p className="font-medium">{t('communication.message.system')}</p>
              {message.kind === 'reschedule' ? (
                // A moved-session notice is written whole, in the club's language (REQ-A09, #271).
                <p className="break-words whitespace-pre-line" data-testid="thread-message-reschedule">
                  {message.body}
                </p>
              ) : message.authorName ? (
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
          ) : editingId === message.id && onEdit ? (
            <MessageEditor
              message={message}
              onSave={async (body) => {
                const done = await onEdit(message, body)
                if (done) setEditingId(null)
                return done
              }}
              onCancel={() => {
                setEditingId(null)
              }}
            />
          ) : (
            <>
              <p className="break-words whitespace-pre-line" data-testid="thread-message-body">
                {message.body}
              </p>
              {onEdit &&
              mayEditMessage({
                threadIsCase: isCase,
                system: message.system,
                deleted: message.deleted,
                own: message.own,
              }) ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() => {
                      setEditingId(message.id)
                    }}
                    data-testid="thread-message-edit"
                  >
                    {t('communication.message.actions.edit')}
                  </Button>
                </div>
              ) : null}
            </>
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
        className={TEXTAREA_CLASS}
        value={body}
        maxLength={MESSAGE_MAX_LENGTH}
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
