// `POST|DELETE /api/training/outlines/{id}/publish` → `training.library.publish` / `training.library.withdraw`
// (training outlines spec *API*, DD-O11, BR-O4; REQ-O11; E24-S05, #685). `POST { visibility, acceptTerms? }` shares the
// outline in the library at `clubs` (clubs on Vereino) or `public`, up to the club's widest level; publishing again
// replaces the snapshot and keeps the entry's ratings. `DELETE` withdraws it. For whoever may edit the outline.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { PublishResult, WithdrawResult } from '../../../../commands/library'
import { PUBLISH_VISIBILITIES } from '../../../../lib/library'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['training.library.publish'] },
  DELETE: { requireAuth: true, requireFeatures: ['training.library.publish'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  visibility: z.enum(PUBLISH_VISIBILITIES),
  acceptTerms: z.boolean().optional().describe('Accepts the library terms; needed at the first publication'),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const input = { ...(body && typeof body === 'object' ? body : {}), id: params.data.id }
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, PublishResult>('training.library.publish', { input, ctx })
    return Response.json(
      { entryId: result.entryId, visibility: result.visibility, republished: result.republished },
      { status: result.republished ? 200 : 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'training.library.publish')
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, WithdrawResult>('training.library.withdraw', { input: { id: params.data.id }, ctx })
    return Response.json({ ok: true })
  } catch (error: unknown) {
    return errorResponse(error, 'training.library.withdraw')
  }
}

const publishedSchema = z.object({
  entryId: z.uuid(),
  visibility: z.enum(PUBLISH_VISIBILITIES),
  republished: z.boolean(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Share a training outline in the library',
  methods: {
    POST: {
      summary: 'Publish an outline to the shared library',
      description:
        'Copies a snapshot of the outline (no session, group or person ids; images without their metadata) into the library at `clubs` or `public`, up to the club’s widest level. The author’s name shows only with their name consent. The first publication needs `acceptTerms: true`.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [
        { status: 201, description: 'Published', schema: publishedSchema },
        { status: 200, description: 'Published again (the entry keeps its ratings)', schema: publishedSchema },
      ],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`visibility_above_club_level`, `scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown outline, `library_not_configured`', schema: errorSchema },
        { status: 409, description: '`library_terms_required`', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Withdraw an outline from the shared library',
      description: 'Deletes the entry with its ratings, uses and reports.',
      responses: [{ status: 200, description: 'Withdrawn', schema: z.object({ ok: z.literal(true) }) }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        {
          status: 404,
          description: 'Unknown outline, `outline_not_published`, `library_not_configured`',
          schema: errorSchema,
        },
      ],
    },
  },
}
