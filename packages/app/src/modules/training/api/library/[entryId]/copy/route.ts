// `POST /api/training/library/{entryId}/copy` → `training.library.copy` (training outlines spec *API*; REQ-O12;
// E24-S05, #685): the entry becomes the caller's own outline in the club, with its images copied and the first
// author's credit kept (`origin_credit`); a session it is attached to later records a use of the entry when it closes.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { CopyResult } from '../../../../commands/library'
import { errorSchema } from '../../../library-shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['training.library.use', 'training.outlines.write'] },
}

const paramsSchema = z.object({ entryId: z.uuid() })

export async function POST(request: Request, context: { params: Promise<{ entryId: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, CopyResult>('training.library.copy', { input: { entryId: params.data.entryId }, ctx })
    return Response.json({ id: result.entity.id, updatedAt: result.entity.updatedAt.toISOString() }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error, 'training.library.copy')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Copy a library outline',
  methods: {
    POST: {
      summary: 'Copy a shared outline into the club',
      description: 'Creates the caller’s own outline from the entry; the credit of the first author stays with it.',
      responses: [
        {
          status: 201,
          description: 'The new outline',
          schema: z.object({ id: z.uuid(), updatedAt: z.string() }),
        },
      ],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_unlinked`', schema: errorSchema },
        { status: 404, description: '`library_entry_not_found`, `library_not_configured`', schema: errorSchema },
      ],
    },
  },
}
