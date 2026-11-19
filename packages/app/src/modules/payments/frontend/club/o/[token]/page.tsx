import { Suspense } from 'react'
import { OrderLinkPage } from '../../../../components/club/orders/OrderLinkPage'

/**
 * `/club/o/[token]` — the kit order from a personal link (payments spec REQ-032; foundation P-19; M-19; #116).
 * Sessionless; the data comes from `GET /api/payments/order-links/{token}`; `?child=<personId>` picks the child (#299).
 */
export default function OrderLinkRoute({ params }: { params?: { token?: string } }) {
  return (
    <Suspense>
      <OrderLinkPage token={params?.token ?? ''} />
    </Suspense>
  )
}
