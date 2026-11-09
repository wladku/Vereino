import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/o/[token]` — sessionless kit order from a personal link (payments spec REQ-032, DD-35; M-19; #116). */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Order',
  titleKey: 'payments.orders.link.title',
}

export default metadata
