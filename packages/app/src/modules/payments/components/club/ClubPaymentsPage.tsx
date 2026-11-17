'use client'
// `/club/payments` — M-08 (payments spec UI row `/club/payments`, DD-42, REQ-012, R13; README M-08, flow F-07; #110):
// the payer's charges still to pay with a checkbox each, the quote of the selection (the online fee line in
// `payer_pays` mode) and "Pay", which starts the checkout and renders the gateway's embedded payment form (the Stripe
// Payment Element). A charge without a payer is shown disabled: "No payer — contact the club". Paid charges follow.
// After the form confirms, the page goes to M-09 (`/club/payments/return?checkout=…`), which is also Stripe's return
// URL for methods that redirect. Since #111 each charge names its period and discount, the paid history lists up to six
// charges, and the transfer instructions show the club's account, its name and the payer code `GW-XXXX` for the title.
// Since #298 (payments parity spec REQ-C10, the M-08 wireframe): every payable charge is ticked on entry (`?pay={id}`
// ticks only that one), so the quote is asked once and paying takes two taps; a `partially_paid` charge is payable for
// what remains (DD-C07); the fee line always shows ("0 zł — paid by the club" in `club_pays`); the discount names its
// rule; the first open order campaign covering the caller's children is announced above the list; a ward another
// guardian pays reads "{child}: paid by {first name}" without a checkbox or an amount (DD-C06); on a phone the summary
// and the pay button stay in view above the bottom navigation.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
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
import { formatBankAccount } from '@vereino/core'
import { MemberSkeleton } from '@vereino/ui'
import { formatZloty } from '../../lib/charge-ledger'
import { CLUB_PAYMENTS_HREF, PaymentsClubFrame } from './PaymentsClubFrame'

export const MY_CHARGES_QUERY_KEY = ['payments-my-charges'] as const

export type MyCharge = {
  id: string
  description: string
  person: { firstName: string; lastName: string } | null
  periodLabel: string | null
  dueDate: string
  amountDue: number
  discountAmount: number
  discountName: string | null
  paid: number
  remaining: number
  status: string
  overdue: boolean
  payerMissing: boolean
  payable: boolean
}

export type MyCheckout = { id: string; state: string; total: number; createdAt: string }

export type TransferInstructions = { bankAccount: string | null; recipient: string | null; payerCode: string }

export type OtherPayer = { wardFirstName: string; payerFirstName: string }

type MyChargesResponse = {
  items: MyCharge[]
  total: number
  checkouts: MyCheckout[]
  history: MyCharge[]
  transfer: TransferInstructions | null
  otherPayers: OtherPayer[]
}

type Quote = { amount: number; feeAmount: number; total: number; feeMode: 'club_pays' | 'payer_pays' }

type MyOrderCampaign = {
  id: string
  name: string
  closesOn: string
  status: string
  children: { state: string }[]
}

/** The orders read answers 403 to a payer without `payments.orders.place`: no card then, and no redirect. */
const NO_FORBIDDEN_REDIRECT: RequestInit = { headers: { 'x-om-forbidden-redirect': '0' } }

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

function formatDate(value: string, locale: string, short = false): string {
  const date = new Date(`${value}T12:00:00Z`)
  const style: Intl.DateTimeFormatOptions = short
    ? { day: 'numeric', month: 'numeric', timeZone: 'UTC' }
    : { dateStyle: 'medium', timeZone: 'UTC' }
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, style).format(date)
}

