// `PUT /api/groups/age-categories/{entryId}/range` — `groups.age_category_ranges.set` (people life-cycle spec REQ-L16,
// *API* row; #384): sets the PZPN "U" range of one entry of the club's age category dictionary; audited and undoable.
// Only the club administrator (`dictionaries.manage` and the `club_admin` grant): a coordinator gets 403.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { AgeCategoryRangeResult } from '../../../../commands/age-categories'
import { ageCategoryRangeSetSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['dictionaries.manage'] },
}

const paramsSchema = z.object({ entryId: z.uuid() })

/** The body: the validator without the path's `entryId`. */
const bodySchema = ageCategoryRangeSetSchema.omit({ entryId: true })

const responseSchema = z.object({
  entryId: z.uuid(),
  uFrom: z.number().int(),
  uTo: z.number().int().nullable(),
  updatedAt: z.string(),
  actingRole: z.string(),
})

export async function PUT(request: Request, context: { params: Promise<{ entryId: string }> }): Promise<Response> {
  try {
    const { entryId } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, AgeCategoryRangeResult>('groups.age_category_ranges.set', {
        input: { ...(typeof body === 'object' && body !== null ? body : {}), entryId },
        ctx,
      })
    return Response.json({
      entryId: result.entity.entryId,
      uFrom: result.entity.uFrom,
      uTo: result.entity.uTo ?? null,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'groups.age_category_ranges.set')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Groups',
  summary: 'Set the range of an age category',
  methods: {
    PUT: {
      summary: 'Set the PZPN "U" range of an age category',
      description:
        'Sets `uFrom` (1–99) and `uTo` (1–99, null = open) of an entry of the club’s age category dictionary; the range stays attached to the entry when the category is renamed or reordered. Send the range’s `updatedAt` as read (400 `lock_token_required` without it once the category has a range). Audited and undoable. Errors: 403 `scope_denied` (not the club administrator), 404 (not an entry of the club’s age category dictionary), 409 `optimistic_lock_conflict`, 422 `age_range_inverted`.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The stored range', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid body or lock_token_required', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'optimistic_lock_conflict', schema: errorSchema },
        { status: 422, description: 'age_range_inverted', schema: errorSchema },
      ],
    },
  },
}
