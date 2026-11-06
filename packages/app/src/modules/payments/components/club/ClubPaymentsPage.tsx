'use client'
// `/club/payments` — M-08 (payments spec UI row `/club/payments`, DD-42, REQ-012, R13; README M-08, flow F-07; #110):
// the payer's charges still to pay with a checkbox each, the quote of the selection (the online fee line in
// `payer_pays` mode) and "Pay", which starts the checkout and renders the gateway's embedded payment form (the Stripe
// Payment Element). A charge without a payer is shown disabled: "No payer — contact the club". Paid charges follow.
// After the form confirms, the page goes to M-09 (`/club/payments/return?checkout=…`), which is also Stripe's return
// URL for methods that redirect.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  getEmbeddedPaymentGatewayRenderer,
  type PaymentGatewayRendererProps,
} from '@open-mercato/shared/modules/payment_gateways/client'
import type { EmbeddedPaymentGatewayClientSession } from '@open-mercato/shared/modules/payment_gateways/types'
import { formatZloty } from '../../lib/charge-ledger'
import { CLUB_PAYMENTS_HREF, PaymentsClubFrame } from './PaymentsClubFrame'

export const MY_CHARGES_QUERY_KEY = ['payments-my-charges'] as const

export type MyCharge = {
  id: string
  description: string
  person: { firstName: string; lastName: string } | null
  dueDate: string
  amountDue: number
  paid: number
  remaining: number
  status: string
  overdue: boolean
  payerMissing: boolean
  payable: boolean
}

export type MyCheckout = { id: string; state: string; total: number; createdAt: string }

type MyChargesResponse = { items: MyCharge[]; total: number; checkouts: MyCheckout[] }

type Quote = { amount: number; feeAmount: number; total: number }

type Started = {
  checkoutId: string
  providerKey: string
  clientSession: EmbeddedPaymentGatewayClientSession | { type: string } | null
  total: number
}

const TO_PAY: readonly string[] = ['open', 'partially_paid']

export function returnHref(checkoutId: string): string {
  return `${CLUB_PAYMENTS_HREF}/return?checkout=${encodeURIComponent(checkoutId)}`
}

function errorText(result: unknown, fallback: string): string {
  const message = (result as { error?: unknown } | null)?.error
  return typeof message === 'string' && message.length > 0 ? message : fallback
}

