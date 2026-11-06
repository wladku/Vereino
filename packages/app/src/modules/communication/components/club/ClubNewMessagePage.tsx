'use client'
// `/club/messages/new` — a member writes to the staff (foundation III REQ-M12, DD-M18; #138): about themself or a ward
// ("About", shown with more than one household member), to the coaches of a group that member takes part in today or
// to the coordinators of its section ("To"), a subject and a message. The options come from
// `GET /api/communication/direct`; `POST` starts the thread and the page opens it. States: loading, error with retry,
// empty (no group to write to), and the refusals 403 (outside the household), 422 (nobody to address) and 429 (the
// daily limit). Phone-first.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Radio, RadioGroup } from '@open-mercato/ui/primitives/radio'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  CLUB_MESSAGES_HREF,
  OWN_FORBIDDEN_STATE,
  clubThreadHref,
  type DirectOption,
  type Translate,
} from '../client-helpers'
import { INBOX_QUERY_KEY } from './ClubMessagesPage'
import { MessagesClubFrame } from './MessagesClubFrame'
import { hasStaff, useDirectOptions } from './useDirectOptions'

const SUBJECT_MAX = 200
const BODY_MAX = 10000

type Recipient = { key: string; groupId: string; to: 'coaches' | 'coordinator'; label: string; names: string }

/** The "To" choices of one household member: each group's coaches, then its section's coordinators, when present. */
function recipientsOf(t: Translate, options: readonly DirectOption[], personId: string): Recipient[] {
  return options
    .filter((option) => option.personId === personId)
    .flatMap((option) => [
      ...(option.coachNames.length > 0
        ? [
            {
              key: `${option.groupId}:coaches`,
              groupId: option.groupId,
              to: 'coaches' as const,
              label: t('communication.direct.toCoaches', { group: option.groupName }),
              names: option.coachNames.join(', '),
            },
          ]
        : []),
      ...(option.coordinatorNames.length > 0
        ? [
            {
              key: `${option.groupId}:coordinator`,
              groupId: option.groupId,
              to: 'coordinator' as const,
              label: t('communication.direct.toCoordinator', {
                section: option.sectionName,
                group: option.groupName,
              }),
              names: option.coordinatorNames.join(', '),
            },
          ]
        : []),
    ])
}

/** The household members that have someone to write to, in the order of the options. */
function subjectsOf(options: readonly DirectOption[]) {
  const subjects = new Map<string, string>()
  for (const option of options) if (hasStaff(option)) subjects.set(option.personId, option.personName)
  return [...subjects].map(([personId, personName]) => ({ personId, personName }))
}

/** The message of a refused send: the household rule (403), nobody to address (422), the daily limit (429). */
function sendError(t: Translate, status: number, code: string | null): string {
  if (status === 403) return t('communication.direct.errors.forbidden')
  if (status === 429 || code === 'direct_thread_limit') return t('communication.errors.direct_thread_limit')
  if (code === 'direct_no_recipients') return t('communication.errors.direct_no_recipients')
  if (status === 400) return t('communication.direct.errors.invalid')
  return t('communication.direct.errors.send')
}