/** The charges ticked on entry: every payable one, or only `?pay={id}` when the link names one (REQ-C10). */
function initialSelection(payable: ReadonlySet<string>, pay: string | null): string[] {
  if (pay) return payable.has(pay) ? [pay] : []
  return [...payable]
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
      : t('payments.club.charges.notPayable')
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
          {[name, charge.periodLabel, t('payments.club.charges.due', { date: formatDate(charge.dueDate, locale) })]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {charge.discountAmount > 0 ? (
          <span className="text-muted-foreground text-sm" data-testid="club-charge-discount">
            {charge.discountName
              ? t('payments.club.charges.discountNamed', {
                  name: charge.discountName,
                  amount: formatZloty(charge.discountAmount),
                })
              : t('payments.club.charges.discount', { amount: formatZloty(charge.discountAmount) })}
          </span>
        ) : null}
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
      <div className="flex justify-between gap-3">
        <dt>{t('payments.club.quote.fee')}</dt>
        <dd className="text-right" data-testid="club-payments-quote-fee" data-fee-mode={quote.feeMode}>
          {quote.feeMode === 'club_pays'
            ? t('payments.club.quote.feeClub', { amount: formatZloty(0) })
            : formatZloty(quote.feeAmount)}
        </dd>
      </div>
      <div className="flex justify-between gap-3 border-t pt-1 text-base font-semibold">
        <dt>{t('payments.club.quote.total')}</dt>
        <dd data-testid="club-payments-quote-total">{formatZloty(quote.total)}</dd>
      </div>
    </dl>
  )
}

function OtherPayerRow({ other }: { other: OtherPayer }) {
  const t = useT()
  return (
    <li className="bg-card text-muted-foreground rounded-lg border p-4 text-sm" data-testid="club-other-payer">
      {t('payments.club.otherPayer', { child: other.wardFirstName, name: other.payerFirstName })}
    </li>
  )
}

