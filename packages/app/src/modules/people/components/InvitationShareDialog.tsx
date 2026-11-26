'use client'
// The share sheet of a personal invitation link (personal invitation link spec REQ-IL01, REQ-IL02, J-IL01, J-IL02;
// #868): opening it asks `POST /api/people/persons/{id}/account/invitation-link` for a new link (the person's earlier
// links stop working), then shows the QR code, **Copy link** and — where the phone offers it — **Share**, through the
// stateless `InvitationSharePanel` of `@vereino/ui`. 429 names the wait, 409 says the account is already active and
// tells the caller, any other failure offers a retry. Used by the panel's account tab and by `/club/invitations`.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { InvitationSharePanel, type InvitationShareState } from '@vereino/ui'
import { DialogContent } from '@/components/ui/dialog'
import { retryAfterMinutes } from '../lib/account-limits'

type IssueResult = { url?: string; expiresAt?: string; retryAfterSeconds?: number; error?: string }

/** What one issuing call ended in; the sheet's state follows from it. */
type Issued =
  | { kind: 'issued'; url: string; expiresAt: string | null }
  | { kind: 'rate_limited'; minutes: number }
  | { kind: 'not_pending' }
  | { kind: 'error' }

async function issueLink(personId: string): Promise<Issued> {
  try {
    const call = await apiCall<IssueResult>(`/api/people/persons/${personId}/account/invitation-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (call.status === 429) {
      const seconds = Number(call.result?.retryAfterSeconds ?? call.response.headers.get('Retry-After'))
      return { kind: 'rate_limited', minutes: retryAfterMinutes(seconds) }
    }
    if (call.status === 409 && errorCodeOf(call.result) === 'invitation_not_pending') return { kind: 'not_pending' }
    if (call.ok && call.result?.url)
      return { kind: 'issued', url: call.result.url, expiresAt: call.result.expiresAt ?? null }
    return { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}

export type InvitationShareDialogProps = {
  personId: string
  /** The guardian's name for the title. */
  personName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The account is no longer invited (409): the caller refreshes its view. */
  onNotPending?: () => void
}

function formatDay(value: string | null, locale: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date)
}

export function InvitationShareDialog({
  personId,
  personName,
  open,
  onOpenChange,
  onNotPending,
}: InvitationShareDialogProps) {
  const t = useT()
  const locale = useLocale()
  // Each opening issues a new link (the earlier ones stop working): never cached, never retried on its own.
  const query = useQuery({
    queryKey: ['people-invitation-link', personId],
    queryFn: () => issueLink(personId),
    enabled: open,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const [copiedUrl, setCopiedUrl] = React.useState<string | null>(null)
  const result = query.isFetching ? null : (query.data ?? null)
  const state: InvitationShareState = result ? result.kind : 'issuing'
  const url = result?.kind === 'issued' ? result.url : null

  const notifyNotPending = React.useEffectEvent(() => {
    onNotPending?.()
  })
  React.useEffect(() => {
    if (result?.kind === 'not_pending') notifyNotPending()
  }, [result])

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
    } catch {
      // Without clipboard access the link stays selectable in its field.
      setCopiedUrl(null)
    }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const share = async () => {
    if (!url) return
    try {
      await navigator.share({ title: t('people.invitationLink.shareTitle'), url })
    } catch {
      // The person closed the share sheet; nothing to do.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeAriaLabel={t('people.invitationLink.close')} data-testid="invitation-share-dialog">
        <DialogHeader>
          <DialogTitle>{t('people.invitationLink.title', { name: personName })}</DialogTitle>
          <DialogDescription>{t('people.invitationLink.description')}</DialogDescription>
        </DialogHeader>
        <InvitationSharePanel
          state={state}
          url={url}
          copied={url !== null && copiedUrl === url}
          canShare={canShare}
          onCopy={() => void copy()}
          onShare={() => void share()}
          onRetry={() => void query.refetch()}
          labels={{
            issuing: t('people.invitationLink.issuing'),
            warning: t('people.invitationLink.warning'),
            qrLabel: t('people.invitationLink.qrLabel'),
            linkField: t('people.invitationLink.linkField'),
            copy: t('people.invitationLink.copy'),
            share: t('people.invitationLink.share'),
            copied: t('people.invitationLink.copied'),
            validity: t('people.invitationLink.validity', {
              date: formatDay(result?.kind === 'issued' ? result.expiresAt : null, locale),
            }),
            rateLimited: t('people.invitationLink.rateLimited', {
              minutes: String(result?.kind === 'rate_limited' ? result.minutes : 1),
            }),
            notPending: t('people.invitationLink.notPending'),
            error: t('people.invitationLink.error'),
            retry: t('people.invitationLink.retry'),
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
