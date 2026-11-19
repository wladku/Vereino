'use client'
// `/club/o/[token]` — M-19 (payments spec REQ-032; foundation P-19 `TokenPageShell`; issue #116): the order form from
// a personal link, without signing in. The same form and summary as M-17 for the link guardian's children in the
// campaign's groups; no online payment (transfer with the payer code, or cash to the coach). States: loading, 410
// "Link expired" (an expired link, or a completed campaign), 404 "Invalid link", error with retry. Since #299
// (payments parity spec REQ-C11): above the form, a notice names the link's guardian and asks not to pass it on; the
// child chips link to `?child=`.
import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LanguageSwitcher } from '@open-mercato/ui/frontend/LanguageSwitcher'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { TokenPageShell, type MemberLinkProps, type TokenPageState } from '@vereino/ui'
import { OrderFormSection } from './OrderFormSection'
import { CLUB_ORDERS_HREF, linkEndpoints, orderLinkHref, orderLinkQueryKey, type OrderLinkForm } from './order-client'

type LinkLoad = { status: 'ok'; form: OrderLinkForm } | { status: 'expired' } | { status: 'not_found' }

class LoadError extends Error {}

function RouterLink(props: MemberLinkProps) {
  return (
    <Link href={props.href} className={props.className} aria-current={props['aria-current']}>
      {props.children}
    </Link>
  )
}

export function OrderLinkPage({ token }: { token: string }) {
  const t = useT()
  const searchParams = useSearchParams()
  const childId = searchParams?.get('child') || null
  const queryKey = orderLinkQueryKey(token)
  const endpoints = React.useMemo(() => linkEndpoints(token), [token])
  const query = useQuery({
    queryKey,
    retry: false,
    queryFn: async (): Promise<LinkLoad> => {
      const call = await apiCall<OrderLinkForm>(`/api/payments/order-links/${encodeURIComponent(token)}`)
      if (call.status === 410) return { status: 'expired' }
      if (call.status === 404) return { status: 'not_found' }
      if (!call.ok || !call.result) throw new LoadError(String(call.status))
      return { status: 'ok', form: call.result }
    },
  })
  const load = query.data
  const state: TokenPageState = load ? load.status : query.isError ? 'error' : 'loading'
  const form = load?.status === 'ok' ? load.form : null
  return (
    <TokenPageShell
      state={state}
      clubName={form?.club.name ?? null}
      labels={{
        title: t('payments.orders.link.title'),
        loading: t('payments.orders.club.loading'),
        expiredTitle: t('payments.orders.link.expired.title'),
        expiredMessage: t('payments.orders.link.expired.message'),
        notFoundTitle: t('payments.orders.link.notFound.title'),
        notFoundMessage: t('payments.orders.link.notFound.message'),
        errorMessage: t('payments.orders.club.errors.load'),
        retry: t('payments.club.retry'),
        requestLink: t('payments.orders.link.signIn'),
      }}
      requestLinkHref={`/login?redirect=${encodeURIComponent(CLUB_ORDERS_HREF)}`}
      Link={RouterLink}
      onRetry={() => void query.refetch()}
      headerEnd={<LanguageSwitcher />}
    >
      {form ? (
        <div className="flex flex-col gap-6">
          <Alert status="information" data-testid="order-link-guardian">
            <p className="font-medium">
              {t('payments.orders.link.personalLink', {
                name: `${form.guardian.firstName} ${form.guardian.lastName}`.trim(),
              })}
            </p>
            <p>{t('payments.orders.link.personalLinkText')}</p>
          </Alert>
          <OrderFormSection
            form={form}
            mode="link"
            endpoints={endpoints}
            queryKey={queryKey}
            childId={childId}
            childHref={(personId) => orderLinkHref(token, personId)}
          />
        </div>
      ) : null}
    </TokenPageShell>
  )
}
