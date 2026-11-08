// The handlers shared by the hand-written `/api/payments/order-campaigns/{id}/…` routes (payments spec API rows
// `payments.order_campaigns.transition`, `/summary`, `/share-text`, `/remind`; REQ-032, issue #115): one transition
// route per stage and the campaign read in the trusted club scope.
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import type { OrderCampaignCommandResult } from '../commands/order-campaigns'
import type { OrderCampaign } from '../data/entities'
import type { CampaignAction } from '../lib/order-campaigns'
import type { PaymentsScope } from '../services/directory'
import { findCampaign } from '../services/order-campaigns'
import { PAYMENTS_READ_KINDS, errorSchema } from './shared'

/**
 * The campaign `id` of a hand-written route, read in the caller's trusted club scope and checked against the club
 * administrator's grant; a `Response` (401, 404) when it cannot be read.
 */
export async function campaignForRequest(
  request: Request,
  params: Promise<{ id: string }>,
): Promise<
  | { ok: true; ctx: CommandRuntimeContext; scope: PaymentsScope; campaign: OrderCampaign }
  | { ok: false; response: Response }
> {
  const { id } = z.object({ id: z.uuid() }).parse(await params)
  const ctx = await commandContextForRequest(request)
  const scope = ctx ? trustedScopeOf(ctx) : null
  if (!ctx || !scope) return { ok: false, response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const campaign = await findCampaign(ctx.container, scope, id)
  if (!campaign) return { ok: false, response: Response.json({ error: 'Not found' }, { status: 404 }) }
  await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
    id: campaign.id,
    tenantId: campaign.tenantId,
    organizationId: campaign.organizationId,
  })
  return { ok: true, ctx, scope, campaign }
}

const transitionResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.string(),
  updatedAt: z.string(),
  actingRole: z.string(),
})

/**
 * The handler of `POST /api/payments/order-campaigns/{id}/<action>` (`payments.order_campaigns.transition`): one
 * stage forward. Send the campaign's lock token in the platform optimistic-lock header.
 */
export function campaignTransitionRoute(action: CampaignAction) {
  return async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
      const { id } = z.object({ id: z.uuid() }).parse(await context.params)
      const ctx = await commandContextForRequest(request)
      if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      const { result } = await ctx.container
        .resolve<CommandBus>('commandBus')
        .execute<unknown, OrderCampaignCommandResult>('payments.order_campaigns.transition', {
          input: { id, action },
          ctx,
        })
      return Response.json({
        ok: true,
        id: result.entity.id,
        status: result.entity.status,
        updatedAt: result.entity.updatedAt.toISOString(),
        actingRole: result.actingRole,
      })
    } catch (error: unknown) {
      return errorResponse(error, 'payments.order_campaigns.transition')
    }
  }
}

/** The OpenAPI document of one transition route. */
export function campaignTransitionOpenApi(summary: string, from: string, to: string): OpenApiRouteDoc {
  return {
    tag: 'Payments',
    summary,
    methods: {
      POST: {
        summary,
        description: `Moves the campaign from \`${from}\` to \`${to}\` (\`payments.order_campaigns.transition\`). Send the campaign's lock token in the platform optimistic-lock header (400 \`lock_token_required\` without it).`,
        responses: [{ status: 200, description: 'The campaign in its new stage', schema: transitionResponseSchema }],
        errors: [
          { status: 400, description: '`lock_token_required`', schema: errorSchema },
          { status: 403, description: 'scope_denied', schema: errorSchema },
          { status: 404, description: 'Not found', schema: errorSchema },
          {
            status: 409,
            description: '`order_campaign_transition_invalid` (out of order), `optimistic_lock_conflict`',
            schema: errorSchema,
          },
        ],
      },
    },
  }
}
