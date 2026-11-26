import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/**
 * `/club/cash-handovers` — M-18a: the treasurer or the club administrator confirms or rejects the cash handovers the
 * collectors sent, on a phone (payments spec UI row, REQ-033a; D-042, #791).
 */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['payments.cash.settle'],
  title: 'Handovers to confirm',
  titleKey: 'payments.cashHandovers.title',
}

export default metadata
