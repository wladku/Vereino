import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/orders` — M-16: the kit order campaigns of the payer's children (payments spec UI row, REQ-032; #116). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['payments.orders.place'],
  title: 'Orders',
  titleKey: 'payments.orders.club.listTitle',
}

export default metadata
