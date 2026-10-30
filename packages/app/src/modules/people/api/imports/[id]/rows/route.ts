// `GET /api/people/imports/{id}/rows` (#28, club spec API table): the staged rows of an import, paged, with their
// classification, decision, problem column and values (decrypted; the caller holds `people.pesel.view`).
// `pending=true` lists the review queue: the `review` rows that still need a decision.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { importRowListQuerySchema } from '../../../../data/validators'
import { listImportRows } from '../../../../services/import-read'
import {
  IMPORT_FEATURES,
  assertImportReader,
  importRouteContext,
  importRowViewSchema,
  notFoundResponse,
  pagedSchema,
  unauthorized,
} from '../../../imports-shared'
import { errorSchema } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: IMPORT_FEATURES },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const route = await importRouteContext(request)
    if (!route) return unauthorized()
    await assertImportReader(route)
    const query = importRowListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const page = await listImportRows(route.ctx.container, route.scope, id, query)
    return page ? Response.json(page) : notFoundResponse()
  } catch (error: unknown) {
    return errorResponse(error, 'people.imports.rows')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'People import rows',
  methods: {
    GET: {
      summary: 'List the staged rows of an import',
      query: importRowListQuerySchema,
      responses: [{ status: 200, description: 'Paged rows', schema: pagedSchema(importRowViewSchema) }],
      errors: [
        { status: 403, description: '`scope_denied` or a missing feature', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
