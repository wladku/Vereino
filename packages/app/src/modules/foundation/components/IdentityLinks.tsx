'use client'
// The linked sign-in identities of one account (social sign-in spec UI rows `/club/profile` and the person record;
// REQ-S02; #566): provider, the e-mail shared at link time (or "no e-mail shared"), the linked date and the last
// sign-in; "Disconnect" with a confirmation, disabled with an explanation while it is the last sign-in method; for the
// account holder, "Connect …" per enabled provider not yet linked (a link to `start`, which links with the session).
// Loading, empty, error with retry, 409 (last method, stale version) and the round-trip outcome are announced politely.
// Staff second factor phase 2 (#841): the account holder who signs in with a second factor sees the profile line
// (Google or password and e-mail code; turn on 2-Step Verification); on the person record, the Google link of someone
// else who holds the requirement is removed only through the reset, so "Unlink Google" opens it (`onResetRequest`), or
// stays disabled with a sentence for an administrator who may not reset.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { MemberSkeleton } from '@vereino/ui'
import { PROVIDER_NAMES, startUrl, type IdentityLinkRow, type IdentityListResponse } from './identity-client'
import { ProviderMark } from './ProviderMark'

type Outcome = { kind: 'success' | 'error'; text: string } | null

type Props = {
  /** `GET` source: `/api/foundation/identity/me` or the administrator's `?personId=` list. */
  url: string
  /** The account holder's own list: offers "Connect …" and reads the round-trip outcome. */
  own: boolean
  /** The round-trip outcome from the page URL (`linked` / `failed`), own list only. */
  initialOutcome?: Outcome
  /** The person record: opens "Reset second factor" in place of unlinking a required person's Google link. */
  onResetRequest?: () => void
}

function useIdentityList(url: string) {
  const query = useQuery({
    queryKey: ['foundation-identity-links', url],
    queryFn: async (): Promise<IdentityListResponse> => {
      const call = await apiCall<IdentityListResponse>(url)
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result
    },
  })
  return {
    data: query.data ?? null,
    loading: query.isPending,
    failed: query.isError,
    reload: async () => {
      await query.refetch()
    },
  }
}

function unlinkErrorKey(code: string | null): string {
  if (code === 'identity_last_method') return 'foundation.identity.lastMethod'
  if (code === 'second_factor_reset_required') return 'foundation.errors.second_factor_reset_required'
  if (code === 'optimistic_lock_conflict') return 'foundation.identity.errors.conflict'
  return 'foundation.identity.errors.unlink'
}

