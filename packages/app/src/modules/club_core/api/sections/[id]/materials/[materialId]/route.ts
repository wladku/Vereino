// `PUT` and `DELETE /api/club_core/sections/{id}/materials/{materialId}` — change a material's title or public flag, or
// delete it (#29; undoable). The club administrator or a coordinator of the section (403 `scope_denied` otherwise).
// Send the material's lock token in the platform optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { MaterialCommandResult } from '../../../../../commands/materials'
import { materialUpdateSchema } from '../../../../../data/validators'
import { errorSchema, updateResponseSchema } from '../../../../shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['club_core.sections.public_content'] },
  DELETE: { requireAuth: true, requireFeatures: ['club_core.sections.public_content'] },
}

const paramsSchema = z.object({ id: z.uuid(), materialId: z.uuid() })

type Params = { params: Promise<{ id: string; materialId: string }> }

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })

export async function PUT(request: Request, context: Params): Promise<Response> {
  try {
    const { id, materialId } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const body: unknown = await request.json().catch(() => ({}))
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, MaterialCommandResult>('club_core.materials.update', {
        input: { ...(typeof body === 'object' && body !== null ? body : {}), id: materialId, sectionId: id },
        ctx,
      })
    return Response.json({ ok: true, id: result.entity.id, updatedAt: result.entity.updatedAt.toISOString() })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.materials.update')
  }
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  try {
    const { id, materialId } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, MaterialCommandResult>('club_core.materials.delete', {
        input: { id: materialId, sectionId: id },
        ctx,
      })
    return Response.json({ ok: true })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.materials.delete')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Section material',
  methods: {
    PUT: {
      summary: "Change a material's title or public flag",
      description:
        'Send the material lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Undoable.',
      requestBody: {
        contentType: 'application/json',
        schema: materialUpdateSchema.omit({ id: true, sectionId: true }),
      },
      responses: [{ status: 200, description: 'Updated', schema: updateResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Delete a material',
      description:
        'Send the material lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Undoable.',
      responses: [{ status: 200, description: 'Deleted', schema: z.object({ ok: z.literal(true) }) }],
      errors: [
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`', schema: errorSchema },
      ],
    },
  },
}
