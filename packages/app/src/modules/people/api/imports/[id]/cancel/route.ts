// `POST /api/people/imports/{id}/cancel` — `people.imports.cancel` (#28): closes an open import without writing
// anything; its file and rows are purged 30 days later (`people:purge-import-rows`). Send the import's lock token in
// the platform optimistic-lock header. Undoable until the purge.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { ImportCommandResult } from '../../../../commands/imports'
import { findImport } from '../../../../services/import-read'
import { IMPORT_FEATURES, importRouteContext, importViewSchema, unauthorized } from '../../../imports-shared'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: IMPORT_FEATURES },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const route = await importRouteContext(request)
    if (!route) return unauthorized()
    const { result } = await route.ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ImportCommandResult>('people.imports.cancel', { input: { id }, ctx: route.ctx })
    return Response.json(await findImport(route.ctx.container, route.scope, result.record.id))
  } catch (error: unknown) {
    return errorResponse(error, 'people.imports.cancel')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Cancel a people import',
  methods: {
    POST: {
      summary: 'Cancel the import',
      responses: [{ status: 200, description: 'The cancelled import', schema: importViewSchema }],
      errors: [
        { status: 400, description: '`lock_token_required` (no import lock token in the header)', schema: errorSchema },
        { status: 403, description: '`scope_denied` or a missing feature', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`optimistic_lock_conflict`, `import_already_committed`, `import_cancelled`',
          schema: errorSchema,
        },
      ],
    },
  },
}
