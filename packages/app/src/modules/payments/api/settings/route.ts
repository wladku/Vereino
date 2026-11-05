// `/api/payments/settings` — the club's payment settings (payments spec API table; R07, DD-32; B-20 "Coaches and
// payments"; issue #108): the read returns the defaults until the first change; the write is the
// `payments.settings.update` command of the club administrator.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import type { PaymentsSettingsCommandResult } from '../../commands/settings'
import type { PaymentsSettings } from '../../data/entities'
import { paymentsSettingsUpdateSchema } from '../../data/validators'
import { COACH_FEE_ACCESS } from '../../lib/payments-rules'
import { storedPaymentsSettings } from '../../services/read'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['payments.manage'] },
}

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })

function view(row: PaymentsSettings | null) {
  return {
    coachFeeAccess: row?.coachFeeAccess ?? 'collect',
    autoBookBankMatches: row?.autoBookBankMatches ?? true,
    updatedAt: row ? row.updatedAt.toISOString() : null,
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return unauthorized()
    return Response.json(view(await storedPaymentsSettings(ctx.container, scope)))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.settings.read')
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const body: unknown = await request.json().catch(() => null)
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, PaymentsSettingsCommandResult>('payments.settings.update', {
      input: body ?? {},
      ctx,
    })
    return Response.json(view(result.entity))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.settings.update')
  }
}

const settingsResponseSchema = z.object({
  coachFeeAccess: z.enum(COACH_FEE_ACCESS).describe('"Coaches and payments": `collect` (default), `view` or `none`'),
  autoBookBankMatches: z.boolean(),
  updatedAt: z.string().nullable().describe('The lock token; null until the first change'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Payment settings',
  methods: {
    GET: {
      summary: 'Read the payment settings',
      description: 'Returns the stored settings, or their defaults before the first change.',
      responses: [{ status: 200, description: 'Payment settings', schema: settingsResponseSchema }],
      errors: [{ status: 401, description: 'Unauthorized', schema: errorSchema }],
    },
    PUT: {
      summary: 'Update the payment settings',
      description:
        'Partial update by the club administrator. Send the lock token in the platform optimistic-lock header once the settings exist (the read returns `updatedAt`); without it the save answers 400 `lock_token_required` unless it is the first one.',
      requestBody: { contentType: 'application/json', schema: paymentsSettingsUpdateSchema },
      responses: [{ status: 200, description: 'Updated settings', schema: settingsResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`', schema: errorSchema },
      ],
    },
  },
}
