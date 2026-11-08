// The handlers shared by the `/api/payments/bank-transactions/{id}/…` routes (payments spec API row
// `/bank-transactions/{id}/confirm|assign|ignore|undo`; REQ-030, issue #113, B-29; `restore` is Q1 on #113): one
// decision per route, each sending the transfer's lock token in the platform optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { BankDecisionResult } from '../commands/bank'
import type { BankAction } from '../lib/bank-matching'
import { errorSchema } from './shared'

const decisionResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.string().describe('`booked`, `suggested`, `unmatched` or `ignored`'),
  updatedAt: z.string(),
  payments: z.array(z.object({ paymentId: z.uuid(), chargeId: z.uuid(), amount: z.number().int() })),
  actingRole: z.string(),
})

/** The handler of `POST /api/payments/bank-transactions/{id}/<action>`. */
export function bankDecisionRoute(action: BankAction) {
  return async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
      const { id } = z.object({ id: z.uuid() }).parse(await context.params)
      const ctx = await commandContextForRequest(request)
      if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      const body: unknown = request.headers.get('content-type')?.includes('json')
        ? await request.json().catch(() => ({}))
        : {}
      const fields = typeof body === 'object' && body !== null ? body : {}
      const { result } = await ctx.container
        .resolve<CommandBus>('commandBus')
        .execute<unknown, BankDecisionResult>(`payments.bank_transactions.${action}`, {
          input: { ...fields, id },
          ctx,
        })
      return Response.json({
        ok: true,
        id: result.entity.id,
        status: result.entity.status,
        updatedAt: result.entity.updatedAt.toISOString(),
        payments: [...result.recorded, ...result.reversed],
        actingRole: result.actingRole,
      })
    } catch (error: unknown) {
      return errorResponse(error, `payments.bank_transactions.${action}`)
    }
  }
}

/** The OpenAPI document of one decision route. */
export function bankDecisionOpenApi(
  summary: string,
  description: string,
  requestSchema: z.ZodType | null,
  extraErrors: string,
): OpenApiRouteDoc {
  return {
    tag: 'Payments',
    summary,
    methods: {
      POST: {
        summary,
        description: `${description} Send the transfer's lock token in the platform optimistic-lock header (400 \`lock_token_required\` without it).`,
        ...(requestSchema ? { requestBody: { contentType: 'application/json', schema: requestSchema } } : {}),
        responses: [{ status: 200, description: 'The transfer after the decision', schema: decisionResponseSchema }],
        errors: [
          { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
          { status: 403, description: 'scope_denied', schema: errorSchema },
          { status: 404, description: 'Not found', schema: errorSchema },
          {
            status: 409,
            description: '`bank_transaction_status_changed` (decided meanwhile), `optimistic_lock_conflict`',
            schema: errorSchema,
          },
          ...(extraErrors ? [{ status: 422, description: extraErrors, schema: errorSchema }] : []),
        ],
      },
    },
  }
}