/** The first open campaign covering the caller's children (the mockup's `kitPayHint`); nothing when there is none. */
function CampaignCard() {
  const t = useT()
  const locale = useLocale()
  const campaigns = useQuery({
    queryKey: ['payments-my-orders'],
    queryFn: async (): Promise<MyOrderCampaign[]> => {
      const call = await apiCall<{ items: MyOrderCampaign[] }>('/api/payments/my-orders', NO_FORBIDDEN_REDIRECT)
      return call.ok && call.result ? call.result.items : []
    },
    retry: false,
  })
  const campaign = campaigns.data?.find((item) => item.status === 'open' && item.children.length > 0)
  if (!campaign) return null
  const toOrder = campaign.children.some((child) => child.state === 'not_ordered')
  return (
    <Link
      href={`/club/orders/${encodeURIComponent(campaign.id)}`}
      className="bg-card flex min-h-11 flex-col gap-1 rounded-lg border p-4"
      data-testid="club-payments-campaign"
      data-to-order={toOrder ? 'true' : 'false'}
    >
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold break-words">{campaign.name}</span>
        <StatusBadge variant="info">
          {t('payments.club.campaign.until', { date: formatDate(campaign.closesOn, locale, true) })}
        </StatusBadge>
      </span>
      <span className="text-muted-foreground text-sm">
        {t(toOrder ? 'payments.club.campaign.orderForChild' : 'payments.club.campaign.seeOrders')}
      </span>
    </Link>
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

export function TransferDetails({ transfer }: { transfer: TransferInstructions }) {
  const t = useT()
  return (
    <section
      aria-labelledby="club-payments-transfer"
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      data-testid="club-payments-transfer"
    >
      <h2 id="club-payments-transfer" className="text-lg font-semibold">
        {t('payments.club.transfer.title')}
      </h2>
      {transfer.bankAccount ? (
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3 sm:gap-x-4">
          {transfer.recipient ? (
            <>
              <dt className="text-muted-foreground">{t('payments.club.transfer.recipient')}</dt>
              <dd className="font-medium break-words sm:col-span-2">{transfer.recipient}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{t('payments.club.transfer.account')}</dt>
          <dd className="font-medium break-all sm:col-span-2" data-testid="club-payments-transfer-account">
            {formatBankAccount(transfer.bankAccount)}
          </dd>
          <dt className="text-muted-foreground">{t('payments.club.transfer.reference')}</dt>
          <dd className="font-medium sm:col-span-2" data-testid="club-payments-transfer-code">
            {transfer.payerCode}
          </dd>
        </dl>
      ) : (
        <>
          <p className="text-muted-foreground text-sm" data-testid="club-payments-transfer-missing">
            {t('payments.club.transfer.noAccount')}
          </p>
          <p className="text-sm">
            {t('payments.club.transfer.reference')}:{' '}
            <span className="font-medium" data-testid="club-payments-transfer-code">
              {transfer.payerCode}
            </span>
          </p>
        </>
      )}
      <p className="text-muted-foreground text-sm">{t('payments.club.transfer.hint', { code: transfer.payerCode })}</p>
    </section>
  )
}

function Payments() {
  const t = useT()
  const queryClient = useQueryClient()
  const pay = useSearchParams().get('pay')
  // Null until the payer changes the selection: until then it is what `initialSelection` ticks on entry.
  const [selected, setSelected] = React.useState<string[] | null>(null)
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
  // Only what is still payable: a charge paid or changed meanwhile drops out of the selection when the list reloads.
  const payableIds = React.useMemo(
    () => new Set((charges.data?.items ?? []).filter((charge) => charge.payable).map((charge) => charge.id)),
    [charges.data],
  )
  const selection = React.useMemo(
    () => (selected ?? initialSelection(payableIds, pay)).filter((id) => payableIds.has(id)).sort(),
    [selected, payableIds, pay],
  )
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

  const toggle = React.useCallback(
    (id: string) => {
      setSelected((stored) => {
        const current = stored ?? initialSelection(payableIds, pay)
        return current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
      })
    },
    [payableIds, pay],
  )

  const startPayment = async () => {
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

  if (!charges.data && charges.isFetching) return <MemberSkeleton shape="rows" label={t('payments.club.loading')} />
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
  const otherPayers = charges.data.otherPayers
  const history = charges.data.history
  const inProgress = charges.data.checkouts.find((checkout) => checkout.state === 'in_progress')

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('payments.club.title')}</h1>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/club/orders" data-testid="club-payments-orders">
            {t('payments.orders.club.listTitle')}
          </Link>
        </Button>
      </div>
      {started ? null : <CampaignCard />}
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
          {toPay.length === 0 && otherPayers.length === 0 ? (
            <p className="text-muted-foreground" data-testid="club-payments-empty">
              {t('payments.club.allPaid')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {toPay.map((charge) => (
                <ChargeRow
                  key={charge.id}
                  charge={charge}
                  selected={selection.includes(charge.id)}
                  onToggle={toggle}
                  disabled={starting}
                />
              ))}
              {otherPayers.map((other) => (
                <OtherPayerRow key={`${other.wardFirstName}-${other.payerFirstName}`} other={other} />
              ))}
            </ul>
          )}
          {selection.length > 0 ? (
            // On a phone the summary and the button stay in view above the fixed bottom navigation (6 rem clears its
            // 4 rem and a phone's safe area), as the attendance page's actions do.
            <div
              className="bg-card sticky bottom-24 z-30 flex flex-col gap-3 rounded-lg border p-4 shadow-sm sm:static sm:shadow-none"
              aria-live="polite"
              data-testid="club-payments-summary"
            >
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
                  onClick={() => void startPayment()}
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
      {history.length > 0 ? (
        <section aria-labelledby="club-payments-paid" className="flex flex-col gap-3">
          <h2 id="club-payments-paid" className="text-lg font-semibold">
            {t('payments.club.paid')}
          </h2>
          <ul className="flex flex-col gap-2">
            {history.map((charge) => (
              <li
                key={charge.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                data-testid="club-charge-paid"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="break-words">{charge.description}</span>
                  <span className="text-muted-foreground text-sm">
                    {[charge.person ? `${charge.person.firstName} ${charge.person.lastName}` : null, charge.periodLabel]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span>{formatZloty(charge.amountDue)}</span>
                  <StatusBadge variant="success">{t('payments.club.charges.status.paid')}</StatusBadge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {charges.data.transfer ? <TransferDetails transfer={charges.data.transfer} /> : null}
    </>
  )
}

export function ClubPaymentsPage() {
  return (
    <PaymentsClubFrame>
      {() => (
        <React.Suspense fallback={null}>
          <Payments />
        </React.Suspense>
      )}
    </PaymentsClubFrame>
  )
}
