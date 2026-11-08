// `POST /api/payments/order-campaigns/{id}/mark-ordered` — mark as ordered from the supplier (payments spec API row
// `payments.order_campaigns.transition`; REQ-032, issue #115, B-32): `closed` → `ordered`; any other stage answers 409
// `order_campaign_transition_invalid`.
import { campaignTransitionOpenApi, campaignTransitionRoute } from '../../../order-campaign-routes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
}

export const POST = campaignTransitionRoute('mark-ordered')

export const openApi = campaignTransitionOpenApi('Mark as ordered from the supplier', 'closed', 'ordered')
