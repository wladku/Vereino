// `GET /api/payments/order-campaigns/{id}/share-text` — the text for the Messenger group chat (payments spec API row
// `/share-text`; REQ-032, issue #115, B-31 "Save and open collection", B-32): the campaign name, its description, the
// orders deadline and the link to the guardian's order form (`/club/orders/{id}`, M-17, #116), in the administrator's
// language. The link uses the host the administrator works on and, while the club's public pages are on, carries the
// club's public slug, so a guardian without a session can ask for a personal link there.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { errorResponse } from '@/modules/foundation'
import type { ClubCoreSettingsService } from '../../../../../club_core/services/settings'
import { orderPagePath } from '../../../../lib/orders'
import { campaignForRequest } from '../../../order-campaign-routes'
import { errorSchema } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
}

const shareTextSchema = z.object({ text: z.string(), link: z.string() })

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const loaded = await campaignForRequest(request, context.params)
    if (!loaded.ok) return loaded.response
    const { campaign, ctx, scope } = loaded
    const settings = await ctx.container.resolve<ClubCoreSettingsService>('clubCoreSettings').get(scope)
    const { publicSlug, publication } = settings.publicSettings
    const link = `${new URL(request.url).origin}${orderPagePath(campaign.id, publication.enabled ? publicSlug : null)}`
    const { translate } = await resolveTranslations()
    const lines = [
      campaign.name,
      campaign.description ?? null,
      translate('payments.orders.shareText.deadline', 'Orders until {date}: {link}', {
        date: calendarDate(campaign.closesOn),
        link,
      }),
    ].filter((line): line is string => !!line)
    return Response.json({ text: lines.join('\n\n'), link })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.order_campaigns.share_text')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Messenger text of an order campaign',
  methods: {
    GET: {
      summary: 'The text with a link to paste into the group chat',
      responses: [{ status: 200, description: 'The text and the link', schema: shareTextSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
