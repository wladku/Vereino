// `PUT /api/people/imports/{id}/rows/{rowId}` — `people.imports.decide_row` (#28, club spec API table): one decision on
// a staged row — a `review` row is matched to an existing person (`personId`), created or skipped; a `new` or
// `matched` row can only be skipped; an `error` row takes no decision. Send the row's lock token in the platform
// optimistic-lock header. Undoable while the import is open.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { ImportRowCommandResult } from '../../../../../commands/imports'
import { IMPORT_FEATURES, importRouteContext, unauthorized } from '../../../../imports-shared'
import { errorSchema } from '../../../../shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: IMPORT_FEATURES },
}

const paramsSchema = z.object({ id: z.uuid(), rowId: z.uuid() })
const bodySchema = z.object({ action: z.enum(['match', 'create', 'skip']), personId: z.uuid().optional() })

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; rowId: string }> },
): Promise<Response> {
  try {
    const { id, rowId } = paramsSchema.parse(await context.params)
    const route = await importRouteContext(request)
    if (!route) return unauthorized()
    const body: unknown = await request.json().catch(() => ({}))
    const { result } = await route.ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ImportRowCommandResult>('people.imports.decide_row', {
        input: { ...(typeof body === 'object' && body !== null ? body : {}), importId: id, rowId },
        ctx: route.ctx,
      })
    return Response.json({
      ok: true,
      id: result.row.id,
      decision: result.row.decision ?? null,
      decisionPersonId: result.row.decisionPersonId ?? null,
      updatedAt: result.row.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'people.imports.decide_row')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Decide an import row',
  methods: {
    PUT: {
      summary: 'Record one decision on a staged row',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [
        {
          status: 200,
          description: 'The decision',
          schema: z.object({
            ok: z.literal(true),
            id: z.uuid(),
            decision: z.enum(['match', 'create', 'skip']).nullable(),
            decisionPersonId: z.uuid().nullable(),
            updatedAt: z.string(),
          }),
        },
      ],
      errors: [
        { status: 400, description: 'Malformed input', schema: errorSchema },
        { status: 403, description: '`scope_denied` or a missing feature', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`optimistic_lock_conflict`, `import_already_committed`, `import_cancelled`',
          schema: errorSchema,
        },
        { status: 422, description: '`import_decision_invalid`, `import_person_not_found`', schema: errorSchema },
      ],
    },
  },
}
