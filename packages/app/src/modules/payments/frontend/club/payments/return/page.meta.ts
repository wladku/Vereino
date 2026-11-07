import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/payments/return` — M-09: the result of an online payment (payments spec UI row, DD-42, REQ-012; #110). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['payments.view_own'],
  title: 'Payment result',
  titleKey: 'payments.club.return.title',
}

export default metadata
