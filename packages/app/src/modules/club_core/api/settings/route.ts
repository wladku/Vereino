// `/api/club_core/settings` — the club's settings with their defaults (foundation spec DD-F16, TEST-F09; club spec
// DD-37). The read is organization-wide (club settings are not person-scoped records); the write is the
// `club_core.settings.update` command, which only the club administrator's scope allows.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import type { ClubSettingsUpdateResult } from '../../commands/settings'
import { clubSettingsUpdateSchema } from '../../data/validators'
import {
  CALLED_UP_CHILDREN_VISIBILITY,
  COACH_SETTLEMENT_MODELS,
  ONLINE_FEE_MODES,
  ORDER_SALES_DOCUMENTS,
  declarationKindsPatchSchema,
} from '../../lib/settings'
import type { ClubCoreSettingsService } from '../../services/settings'
import { CLUB_CORE_SETTINGS_SERVICE } from '../../di'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['club_core.view'] },
  PUT: { requireAuth: true, requireFeatures: ['club_core.manage'] },
}

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return unauthorized()
    const settings = await ctx.container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS_SERVICE).get(scope)
    return Response.json({
      ...settings.values,
      defaultsApplied: settings.defaultsApplied,
      updatedAt: settings.updatedAt ? settings.updatedAt.toISOString() : null,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.settings.read')
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const body: unknown = await request.json().catch(() => null)
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ClubSettingsUpdateResult>('club_core.settings.update', {
      input: body ?? {},
      ctx,
    })
    return Response.json({ ...result.values, updatedAt: result.settings.updatedAt.toISOString() })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.settings.update')
  }
}

const settingsResponseSchema = z.object({
  ownAccountMinAge: z.number().int(),
  defaultLocale: z.string(),
  timezone: z.string(),
  shortName: z.string().nullable(),
  currency: z.string(),
  declarationKinds: declarationKindsPatchSchema.required(),
  onlineFeeMode: z.enum(ONLINE_FEE_MODES),
  onlineFeePercent: z.number().describe('Percentage of the paid amount, two decimals'),
  onlineFeeFixed: z.number().int().describe('Minor units (grosz) of the club currency'),
  coachSettlementModel: z.enum(COACH_SETTLEMENT_MODELS),
  showCalledUpChildren: z.enum(CALLED_UP_CHILDREN_VISIBILITY),
  orderSalesDocument: z.enum(ORDER_SALES_DOCUMENTS),
  defaultsApplied: z.array(z.string()).optional(),
  updatedAt: z.string().nullable(),
})
const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Club settings',
  methods: {
    GET: {
      summary: 'Read the club settings',
      description:
        'Returns the effective settings: stored values, or their defaults when unset; `defaultsApplied` lists stored values that were invalid and were replaced by their default.',
      responses: [{ status: 200, description: 'Effective settings', schema: settingsResponseSchema }],
      errors: [{ status: 401, description: 'Unauthorized', schema: errorSchema }],
    },
    PUT: {
      summary: 'Update the club settings',
      description:
        'Partial update by the club administrator; `declarationKinds` may name a subset of the activity types, `shortName: null` clears the short name and `orderSalesDocument` accepts only `none` in 1.0. Send the lock token in the platform optimistic-lock header once the settings exist.',
      requestBody: { contentType: 'application/json', schema: clubSettingsUpdateSchema },
      responses: [{ status: 200, description: 'Updated settings', schema: settingsResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid setting value', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 409, description: 'optimistic_lock_conflict', schema: errorSchema },
      ],
    },
  },
}
