// `POST /api/people/imports/{id}/commit` — `people.imports.commit` (#28, club spec API table): writes the import's
// persons and guardianships through the `people` commands in one transaction and records who committed it; the rows
// that carry a group keep it for the `groups` membership hook (`groups_not_enabled`, D-026). Send the import's lock
// token in the platform optimistic-lock header. A second commit answers 409 `import_already_committed`; a `review`
// row without a decision 422 `import_review_pending` (with `rowNos`).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { ImportCommitResult } from '../../../../commands/imports'
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
      .execute<unknown, ImportCommitResult>('people.imports.commit', { input: { id }, ctx: route.ctx })
    return Response.json(await findImport(route.ctx.container, route.scope, result.record.id))
  } catch (error: unknown) {
    return errorResponse(error, 'people.imports.commit')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Commit a people import',
  methods: {
    POST: {
      summary: 'Commit the import',
      responses: [{ status: 200, description: 'The committed import with its summary', schema: importViewSchema }],
      errors: [
        { status: 400, description: '`lock_token_required` (no import lock token in the header)', schema: errorSchema },
        { status: 403, description: '`scope_denied` or a missing feature', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`optimistic_lock_conflict`, `import_already_committed`, `import_cancelled`',
          schema: errorSchema,
        },
        { status: 422, description: '`import_review_pending` (`rowNos`)', schema: errorSchema },
      ],
    },
  },
}
