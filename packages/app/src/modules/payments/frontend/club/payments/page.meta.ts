import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/payments` — M-08: the payer's charges and the online payment (payments spec UI row, REQ-012; #110). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['payments.view_own'],
  title: 'Payments',
  titleKey: 'payments.club.title',
}

export default metadata
