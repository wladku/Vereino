import { OrderLinkPage } from '../../../../components/club/orders/OrderLinkPage'

/**
 * `/club/o/[token]` — the kit order from a personal link (payments spec REQ-032; foundation P-19; M-19; #116).
 * Sessionless; the data comes from `GET /api/payments/order-links/{token}`.
 */
export default function OrderLinkRoute({ params }: { params?: { token?: string } }) {
  return <OrderLinkPage token={params?.token ?? ''} />
}