function formatDate(value: string, locale: string): string {
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

function ChargeRow({
  charge,
  selected,
  onToggle,
  disabled,
}: {
  charge: MyCharge
  selected: boolean
  onToggle: (id: string) => void
  disabled: boolean
}) {
  const t = useT()
  const locale = useLocale()
  const inputId = `club-charge-${charge.id}`
  const hint = charge.payerMissing
    ? t('payments.club.charges.noPayer')
    : charge.payable
      ? null
      : t('payments.club.charges.partlyPaid')
  const name = charge.person ? `${charge.person.firstName} ${charge.person.lastName}` : null
  return (
    <li
      className="bg-card flex items-start gap-3 rounded-lg border p-4"
      data-testid="club-charge"
      data-charge-id={charge.id}
      data-payable={charge.payable ? 'true' : 'false'}
    >
      <input
        id={inputId}
        type="checkbox"
        className="mt-1 size-5 shrink-0"
        checked={selected}
        disabled={!charge.payable || disabled}
        aria-describedby={hint ? `${inputId}-hint` : undefined}
        onChange={() => {
          onToggle(charge.id)
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={inputId} className="font-semibold break-words">
          {charge.description}
        </label>
        <span className="text-muted-foreground text-sm">
          {[name, t('payments.club.charges.due', { date: formatDate(charge.dueDate, locale) })]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{formatZloty(charge.remaining)}</span>
          {charge.overdue ? <StatusBadge variant="error">{t('payments.club.charges.overdue')}</StatusBadge> : null}
          {charge.status === 'partially_paid' ? (
            <StatusBadge variant="warning">{t('payments.club.charges.status.partially_paid')}</StatusBadge>
          ) : null}
        </span>
        {hint ? (
          <span id={`${inputId}-hint`} className="text-muted-foreground text-sm" data-testid="club-charge-hint">
            {hint}
          </span>
        ) : null}
      </div>
    </li>
  )
}

function QuoteLines({ quote }: { quote: Quote }) {
  const t = useT()
  return (
    <dl className="flex flex-col gap-1 text-sm" data-testid="club-payments-quote">
      <div className="flex justify-between gap-3">
        <dt>{t('payments.club.quote.charges')}</dt>
        <dd data-testid="club-payments-quote-amount">{formatZloty(quote.amount)}</dd>
      </div>
      {quote.feeAmount > 0 ? (
        <div className="flex justify-between gap-3">
          <dt>{t('payments.club.quote.fee')}</dt>
          <dd data-testid="club-payments-quote-fee">{formatZloty(quote.feeAmount)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-3 border-t pt-1 text-base font-semibold">
        <dt>{t('payments.club.quote.total')}</dt>
        <dd data-testid="club-payments-quote-total">{formatZloty(quote.total)}</dd>
      </div>
    </dl>
  )
}

function PaymentForm({ started, onCancel }: { started: Started; onCancel: () => void }) {
  const t = useT()
  const router = useRouter()
  const [error, setError] = React.useState('')
  const session = started.clientSession
  const embedded = session && session.type === 'embedded' ? (session as EmbeddedPaymentGatewayClientSession) : null
  const Renderer = embedded ? getEmbeddedPaymentGatewayRenderer(started.providerKey, embedded.rendererKey) : undefined
  const target = returnHref(started.checkoutId)
  const withReturn = React.useMemo<EmbeddedPaymentGatewayClientSession | null>(() => {
    if (!embedded) return null
    const returnUrl = typeof window === 'undefined' ? target : `${window.location.origin}${target}`
    return { ...embedded, payload: { ...(embedded.payload ?? {}), returnUrl } }
  }, [embedded, target])
  const onComplete = React.useCallback(() => {
    router.push(target)
  }, [router, target])
  const props: PaymentGatewayRendererProps | null = withReturn
    ? {
        providerKey: started.providerKey,
        transactionId: started.checkoutId,
        session: withReturn,
        onComplete,
        onError: setError,
      }
    : null
  return (
    <section aria-labelledby="club-payment-form" className="flex flex-col gap-3" data-testid="club-payment-form">
      <h2 id="club-payment-form" className="text-lg font-semibold">
        {t('payments.club.form.title', { total: formatZloty(started.total) })}
      </h2>
      {Renderer && props ? (
        React.createElement(Renderer, props)
      ) : (
        <Alert status="error">{t('payments.club.form.unavailable')}</Alert>
      )}
      {error ? <Alert status="error">{error}</Alert> : null}
      <div>
        <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>
          {t('payments.club.form.back')}
        </Button>
      </div>
    </section>
  )
}

function Payments() {
  const t = useT()
  const queryClient = useQueryClient()
  const [selected, setSelected] = React.useState<string[]>([])
  const [started, setStarted] = React.useState<Started | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [startError, setStartError] = React.useState('')
  const charges = useQuery({
    queryKey: MY_CHARGES_QUERY_KEY,
    queryFn: async (): Promise<MyChargesResponse> => {
      const call = await apiCall<MyChargesResponse>('/api/payments/my-charges?pageSize=100')
      if (!call.ok || !call.result) throw new Error(errorText(call.result, String(call.status)))
      return call.result
    },
  })
  const selection = React.useMemo(() => [...selected].sort(), [selected])
  const quote = useQuery({
    queryKey: ['payments-quote', selection],
    enabled: selection.length > 0,
    queryFn: async (): Promise<Quote> => {
      const call = await apiCall<Quote>('/api/payments/checkout/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chargeIds: selection }),
      })
      if (!call.ok || !call.result) throw new Error(errorText(call.result, t('payments.club.errors.quote')))
      return call.result
    },
  })

  const toggle = React.useCallback((id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }, [])

  const pay = async () => {
    setStarting(true)
    setStartError('')
    const call = await apiCall<Started>('/api/payments/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chargeIds: selection }),
    })
    setStarting(false)
    if (!call.ok || !call.result) {
      setStartError(errorText(call.result, t('payments.club.errors.checkout')))
      void queryClient.invalidateQueries({ queryKey: MY_CHARGES_QUERY_KEY })
      return
    }
    setStarted(call.result)
  }

  if (!charges.data && charges.isFetching) return <LoadingMessage label={t('payments.club.loading')} />
  if (!charges.data) {
    return (
      <ErrorMessage
        label={t('payments.club.errors.charges')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void charges.refetch()}>
            {t('payments.club.retry')}
          </Button>
        }
      />
    )
  }
  const toPay = charges.data.items.filter((charge) => TO_PAY.includes(charge.status))
  const paid = charges.data.items.filter((charge) => charge.status === 'paid')
  const inProgress = charges.data.checkouts.find((checkout) => checkout.state === 'in_progress')

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('payments.club.title')}</h1>
      {inProgress && !started ? (
        <Alert status="information" data-testid="club-payments-in-progress">
          <div className="flex flex-col gap-2">
            <p>{t('payments.club.inProgressBanner', { total: formatZloty(inProgress.total) })}</p>
            <Link href={returnHref(inProgress.id)} className="text-primary inline-flex min-h-11 items-center underline">
              {t('payments.club.inProgressLink')}
            </Link>
          </div>
        </Alert>
      ) : null}
      {started ? (
        <PaymentForm
          started={started}
          onCancel={() => {
            setStarted(null)
          }}
        />
      ) : (
        <section aria-labelledby="club-payments-to-pay" className="flex flex-col gap-3">
          <h2 id="club-payments-to-pay" className="text-lg font-semibold">
            {t('payments.club.toPay')}
          </h2>
          {toPay.length === 0 ? (
            <p className="text-muted-foreground" data-testid="club-payments-empty">
              {t('payments.club.allPaid')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {toPay.map((charge) => (
                <ChargeRow
                  key={charge.id}
                  charge={charge}
                  selected={selected.includes(charge.id)}
                  onToggle={toggle}
                  disabled={starting}
                />
              ))}
            </ul>
          )}
          {selection.length > 0 ? (
            <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
              {quote.data ? <QuoteLines quote={quote.data} /> : null}
              {quote.isError ? (
                <Alert status="error">
                  {quote.error instanceof Error ? quote.error.message : t('payments.club.errors.quote')}
                </Alert>
              ) : null}
              {startError ? (
                <Alert status="error" data-testid="club-payments-error">
                  {startError}
                </Alert>
              ) : null}
              <div>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={starting || !quote.data}
                  onClick={() => void pay()}
                  data-testid="club-payments-pay"
                >
                  {quote.data
                    ? t('payments.club.pay', { total: formatZloty(quote.data.total) })
                    : t('payments.club.payPending')}
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      )}
      {paid.length > 0 ? (
        <section aria-labelledby="club-payments-paid" className="flex flex-col gap-3">
          <h2 id="club-payments-paid" className="text-lg font-semibold">
            {t('payments.club.paid')}
          </h2>
          <ul className="flex flex-col gap-2">
            {paid.map((charge) => (
              <li
                key={charge.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                data-testid="club-charge-paid"
              >
                <span className="break-words">{charge.description}</span>
                <span className="flex items-center gap-2">
                  <span>{formatZloty(charge.amountDue)}</span>
                  <StatusBadge variant="success">{t('payments.club.charges.status.paid')}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

export function ClubPaymentsPage() {
  return <PaymentsClubFrame>{() => <Payments />}</PaymentsClubFrame>
}