export function IdentityLinks({ url, own, initialOutcome = null, onResetRequest }: Props) {
  const t = useT()
  const locale = useLocale()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const { data, loading, failed, reload } = useIdentityList(url)
  const [outcome, setOutcome] = React.useState<Outcome>(initialOutcome)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const formatDate = (value: string) => new Date(value).toLocaleDateString(locale)

  const disconnect = async (link: IdentityLinkRow) => {
    const name = PROVIDER_NAMES[link.provider]
    const confirmed = await confirm({
      title: t('foundation.identity.confirm.title', { provider: name }),
      text: t('foundation.identity.confirm.text', { provider: name }),
      variant: 'destructive',
    })
    if (!confirmed) return
    setBusyId(link.id)
    try {
      const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(link.updatedAt), () =>
        apiCall<{ code?: string }>(`/api/foundation/identity/${link.id}`, { method: 'DELETE' }),
      )
      if (call.ok) setOutcome({ kind: 'success', text: t('foundation.identity.flash.unlinked', { provider: name }) })
      else setOutcome({ kind: 'error', text: t(unlinkErrorKey(errorCodeOf(call.result))) })
    } catch {
      setOutcome({ kind: 'error', text: t('foundation.identity.errors.unlink') })
    } finally {
      setBusyId(null)
      await reload()
    }
  }

  let body: React.ReactNode
  if (loading && !data) {
    body = <MemberSkeleton shape="rows" count={2} label={t('foundation.identity.loading')} />
  } else if (failed || !data) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm">{t('foundation.identity.errors.load')}</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void reload()}>
          {t('foundation.identity.retry')}
        </Button>
      </div>
    )
  } else {
    const connectable = own ? data.providers.filter((provider) => provider.enabled && !provider.linked) : []
    const secondFactor = !own ? data.secondFactor : undefined
    const throughReset = (link: IdentityLinkRow) =>
      Boolean(secondFactor?.unlinkGoogleThroughReset) && link.provider === 'google'
    const resetAvailable = Boolean(secondFactor?.canReset && onResetRequest)
    const routedGoogle = data.items.some(throughReset)
    body = (
      <div className="flex flex-col gap-3">
        {own && data.secondFactorRequired ? (
          <Alert style="light" status="information" data-testid="identity-second-factor-required">
            <AlertDescription>{t('foundation.secondFactor.profile.required')}</AlertDescription>
          </Alert>
        ) : null}
        {data.items.length === 0 ? (
          <p className="text-muted-foreground text-sm" data-testid="identity-links-empty">
            {t('foundation.identity.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.items.map((link) => (
              <li
                key={link.id}
                className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`identity-link-${link.provider}`}
              >
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    <ProviderMark provider={link.provider} />
                    {PROVIDER_NAMES[link.provider]}
                  </span>
                  <span className="break-words">{link.emailAtLink ?? t('foundation.identity.noEmail')}</span>
                  <span className="text-muted-foreground text-xs">
                    {t('foundation.identity.linkedOn', { date: formatDate(link.linkedAt) })}
                    {link.lastSignedInAt
                      ? ` · ${t('foundation.identity.lastSignIn', { date: formatDate(link.lastSignedInAt) })}`
                      : ''}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={
                    throughReset(link) ? !resetAvailable || busyId !== null : !data.canUnlink || busyId !== null
                  }
                  aria-describedby={
                    throughReset(link)
                      ? 'identity-second-factor-unlink'
                      : data.canUnlink
                        ? undefined
                        : 'identity-last-method'
                  }
                  onClick={() => {
                    if (throughReset(link)) onResetRequest?.()
                    else void disconnect(link)
                  }}
                  data-testid={`identity-unlink-${link.provider}`}
                >
                  {t(own ? 'foundation.identity.disconnect' : 'foundation.identity.unlink', {
                    provider: PROVIDER_NAMES[link.provider],
                  })}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {routedGoogle ? (
          <p
            id="identity-second-factor-unlink"
            className="text-muted-foreground text-xs"
            data-testid="identity-second-factor-unlink"
          >
            {t(
              resetAvailable
                ? 'foundation.secondFactor.reset.unlinkGoogle'
                : 'foundation.secondFactor.reset.unlinkGoogleNoReset',
            )}
          </p>
        ) : null}
        {data.items.length > 0 && !data.canUnlink ? (
          <p id="identity-last-method" className="text-muted-foreground text-xs" data-testid="identity-last-method">
            {t(own ? 'foundation.identity.lastMethod' : 'foundation.identity.lastMethodAdmin')}
          </p>
        ) : null}
        {connectable.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {connectable.map((provider) => (
              <Button key={provider.id} asChild variant="outline" className="min-h-11">
                <a href={startUrl(provider.id)} data-testid={`identity-connect-${provider.id}`}>
                  <ProviderMark provider={provider.id} />
                  {t('foundation.identity.connect', { provider: PROVIDER_NAMES[provider.id] })}
                </a>
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" role="status">
        {outcome ? (
          <p
            className={
              outcome.kind === 'success'
                ? 'border-status-success-border bg-status-success-bg text-status-success-text rounded-md border px-3 py-2 text-sm'
                : 'border-status-error-border bg-status-error-bg text-status-error-text rounded-md border px-3 py-2 text-sm'
            }
            data-testid="identity-outcome"
          >
            {outcome.text}
          </p>
        ) : null}
      </div>
      {body}
      {ConfirmDialogElement}
    </div>
  )
}
