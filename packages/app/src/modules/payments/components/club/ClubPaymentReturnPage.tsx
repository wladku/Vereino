'use client'
// `/club/payments/return?checkout=…` — M-09 (payments spec UI row `/club/payments/return`, DD-42, REQ-012; README
// M-09, flow F-07; #110): the result after the payment form confirms or Stripe redirects back. Each read runs the
// fulfilment (`POST /api/payments/checkouts/{id}/refresh`), so a capture is booked even before its webhook lands.
// "Payment received"; "Payment in progress" refreshes by itself every 3 s for 30 s, then offers "Refresh status" (a
// gateway error keeps it in progress); "Payment interrupted — the charges are still open".
import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatZloty } from '../../lib/charge-ledger'
import {
  RETURN_POLL_INTERVAL_MS,
  RETURN_POLL_WINDOW_MS,
  shouldAutoRefresh,
  type ReturnState,
} from '../../lib/checkout-rules'
import { MY_CHARGES_QUERY_KEY } from './ClubPaymentsPage'
import { CLUB_PAYMENTS_HREF, PaymentsClubFrame } from './PaymentsClubFrame'

type Refreshed = {
  id: string
  state: ReturnState
  total: number
  charges: { id: string; description: string; status: string; amountDue: number }[]
}

type ReturnLoad = { kind: 'ok'; checkout: Refreshed } | { kind: 'pending' } | { kind: 'forbidden' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function BackLink() {
  const t = useT()
  return (
    <Link href={CLUB_PAYMENTS_HREF} className="text-primary inline-flex min-h-11 items-center underline">
      {t('payments.club.return.back')}
    </Link>
  )
}

function Result({ checkoutId }: { checkoutId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  // The auto-refresh window: every 3 s for 30 s from opening the page, then the "Refresh status" button.
  const [windowOver, setWindowOver] = React.useState(false)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setWindowOver(true)
    }, RETURN_POLL_WINDOW_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [])
  const elapsed = windowOver ? RETURN_POLL_WINDOW_MS : 0
  const query = useQuery({
    queryKey: ['payments-checkout-return', checkoutId],
    queryFn: async (): Promise<ReturnLoad> => {
      const call = await apiCall<Refreshed>(`/api/payments/checkouts/${encodeURIComponent(checkoutId)}/refresh`, {
        method: 'POST',
      })
      if (call.ok && call.result) return { kind: 'ok', checkout: call.result }
      if (call.status === 403 || call.status === 404) return { kind: 'forbidden' }
      // A gateway or network error is not a result yet: the payment stays "in progress".
      return { kind: 'pending' }
    },
    refetchInterval: (current) => {
      const data = current.state.data
      const state: ReturnState = data?.kind === 'ok' ? data.checkout.state : 'in_progress'
      return data?.kind !== 'forbidden' && shouldAutoRefresh(state, elapsed) ? RETURN_POLL_INTERVAL_MS : false
    },
  })
  const data = query.data
  const received = data?.kind === 'ok' && data.checkout.state === 'received'
  React.useEffect(() => {
    if (received) void queryClient.invalidateQueries({ queryKey: MY_CHARGES_QUERY_KEY })
  }, [received, queryClient])

  if (!data) return <LoadingMessage label={t('payments.club.return.loading')} />
  if (data.kind === 'forbidden') {
    return (
      <>
        <p className="text-muted-foreground" data-testid="club-payment-return-forbidden">
          {t('payments.club.return.forbidden')}
        </p>
        <BackLink />
      </>
    )
  }
  const state: ReturnState = data.kind === 'ok' ? data.checkout.state : 'in_progress'
  const charges = data.kind === 'ok' ? data.checkout.charges : []
  if (state === 'received') {
    return (
      <>
        <Alert status="success" data-testid="club-payment-return" data-state="received">
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{t('payments.club.return.received.title')}</p>
            <p>{t('payments.club.return.received.body')}</p>
          </div>
        </Alert>
        {charges.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {charges.map((charge) => (
              <li key={charge.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3">
                <span className="break-words">{charge.description}</span>
                <span>{formatZloty(charge.amountDue)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <BackLink />
      </>
    )
  }
  if (state === 'interrupted') {
    return (
      <>
        <Alert status="warning" data-testid="club-payment-return" data-state="interrupted">
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{t('payments.club.return.interrupted.title')}</p>
            <p>{t('payments.club.return.interrupted.body')}</p>
          </div>
        </Alert>
        <BackLink />
      </>
    )
  }
  const polling = shouldAutoRefresh('in_progress', elapsed)
  return (
    <>
      <Alert status="information" data-testid="club-payment-return" data-state="in_progress">
        <div className="flex flex-col gap-1" aria-live="polite">
          <p className="font-semibold">{t('payments.club.return.inProgress.title')}</p>
          <p>{polling ? t('payments.club.return.inProgress.polling') : t('payments.club.return.inProgress.stopped')}</p>
        </div>
      </Alert>
      {!polling ? (
        <div>
          <Button
            type="button"
            className="min-h-11"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            data-testid="club-payment-return-refresh"
          >
            {t('payments.club.return.refresh')}
          </Button>
        </div>
      ) : null}
      <BackLink />
    </>
  )
}

function Return() {
  const t = useT()
  const params = useSearchParams()
  const checkoutId = params.get('checkout') ?? ''
  return (
    <>
      <h1 className="text-2xl font-semibold">{t('payments.club.return.title')}</h1>
      {UUID.test(checkoutId) ? (
        <Result checkoutId={checkoutId} />
      ) : (
        <>
          <p className="text-muted-foreground" data-testid="club-payment-return-missing">
            {t('payments.club.return.missing')}
          </p>
          <BackLink />
        </>
      )}
    </>
  )
}

export function ClubPaymentReturnPage() {
  return (
    <PaymentsClubFrame>
      {() => (
        <React.Suspense fallback={null}>
          <Return />
        </React.Suspense>
      )}
    </PaymentsClubFrame>
  )
}
