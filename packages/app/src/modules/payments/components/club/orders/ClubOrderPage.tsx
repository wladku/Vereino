'use client'
// `/club/orders/[campaignId]` — M-17 (payments spec REQ-032; issue #116). Signed in, the payer orders for a child in
// the member frame (`OrderFormSection`, online payment through M-08). Without a session — a guardian who opened the
// share link — the page shows the campaign card (`?club=<slug>` names the club) with "Sign in" and "Send me a
// personal link": the request always answers the same, whether the address is known or not. Without a club slug only
// "Sign in" is offered. The session is probed with the form read, without the platform's sign-in redirect.
import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LanguageSwitcher } from '@open-mercato/ui/frontend/LanguageSwitcher'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { PaymentsClubFrame } from '../PaymentsClubFrame'
import { OrderFormSection } from './OrderFormSection'
import { appEndpoints, clubOrderHref, orderFormQueryKey, type OrderForm } from './order-client'

type FormLoad = { status: 'ok'; form: OrderForm } | { status: 'signed_out' } | { status: 'not_found' }

class LoadError extends Error {}

type PublicCard = {
  club: { name: string }
  campaign: { id: string; name: string; description: string | null; closesOn: string; ordersOpen: boolean }
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  )
}

function SignedOut({ campaignId, clubSlug }: { campaignId: string; clubSlug: string | null }) {
  const t = useT()
  const locale = useLocale()
  const ids = React.useId()
  const [email, setEmail] = React.useState('')
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent' | 'invalid' | 'error'>('idle')
  const card = useQuery({
    queryKey: ['payments-order-card', campaignId, clubSlug],
    enabled: clubSlug !== null,
    queryFn: async () => {
      const call = await apiCall<PublicCard>(
        `/api/payments/public/order-campaigns/${encodeURIComponent(campaignId)}?club=${encodeURIComponent(clubSlug ?? '')}`,
      )
      if (call.status === 404) return null
      if (!call.ok || !call.result) throw new LoadError(String(call.status))
      return call.result
    },
  })
  const signInHref = `/login?redirect=${encodeURIComponent(clubOrderHref(campaignId))}`

  const request = async (event: React.SyntheticEvent) => {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setState('invalid')
      return
    }
    setState('sending')
    try {
      const call = await apiCall(
        `/api/payments/public/order-campaigns/${encodeURIComponent(campaignId)}/link-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), clubSlug }),
        },
      )
      setState(call.status === 202 ? 'sent' : call.status === 400 ? 'invalid' : 'error')
    } catch {
      setState('error')
    }
  }

  const campaign = card.data?.campaign ?? null
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="font-semibold">{card.data?.club.name ?? t('payments.orders.club.listTitle')}</span>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6" data-testid="order-signed-out">
        {card.isLoading ? <LoadingMessage label={t('payments.orders.club.loading')} /> : null}
        {campaign ? (
          <section className="flex flex-col gap-2" data-testid="order-card">
            <h1 className="text-2xl font-semibold">{campaign.name}</h1>
            {campaign.description ? (
              <p className="text-muted-foreground max-w-prose whitespace-pre-line">{campaign.description}</p>
            ) : null}
            <p className="text-sm">
              {campaign.ordersOpen
                ? t('payments.orders.club.deadline', { date: formatDate(campaign.closesOn, locale) })
                : t('payments.orders.club.closed')}
            </p>
          </section>
        ) : (
          <h1 className="text-2xl font-semibold">{t('payments.orders.club.signedOut.title')}</h1>
        )}
        <section className="flex flex-col gap-3">
          <p className="max-w-prose">{t('payments.orders.club.signedOut.signInHint')}</p>
          <div>
            <Button asChild className="min-h-11">
              <a href={signInHref} data-testid="order-sign-in">
                {t('payments.orders.club.signedOut.signIn')}
              </a>
            </Button>
          </div>
        </section>
        {clubSlug && (!campaign || campaign.ordersOpen) ? (
          <section className="flex flex-col gap-3" aria-labelledby={`${ids}-link`}>
            <h2 id={`${ids}-link`} className="text-lg font-semibold">
              {t('payments.orders.club.signedOut.linkTitle')}
            </h2>
            <p className="text-muted-foreground max-w-prose text-sm">{t('payments.orders.club.signedOut.linkHint')}</p>
            {state === 'sent' ? (
              <Alert status="success" data-testid="order-link-sent">
                <p>{t('payments.orders.club.signedOut.sent')}</p>
              </Alert>
            ) : (
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(event) => void request(event)}
                noValidate
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${ids}-email`}>{t('payments.orders.club.email')}</Label>
                  <Input
                    id={`${ids}-email`}
                    type="email"
                    autoComplete="email"
                    className="min-h-11 sm:w-72"
                    value={email}
                    aria-invalid={state === 'invalid'}
                    onChange={(event) => {
                      setEmail(event.target.value)
                    }}
                    data-testid="order-link-email"
                  />
                </div>
                <Button
                  type="submit"
                  className="min-h-11"
                  disabled={state === 'sending'}
                  data-testid="order-link-request"
                >
                  {t('payments.orders.club.signedOut.send')}
                </Button>
              </form>
            )}
            {state === 'invalid' ? (
              <p className="text-destructive text-sm" role="alert">
                {t('payments.orders.club.signedOut.invalid')}
              </p>
            ) : null}
            {state === 'error' ? (
              <p className="text-destructive text-sm" role="alert">
                {t('payments.orders.club.signedOut.error')}
              </p>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  )
}

export function ClubOrderPage({ campaignId }: { campaignId: string }) {
  const t = useT()
  const searchParams = useSearchParams()
  const clubSlug = searchParams?.get('club') || null
  const childId = searchParams?.get('child') || null
  const queryKey = orderFormQueryKey(campaignId)
  const endpoints = React.useMemo(() => appEndpoints(campaignId), [campaignId])
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<FormLoad> => {
      const call = await apiCall<OrderForm>(`/api/payments/order-campaigns/${encodeURIComponent(campaignId)}/form`, {
        headers: { 'x-om-unauthorized-redirect': '0' },
      })
      if (call.status === 401) return { status: 'signed_out' }
      if (call.status === 404 || call.status === 400) return { status: 'not_found' }
      if (!call.ok || !call.result) throw new LoadError(String(call.status))
      return { status: 'ok', form: call.result }
    },
  })
  if (query.data?.status === 'signed_out') return <SignedOut campaignId={campaignId} clubSlug={clubSlug} />
  // The member frame reads the profile with the platform's 401 redirect, so it waits until the probe says signed in
  // (lesson `optional-session-page-disables-401-redirect`).
  if (query.isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <LoadingMessage label={t('payments.orders.club.loading')} />
      </main>
    )
  }
  return (
    <PaymentsClubFrame>
      {() => {
        if (query.data?.status === 'not_found') {
          return (
            <Alert status="information" data-testid="order-not-found">
              <p>{t('payments.orders.club.notFound')}</p>
            </Alert>
          )
        }
        if (query.data?.status !== 'ok') {
          return (
            <ErrorMessage
              label={t('payments.orders.club.errors.load')}
              action={
                <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
                  {t('payments.club.retry')}
                </Button>
              }
            />
          )
        }
        return (
          <OrderFormSection
            form={query.data.form}
            mode="app"
            endpoints={endpoints}
            queryKey={queryKey}
            initialChildId={childId}
          />
        )
      }}
    </PaymentsClubFrame>
  )
}
