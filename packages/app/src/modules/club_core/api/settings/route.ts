// `/api/club_core/settings` — the club's settings with their defaults (foundation spec DD-F16, TEST-F09). The read
// is organization-wide (club settings are not person-scoped records); the write is the `club_core.settings.update`
// command, which only the club administrator's scope allows.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import type { ClubSettingsUpdateResult } from '../../commands/settings'
import { clubSettingsUpdateSchema } from '../../data/validators'
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
    return Response.json({
      ownAccountMinAge: result.settings.ownAccountMinAge,
      defaultLocale: result.settings.defaultLocale,
      timezone: result.settings.timezone,
      updatedAt: result.settings.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.settings.update')
  }
}

const settingsResponseSchema = z.object({
  ownAccountMinAge: z.number().int(),
  defaultLocale: z.string(),
  timezone: z.string(),
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
        'Partial update by the club administrator. Send the lock token in the platform optimistic-lock header once the settings exist.',
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
