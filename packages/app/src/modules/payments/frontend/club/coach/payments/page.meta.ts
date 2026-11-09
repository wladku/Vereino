import type { PageMetadata } from '@open-mercato/shared/modules/registry'

/** `/club/coach/payments` — M-18: "My groups' payments" for the coach (payments spec UI row, REQ-033; #117). */
export const metadata: PageMetadata = {
  requireAuth: true,
  requireFeatures: ['payments.groups.view'],
  title: "My groups' payments",
  titleKey: 'payments.coach.title',
}

export default metadata
