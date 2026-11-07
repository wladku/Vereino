import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/cash` — M-15: accepting cash on a phone with a numbered receipt (payments spec UI row, REQ-031; #114). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['payments.cash.record'],
  title: 'Accept cash',
  titleKey: 'payments.cash.title',
}

export default metadata
