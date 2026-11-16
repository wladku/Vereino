'use client'
// The "Account" tab of the person record (club spec UI table, J-001 step 3; README B-10): every reader of the record
// sees the account state read from the platform user (people life-cycle spec REQ-L01, DD-L02; #303) — none, invited
// ("Invited on {date} — not signed in yet"), active or blocked — with the login e-mail. Only a user with
// `people.accounts.manage` (`canManage`) gets the actions: "Create account" through
// `POST /api/people/persons/{id}/account` while there is none (below the club's `own_account_min_age` the button is
// disabled; a person without a date of birth cannot get an account either), "Send the invitation again" while invited
// (`POST …/account/invitation`; 409 reloads the tab, 429 names the wait), "Change login e-mail" and "Block" /
// "Unblock" (`PUT …/account` with the person's version; 422 `last_club_admin`).
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import {
  apiCall,
  apiCallOrThrow,
  readApiResultOrThrow,
  withScopedApiRequestHeaders,
} from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { accountAgePolicy, errorCodeOf } from '@vereino/core'
import { retryAfterMinutes } from '../lib/account-limits'
import { errorMessage, textOrNull, type PersonAccount, type PersonDetail } from './client-helpers'
import { useClubToday } from '@vereino/ui'

const STATE_VARIANT: Record<PersonAccount['state'], StatusBadgeVariant> = {
  none: 'neutral',
  invited: 'warning',
  active: 'success',
  blocked: 'error',
}

const STATE_LABEL: Record<PersonAccount['state'], string> = {
  none: 'people.account.state.none',
  invited: 'people.account.state.invited',
  active: 'people.account.state.active',
  blocked: 'people.account.state.blocked',
}

function formatDay(iso: string | null, locale: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(locale, { dateStyle: 'long' })
}

export function AccountPanel({
  person,
  canManage,
  onChanged,
}: {
  person: PersonDetail
  canManage: boolean
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const locale = useLocale()
  const account: PersonAccount =
    person.account ??
    (person.hasAccount
      ? { state: 'active', email: person.accountEmail ?? null, invitedAt: null, lastSignInAt: null }
      : { state: 'none', email: null, invitedAt: null, lastSignInAt: null })

  return (
    <section className="bg-card flex flex-col gap-4 rounded-lg border p-4" aria-label={t('people.account.title')}>
      <SectionHeader title={t('people.account.title')} />
      {account.state === 'none' ? (
        <CreateAccount person={person} canCreate={canManage} onChanged={onChanged} />
      ) : (
        <ExistingAccount
          person={person}
          account={account}
          locale={locale}
          canManage={canManage}
          onChanged={onChanged}
        />
      )}
    </section>
  )
}

function ExistingAccount({
  person,
  account,
  locale,
  canManage,
  onChanged,
}: {
  person: PersonDetail
  account: PersonAccount
  locale: string
  canManage: boolean
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [busy, setBusy] = React.useState(false)
  const [sentAgain, setSentAgain] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [email, setEmail] = React.useState(account.email ?? '')
  const invitedOn = formatDay(account.invitedAt, locale)
  const lastSignIn = formatDay(account.lastSignInAt, locale)

  const resend = async () => {
    setBusy(true)
    try {
      const call = await apiCall<{ sentAt?: string; warning?: string; retryAfterSeconds?: number; error?: string }>(
        `/api/people/persons/${person.id}/account/invitation`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) },
      )
      if (call.status === 429) {
        const minutes = retryAfterMinutes(
          Number(call.result?.retryAfterSeconds ?? call.response.headers.get('Retry-After')),
        )
        flash(t('people.account.flash.rateLimited', { minutes: String(minutes) }), 'warning')
      } else if (call.status === 409 && errorCodeOf(call.result) === 'invitation_not_pending') {
        flash(t('people.account.flash.notPending'), 'info')
        await onChanged()
      } else if (!call.ok) {
        flash(call.result?.error ?? t('people.account.errors.resend'), 'error')
      } else if (call.result?.warning === 'invite_email_failed') {
        flash(t('people.account.flash.resendFailed'), 'warning')
      } else {
        setSentAgain(true)
        flash(t('people.account.flash.resent'), 'success')
      }
    } catch (error: unknown) {
      flash(errorMessage(error, t('people.account.errors.resend')), 'error')
    } finally {
      setBusy(false)
    }
  }

  const update = async (body: { email?: string; blocked?: boolean }, success: string) => {
    setBusy(true)
    try {
      const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(person.updatedAt), () =>
        apiCallOrThrow<{ warning?: string }>(
          `/api/people/persons/${person.id}/account`,
          { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
          { errorMessage: t('people.account.errors.update') },
        ),
      )
      if (call.result?.warning === 'invite_email_failed') flash(t('people.account.flash.resendFailed'), 'warning')
      else flash(success, 'success')
      setEditing(false)
      await onChanged()
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void onChanged() })) {
        flash(errorMessage(error, t('people.account.errors.update')), 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const toggleBlock = async () => {
    const blocking = account.state !== 'blocked'
    const confirmed = await confirm({
      title: t(blocking ? 'people.account.confirm.block' : 'people.account.confirm.unblock'),
      text: t(blocking ? 'people.account.confirm.blockText' : 'people.account.confirm.unblockText'),
      variant: blocking ? 'destructive' : 'default',
    })
    if (!confirmed) return
    await update({ blocked: blocking }, t(blocking ? 'people.account.flash.blocked' : 'people.account.flash.unblocked'))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge variant={STATE_VARIANT[account.state]}>{t(STATE_LABEL[account.state])}</StatusBadge>
      </div>
      {account.email ? (
        <p className="text-sm break-words">{t('people.account.login', { email: account.email })}</p>
      ) : null}
      {account.state === 'invited' ? (
        <p className="text-sm">
          {invitedOn ? t('people.account.invitedOn', { date: invitedOn }) : t('people.account.invitedNoDate')}
        </p>
      ) : null}
      {account.state === 'active' && lastSignIn ? (
        <p className="text-muted-foreground text-sm">{t('people.account.lastSignIn', { date: lastSignIn })}</p>
      ) : null}
      {account.state === 'blocked' ? <p className="text-sm">{t('people.account.blockedHint')}</p> : null}
      {account.state === 'invited' && sentAgain ? (
        <p className="text-sm" role="status">
          {t('people.account.sentAgain')}
        </p>
      ) : null}
      {account.state === 'invited' ? (
        <p className="text-muted-foreground text-sm">{t('people.account.forgotPasswordHint')}</p>
      ) : null}
      {canManage ? (
        editing ? (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              const address = textOrNull(email)
              if (address) void update({ email: address }, t('people.account.flash.emailChanged'))
            }}
          >
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="people-account-login">{t('people.account.fields.login')}</Label>
              <Input
                id="people-account-login"
                type="email"
                autoComplete="off"
                value={email}
                disabled={busy}
                onChange={(event) => {
                  setEmail(event.target.value)
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !textOrNull(email)}>
                {t('people.account.actions.save')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setEditing(false)
                  setEmail(account.email ?? '')
                }}
              >
                {t('people.account.actions.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {account.state === 'invited' ? (
              <Button type="button" disabled={busy} onClick={() => void resend()}>
                {t('people.account.actions.resend')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEmail(account.email ?? '')
                setEditing(true)
              }}
            >
              {t('people.account.actions.changeEmail')}
            </Button>
            <Button
              type="button"
              variant={account.state === 'blocked' ? 'outline' : 'destructive'}
              disabled={busy}
              onClick={() => void toggleBlock()}
            >
              {t(account.state === 'blocked' ? 'people.account.actions.unblock' : 'people.account.actions.block')}
            </Button>
          </div>
        )
      ) : null}
      {ConfirmDialogElement}
    </div>
  )
}

