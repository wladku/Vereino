'use client'
// `/club/invitations` (personal invitation link spec REQ-IL02, J-IL01, *UI and Interaction Contracts*; #868): the
// guardians with a pending account invitation in the caller's reach — a coach's groups, a coordinator's sections —
// with their children's first names and groups (`GET /api/people/invitations/pending`; `?groupId=` from the group
// page narrows it). Each row is a button that opens the share sheet (`InvitationShareDialog`): a new personal link as
// a QR code, to copy or share. A family whose account became active meanwhile leaves the list. Names only, no contact
// data. Loading, empty, error with a retry; single column at 375 px.
import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import { InvitationShareDialog } from '../InvitationShareDialog'
import { ClubFrame } from './ClubFrame'

type PendingFamily = {
  personId: string
  displayName: string
  invitedAt: string | null
  children: { firstName: string; groupName: string }[]
}

type PendingPage = { items: PendingFamily[]; total: number }

function usePendingFamilies(groupId: string | null) {
  return useQuery({
    queryKey: ['people-invitations-pending', groupId],
    queryFn: async () => {
      const query = new URLSearchParams({ pageSize: '100' })
      if (groupId) query.set('groupId', groupId)
      const call = await apiCallOrThrow<PendingPage>(`/api/people/invitations/pending?${query.toString()}`)
      return call.result ?? { items: [], total: 0 }
    },
  })
}

function Families() {
  const t = useT()
  const params = useSearchParams()
  const groupId = params.get('groupId')
  const query = usePendingFamilies(groupId)
  const [selected, setSelected] = React.useState<PendingFamily | null>(null)

  if (query.isLoading) {
    return <MemberSkeleton shape="rows" count={4} label={t('people.invitationLink.list.loading')} />
  }
  if (query.isError || !query.data) {
    return (
      <ErrorMessage
        label={t('people.invitationLink.list.error')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('people.invitationLink.retry')}
          </Button>
        }
      />
    )
  }
  const families = query.data.items
  return (
    <>
      {families.length === 0 ? (
        <p className="text-muted-foreground max-w-prose" data-testid="club-invitations-empty">
          {t('people.invitationLink.list.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="club-invitations-list">
          {families.map((family) => (
            <li key={family.personId}>
              <button
                type="button"
                className="bg-card hover:bg-muted focus-visible:ring-ring flex min-h-11 w-full flex-col items-start gap-1 rounded-lg border p-3 text-left focus-visible:ring-2 focus-visible:outline-none"
                onClick={() => {
                  setSelected(family)
                }}
                data-testid="club-invitations-family"
              >
                <span className="font-medium break-words">{family.displayName}</span>
                <span className="text-muted-foreground text-sm break-words">
                  {family.children
                    .map((child) =>
                      t('people.invitationLink.list.child', { name: child.firstName, group: child.groupName }),
                    )
                    .join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-sm">{t('people.invitationLink.list.hint')}</p>
      {selected ? (
        <InvitationShareDialog
          personId={selected.personId}
          personName={selected.displayName}
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null)
          }}
          onNotPending={() => void query.refetch()}
        />
      ) : null}
    </>
  )
}

export function ClubInvitationsPage() {
  const t = useT()
  return (
    <ClubFrame>
      {() => (
        <div className="flex flex-col gap-4" data-testid="club-invitations">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">{t('people.invitationLink.list.title')}</h1>
            <p className="text-muted-foreground max-w-prose text-sm">{t('people.invitationLink.list.intro')}</p>
          </header>
          <Families />
        </div>
      )}
    </ClubFrame>
  )
}
