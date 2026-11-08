// `POST /api/payments/order-campaigns/{id}/complete` — complete the campaign (payments spec API row
// `payments.order_campaigns.transition`; REQ-032, issue #115, B-32): `delivered` → `completed`; any other stage answers 409
// `order_campaign_transition_invalid`.
import { campaignTransitionOpenApi, campaignTransitionRoute } from '../../../order-campaign-routes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
}

export const POST = campaignTransitionRoute('complete')

export const openApi = campaignTransitionOpenApi('Complete the campaign', 'delivered', 'completed')
