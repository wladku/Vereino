'use client'
// `/club/messages` — the member inbox (foundation III REQ-M10, *UI and Interaction Contracts*; club spec UI row
// `/club/messages`; README M-06): the member's own threads (`as=member`), newest activity first, each with its scope,
// the last author and the time of the newest message they may see, an unread marker and the "Case" mark. A guardian
// narrows the list to one ward's threads (`wardId`). Anyone with `communication.post` posts a "New announcement" from
// here (E06-S20): the backend composer in a dialog, "To" limited to their own sections, groups and sessions; after
// posting a toast counts the recipients and the new thread opens. "Write to the coach" opens `/club/messages/new` when
// the household has a group with staff today (REQ-M12, DD-M18). States: loading, error with retry, empty. Phone-first.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton, StatusTag } from '@vereino/ui'
import { DialogContent } from '@/components/ui/dialog'
import { composePreset, memberComposerKinds } from '../../lib/member-inbox'
import {
  CLUB_MESSAGE_NEW_HREF,
  clubThreadHref,
  formatDateTime,
  inboxQuery,
  scopeLabel,
  type ThreadList,
  type ThreadListItem,
  type Translate,
} from '../client-helpers'
import { ThreadComposer, type PostedThread } from '../ThreadComposer'
import { useCanPost } from '../useCanPost'
import { MessagesClubFrame, type MessagesProfile } from './MessagesClubFrame'
import { hasStaff, useDirectOptions } from './useDirectOptions'

class InboxLoadError extends Error {}

/** The prefix of every inbox query (all threads and each ward's), so one invalidation refreshes them all. */
export const INBOX_QUERY_KEY = ['communication-inbox'] as const

function useInbox(wardId: string | null) {
  return useQuery({
    queryKey: [...INBOX_QUERY_KEY, wardId ?? 'all'],
    queryFn: async () => {
      const call = await apiCall<ThreadList>(`/api/communication/threads?${inboxQuery(wardId)}`)
      if (!call.ok || !call.result) throw new InboxLoadError(String(call.status))
      return call.result
    },
  })
}

/** "Write to the coach", offered only when a household member takes part in a group with staff today. */
/** "Write to the coach" when the household has staff to write to: a button in the header, a link under an empty inbox. */
function WriteAction({ link = false }: { link?: boolean }) {
  const t = useT()
  const options = useDirectOptions()
  if (!options.data?.some(hasStaff)) return null
  if (link) {
    return (
      <Link
        href={CLUB_MESSAGE_NEW_HREF}
        className="text-primary inline-flex min-h-11 items-center text-sm underline"
        data-testid="club-messages-empty-write"
      >
        {t('communication.direct.action')}
      </Link>
    )
  }
  return (
    <Button asChild className="min-h-11 self-start">
      <Link href={CLUB_MESSAGE_NEW_HREF} data-testid="club-messages-write">
        {t('communication.direct.action')}
      </Link>
    </Button>
  )
}

/** "scope · last author · time": the newest message's author ("Club" for a system one), else the thread's author. */
function threadMeta(t: Translate, thread: ThreadListItem, locale: string): string {
  const last = thread.lastMessage
  const author = last
    ? last.system
      ? t('communication.threads.lastMessageSystem')
      : (last.authorName ?? '')
    : (thread.authorName ?? '')
  return [scopeLabel(t, thread), author, formatDateTime(thread.lastMessageAt, locale)]
    .filter((part) => part !== '')
    .join(' · ')
}