function Composer({ options }: { options: DirectOption[] }) {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = React.useId()
  const subjects = React.useMemo(() => subjectsOf(options), [options])
  const [personId, setPersonId] = React.useState(subjects[0]?.personId ?? '')
  const recipients = React.useMemo(() => recipientsOf(t, options, personId), [t, options, personId])
  const [recipientKey, setRecipientKey] = React.useState(recipients[0]?.key ?? '')
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (subjects.length === 0) {
    return (
      <p className="text-muted-foreground" data-testid="club-direct-empty">
        {t('communication.direct.empty')}
      </p>
    )
  }

  const recipient = recipients.find((entry) => entry.key === recipientKey) ?? null
  const ready = Boolean(recipient) && subject.trim().length > 0 && body.trim().length > 0

  const send = async () => {
    if (!recipient || !ready) return
    setPending(true)
    setError(null)
    let call: Awaited<ReturnType<typeof apiCall<{ threadId?: string; code?: string }>>>
    try {
      call = await apiCall<{ threadId?: string; code?: string }>('/api/communication/direct', {
        method: 'POST',
        headers: { ...(OWN_FORBIDDEN_STATE.headers as Record<string, string>), 'content-type': 'application/json' },
        body: JSON.stringify({
          personId,
          groupId: recipient.groupId,
          to: recipient.to,
          subject: subject.trim(),
          body: body.trim(),
        }),
      })
    } catch {
      // `fetch` itself failed (offline, connection reset): release the button and say the message was not sent.
      setPending(false)
      setError(sendError(t, 0, null))
      return
    }
    if (call.ok && call.result?.threadId) {
      void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY })
      router.push(clubThreadHref(call.result.threadId))
      return
    }
    setPending(false)
    setError(sendError(t, call.status, typeof call.result?.code === 'string' ? call.result.code : null))
  }

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="club-direct-form"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <p className="text-muted-foreground max-w-prose text-sm">{t('communication.direct.intro')}</p>
      {subjects.length > 1 ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-about`}>{t('communication.direct.about')}</Label>
          <Select
            value={personId}
            onValueChange={(value) => {
              setPersonId(value)
              setRecipientKey(recipientsOf(t, options, value)[0]?.key ?? '')
            }}
          >
            <SelectTrigger id={`${id}-about`} className="min-h-11 sm:w-72" data-testid="club-direct-about">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((entry) => (
                <SelectItem key={entry.personId} value={entry.personId}>
                  {entry.personName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend id={`${id}-to`} className="mb-1 text-sm font-medium">
          {t('communication.direct.to')}
        </legend>
        <RadioGroup
          aria-labelledby={`${id}-to`}
          className="flex flex-col gap-2"
          value={recipientKey}
          onValueChange={setRecipientKey}
        >
          {recipients.map((entry) => (
            <label
              key={entry.key}
              htmlFor={`${id}-${entry.key}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
              data-testid="club-direct-recipient"
            >
              <Radio id={`${id}-${entry.key}`} value={entry.key} />
              <span className="flex flex-col">
                <span className="text-sm font-medium break-words">{entry.label}</span>
                <span className="text-muted-foreground text-sm break-words">{entry.names}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-subject`}>{t('communication.direct.subject')}</Label>
        <Input
          id={`${id}-subject`}
          className="min-h-11"
          value={subject}
          maxLength={SUBJECT_MAX}
          onChange={(event) => {
            setSubject(event.target.value)
          }}
          data-testid="club-direct-subject"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-body`}>{t('communication.direct.body')}</Label>
        <Textarea
          id={`${id}-body`}
          className="min-h-32"
          value={body}
          maxLength={BODY_MAX}
          onChange={(event) => {
            setBody(event.target.value)
          }}
          data-testid="club-direct-body"
        />
      </div>
      {error ? (
        <Alert status="error" data-testid="club-direct-error">
          <p>{error}</p>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" disabled={pending || !ready} data-testid="club-direct-send">
          {pending ? t('communication.direct.sending') : t('communication.direct.send')}
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={CLUB_MESSAGES_HREF}>{t('communication.direct.cancel')}</Link>
        </Button>
      </div>
    </form>
  )
}

function NewMessage() {
  const t = useT()
  const query = useDirectOptions()
  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <LoadingMessage label={t('communication.direct.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('communication.direct.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('communication.actions.retry')}
          </Button>
        }
      />
    )
  } else {
    body = <Composer options={query.data} />
  }
  return (
    <>
      <Link href={CLUB_MESSAGES_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
        {t('communication.club.back')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('communication.direct.title')}</h1>
      {body}
    </>
  )
}

export function ClubNewMessagePage() {
  return <MessagesClubFrame>{() => <NewMessage />}</MessagesClubFrame>
}
