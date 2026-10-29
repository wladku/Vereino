'use client'
// The "Account" tab of the person record (club spec UI table, J-001 step 3): "Create account" through the existing
// `POST /api/people/persons/{id}/account`. Below the club's `own_account_min_age` the button is disabled with the
// "below the account age threshold" explanation (the server refuses it with 422 anyway); a person without a date of
// birth cannot get an account either.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { accountAgePolicy } from '@vereino/core'
import { errorMessage, localToday, textOrNull, type PersonDetail } from './client-helpers'

export function AccountPanel({ person, onChanged }: { person: PersonDetail; onChanged: () => Promise<void> }) {
  const t = useT()
  const [email, setEmail] = React.useState(person.email ?? '')
  const [busy, setBusy] = React.useState(false)
  const settings = useQuery({
    queryKey: ['club_core-settings'],
    queryFn: () => readApiResultOrThrow<{ ownAccountMinAge?: number }>('/api/club_core/settings'),
  })
  const threshold = settings.data?.ownAccountMinAge ?? null
  const belowThreshold =
    threshold !== null && person.birthDate
      ? accountAgePolicy({ birthDate: person.birthDate, threshold, today: localToday() }) === 'below_threshold'
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

  return (
    <section className="bg-card flex flex-col gap-4 rounded-lg border p-4" aria-label={t('people.account.title')}>
      <SectionHeader title={t('people.account.title')} />
      {person.hasAccount ? (
        <div>
          <StatusBadge variant="success">{t('people.account.exists')}</StatusBadge>
        </div>
      ) : (
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
      )}
    </section>
  )
}
