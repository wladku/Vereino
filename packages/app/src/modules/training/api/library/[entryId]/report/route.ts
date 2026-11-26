// `POST /api/training/library/{entryId}/report` → `training.library.report` (training outlines spec *API*, DD-O14;
// REQ-O15; E24-S05, #685): `{ reason, note? }`, one per coach; reports from three clubs hide the entry until an operator
// decides (`yarn mercato training library-moderate`).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ReportResult } from '../../../../commands/library'
import { errorSchema, reportBodySchema } from '../../../library-shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['training.library.use'] },
}

const paramsSchema = z.object({ entryId: z.uuid() })

export async function POST(request: Request, context: { params: Promise<{ entryId: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const input = { ...(body && typeof body === 'object' ? body : {}), entryId: params.data.entryId }
    await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ReportResult>('training.library.report', { input, ctx })
    return Response.json({ ok: true }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error, 'training.library.report')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Report a library outline',
  methods: {
    POST: {
      summary: 'Report a shared outline',
      requestBody: { contentType: 'application/json', schema: reportBodySchema },
      responses: [{ status: 201, description: 'Reported', schema: z.object({ ok: z.literal(true) }) }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_unlinked`', schema: errorSchema },
        { status: 404, description: '`library_entry_not_found`, `library_not_configured`', schema: errorSchema },
        { status: 409, description: '`library_report_exists`', schema: errorSchema },
      ],
    },
  },
}
