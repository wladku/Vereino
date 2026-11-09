import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/orders/[campaignId]` — M-17: the kit order form (payments spec UI row, REQ-032; #116). Open without a session:
 * the page itself shows the campaign card with "Sign in" and the personal link request to a guardian who is not signed
 * in; every order read and write is behind `payments.orders.place` on its route.
 */
export const metadata: PageMetadata = {
  requireAuth: false,
  title: 'Order',
  titleKey: 'payments.orders.club.pageTitle',
}

export default metadata