function CreateAccount({
  person,
  canCreate,
  onChanged,
}: {
  person: PersonDetail
  canCreate: boolean
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const today = useClubToday()
  const [email, setEmail] = React.useState(person.email ?? '')
  const [busy, setBusy] = React.useState(false)
  const settings = useQuery({
    queryKey: ['club_core-settings'],
    enabled: canCreate,
    queryFn: () => readApiResultOrThrow<{ ownAccountMinAge?: number }>('/api/club_core/settings'),
  })
  const threshold = settings.data?.ownAccountMinAge ?? null
  const belowThreshold =
    threshold !== null && person.birthDate
      ? accountAgePolicy({ birthDate: person.birthDate, threshold, today }) === 'below_threshold'
      : false
  const blocked = !person.birthDate || belowThreshold

  const create = async () => {
    const address = textOrNull(email)
    if (!address) return
    setBusy(true)
    try {
      const call = await apiCallOrThrow<{ userId?: string; warning?: string }>(
        `/api/people/persons/${person.id}/account`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: address }),
        },
        { errorMessage: t('people.account.errors.create') },
      )
      if (call.result?.warning === 'invite_email_failed') flash(t('people.account.flash.inviteFailed'), 'warning')
      else flash(t('people.account.flash.created'), 'success')
      await onChanged()
    } catch (error: unknown) {
      flash(errorMessage(error, t('people.account.errors.create')), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!canCreate) return <p className="text-sm">{t('people.account.none')}</p>
  return (
    <>
      <p className="text-sm">{t('people.account.none')}</p>
      {!person.birthDate ? (
        <div>
          <StatusBadge variant="warning">{t('people.account.birthDateRequired')}</StatusBadge>
        </div>
      ) : null}
      {belowThreshold ? (
        <div>
          <StatusBadge variant="warning">
            {t('people.account.belowThreshold', { threshold: String(threshold) })}
          </StatusBadge>
        </div>
      ) : null}
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <Label htmlFor="people-account-email">{t('people.account.fields.email')}</Label>
          <Input
            id="people-account-email"
            type="email"
            autoComplete="off"
            value={email}
            disabled={busy || blocked}
            onChange={(event) => {
              setEmail(event.target.value)
            }}
          />
        </div>
        <Button type="submit" disabled={busy || blocked || !textOrNull(email) || settings.isLoading}>
          {t('people.account.actions.create')}
        </Button>
      </form>
    </>
  )
}
