// `/api/payments/settings` — the club's payment settings (payments spec API table; R07, DD-32; B-20 "Coaches and
// payments"; issue #108; "Automatic charges and reminders" since #301; the "Online payment" group of #302, REQ-C14,
// DD-C11): the read returns the defaults until the first change, with the read-only connection mode and online fee
// mode; the write is the `payments.settings.update` command of the club administrator.
import type { AwilixContainer } from 'awilix'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import type { PaymentsSettingsCommandResult } from '../../commands/settings'
import type { PaymentsSettings } from '../../data/entities'
import { paymentsSettingsUpdateSchema } from '../../data/validators'
import { ONLINE_CONNECTIONS, ONLINE_METHODS, offeredOnlineMethods } from '../../lib/online-payment'
import { COACH_FEE_ACCESS } from '../../lib/payments-rules'
import { onlineFeeSettings } from '../../services/checkout'
import type { PaymentsScope } from '../../services/directory'
import { onlineConnection } from '../../services/online-connection'
import { storedPaymentsSettings } from '../../services/read'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['payments.manage'] },
}

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })

/**
 * The settings with the read-only facts of the "Online payment" group: the connection mode (never a key, DD-C11) and
 * the online fee mode, which is set in club settings B-02 (Q-C01).
 */
async function view(container: AwilixContainer, scope: PaymentsScope, row: PaymentsSettings | null) {
  const [connection, fee] = await Promise.all([
    onlineConnection(container, scope),
    onlineFeeSettings(container, scope).catch(() => null),
  ])
  return {
    coachFeeAccess: row?.coachFeeAccess ?? 'collect',
    autoBookBankMatches: row?.autoBookBankMatches ?? true,
    onlineMethods: offeredOnlineMethods(row?.onlineMethods),
    onlineConnection: connection,
    onlineFeeMode: fee?.onlineFeeMode ?? null,
    autoGenerateCharges: row?.autoGenerateCharges ?? true,
    generationDay: row?.generationDay ?? 1,
    overdueReminders: row?.overdueReminders ?? true,
    updatedAt: row ? row.updatedAt.toISOString() : null,
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return unauthorized()
    return Response.json(await view(ctx.container, scope, await storedPaymentsSettings(ctx.container, scope)))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.settings.read')
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return unauthorized()
    const body: unknown = await request.json().catch(() => null)
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, PaymentsSettingsCommandResult>('payments.settings.update', {
      input: body ?? {},
      ctx,
    })
    return Response.json(await view(ctx.container, scope, result.entity))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.settings.update')
  }
}

const settingsResponseSchema = z.object({
  coachFeeAccess: z.enum(COACH_FEE_ACCESS).describe('"Coaches and payments": `collect` (default), `view` or `none`'),
  autoBookBankMatches: z.boolean(),
  onlineMethods: z.array(z.enum(ONLINE_METHODS)).describe('The offered online methods (default `card`)'),
  onlineConnection: z
    .enum(ONLINE_CONNECTIONS)
    .describe('Read-only: the Stripe connection mode; `unknown` when it cannot be read. Never carries a key'),
  onlineFeeMode: z
    .enum(['club_pays', 'payer_pays'])
    .nullable()
    .describe('Read-only: the online fee mode, set in club settings; null when it cannot be read'),
  autoGenerateCharges: z
    .boolean()
    .describe('"Automatic charges and reminders": the daily job generates the month on `generationDay` (default true)'),
  generationDay: z.number().int().min(1).max(28).describe('The day of the month (1–28) the month is generated from'),
  overdueReminders: z.boolean().describe('The daily job reminds payers of overdue charges (default true)'),
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
        {
          status: 400,
          description: 'Invalid input (e.g. a generation day outside 1–28), `lock_token_required`',
          schema: errorSchema,
        },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`', schema: errorSchema },
        { status: 422, description: '`online_methods_invalid` (empty, unknown or repeated)', schema: errorSchema },
      ],
    },
  },
}