/** "All" and one toggle per ward: the list then shows the threads about that ward only. */
function WardFilter({
  wards,
  value,
  onChange,
}: {
  wards: MessagesProfile['wards']
  value: string | null
  onChange: (wardId: string | null) => void
}) {
  const t = useT()
  const options = [
    { id: null, label: t('communication.club.wards.all') },
    ...wards.map((ward) => ({ id: ward.personId, label: ward.firstName })),
  ]
  return (
    <div
      role="group"
      aria-label={t('communication.club.wards.label')}
      className="flex flex-wrap gap-2"
      data-testid="club-messages-wards"
    >
      {options.map((option) => (
        <Button
          key={option.id ?? 'all'}
          type="button"
          size="sm"
          variant={value === option.id ? 'default' : 'outline'}
          className="min-h-11 min-w-11"
          aria-pressed={value === option.id}
          onClick={() => {
            onChange(option.id)
          }}
          data-testid="club-messages-ward"
          data-ward={option.id ?? 'all'}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

/** "New announcement": the composer in a dialog; after posting, the recipients are counted and the thread opens. */
function NewAnnouncement() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  // `?compose=occurrence:<id>` (#272): "Message the group" on a session page opens the composer addressed to it.
  const compose = useSearchParams().get('compose')
  const preset = React.useMemo(() => composePreset(compose), [compose])
  const [open, setOpen] = React.useState(preset !== null)
  const onPosted = React.useCallback(
    (posted: PostedThread) => {
      flash(t('communication.club.compose.sent', { count: String(posted.recipientCount) }), 'success')
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: INBOX_QUERY_KEY })
      if (posted.threadId) router.push(clubThreadHref(posted.threadId))
    },
    [t, queryClient, router],
  )
  return (
    <>
      <Button
        type="button"
        className="min-h-11"
        onClick={() => {
          setOpen(true)
        }}
        data-testid="club-messages-new"
      >
        {t('communication.club.compose.action')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeAriaLabel={t('communication.club.compose.close')} data-testid="club-messages-compose">
          <DialogHeader>
            <DialogTitle>{t('communication.threads.create.title')}</DialogTitle>
            <DialogDescription>{t('communication.club.compose.help')}</DialogDescription>
          </DialogHeader>
          {open ? (
            <ThreadComposer
              embedded
              selectKinds={memberComposerKinds}
              onPosted={onPosted}
              initialAudience={preset ?? undefined}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Inbox({ profile }: { profile: MessagesProfile }) {
  const t = useT()
  const locale = useLocale()
  const canPost = useCanPost()
  const wards = profile.wards
  const [wardId, setWardId] = React.useState<string | null>(null)
  const query = useInbox(wardId)
  const ward = wards.find((entry) => entry.personId === wardId) ?? null
  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('communication.club.loading')} />
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
      <div className="flex flex-col items-start gap-2" data-testid="club-messages-empty">
        <p className="text-muted-foreground">
          {ward ? t('communication.club.wards.empty', { name: ward.firstName }) : t('communication.club.empty')}
        </p>
        <WriteAction link />
      </div>
    )
  } else {
    body = (
      <ul className="flex flex-col gap-2" data-testid="club-messages">
        {query.data.items.map((thread) => (
          <li key={thread.id}>
            <Link
              href={clubThreadHref(thread.id)}
              className="bg-card hover:bg-accent focus-visible:focus-indicator flex min-h-11 flex-col gap-1 rounded-lg border p-3 outline-none"
              data-testid="club-thread"
              data-unread={thread.unread ? 'true' : 'false'}
              data-case={thread.isCase ? 'true' : 'false'}
            >
              <span className="flex flex-wrap items-center gap-2">
                {thread.unread ? (
                  <span data-testid="club-thread-unread">
                    <StatusTag status="info">{t('communication.club.unread')}</StatusTag>
                  </span>
                ) : null}
                {thread.isCase ? (
                  <span data-testid="club-thread-case">
                    <StatusTag status="warning">{t('communication.cases.badge')}</StatusTag>
                  </span>
                ) : null}
                <span className={thread.unread ? 'font-semibold break-words' : 'break-words'}>{thread.subject}</span>
              </span>
              <span className="text-muted-foreground text-sm break-words" data-testid="club-thread-meta">
                {threadMeta(t, thread, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('communication.club.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <WriteAction />
          {canPost ? <NewAnnouncement /> : null}
        </div>
      </div>
      {wards.length > 0 ? <WardFilter wards={wards} value={wardId} onChange={setWardId} /> : null}
      {body}
    </>
  )
}

export function ClubMessagesPage() {
  return <MessagesClubFrame>{(profile) => <Inbox profile={profile} />}</MessagesClubFrame>
}
