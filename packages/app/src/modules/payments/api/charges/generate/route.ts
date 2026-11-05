// `POST /api/payments/charges/generate` — `payments.charges.generate` (payments spec API table, REQ-011, REQ-018; B-21
// "Generate period", flow F-07; issue #108): creates the period's charges at once and answers the summary
// `{ created, skipped, payerMissing }`; idempotent; 409 `generation_in_progress` while another generation of the club
// runs. Undone through the platform's undo of the command (the run's open charges are cancelled).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ChargeGenerationResult } from '../../../commands/generate'
import { chargeGenerateSchema } from '../../../data/validators'
import { errorSchema } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.manage'] },
}

const responseSchema = z.object({
  generationId: z.uuid(),
  period: z.string(),
  created: z.number().int(),
  skipped: z.number().int().describe('Charges that already existed'),
  payerMissing: z.number().int().describe('Created charges without a payer'),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ChargeGenerationResult>('payments.charges.generate', {
      input: body,
      ctx,
    })
    const { summary } = result
    return Response.json({
      generationId: summary.id,
      period: summary.period,
      created: summary.created,
      skipped: summary.skipped,
      payerMissing: summary.payerMissing,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.charges.generate')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Generate a period',
  methods: {
    POST: {
      summary: "Generate a period's charges",
      description:
        'Creates one charge per fee schedule valid in the period, participant and period label (`YYYY-MM`, or `one_off` for one-off fees) with the payer (the primary-payer guardian; an adult without one pays for themselves; else the charge is flagged without payer), the most favorable discount and the due date. Idempotent: existing charges are skipped. The period is `YYYY-MM`, from 12 months before to 12 months after the current month. Errors: 400 invalid input, 403 `scope_denied`, 409 `generation_in_progress`, 422 `period_out_of_range`.',
      requestBody: { contentType: 'application/json', schema: chargeGenerateSchema },
      responses: [{ status: 200, description: 'The summary of the generation', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 409, description: 'generation_in_progress', schema: errorSchema },
        { status: 422, description: 'period_out_of_range', schema: errorSchema },
      ],
    },
  },
}
