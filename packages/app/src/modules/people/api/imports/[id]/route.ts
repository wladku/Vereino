// `GET /api/people/imports/{id}` (#28): one import — its status, mapping (header names only), counts per
// classification, what the commit wrote, who uploaded and committed it, and how many rows still need a decision.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { findImport } from '../../../services/import-read'
import {
  IMPORT_FEATURES,
  assertImportReader,
  importRouteContext,
  importViewSchema,
  notFoundResponse,
  unauthorized,
} from '../../imports-shared'
import { errorSchema } from '../../shared'

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
    const view = await findImport(route.ctx.container, route.scope, id)
    return view ? Response.json(view) : notFoundResponse()
  } catch (error: unknown) {
    return errorResponse(error, 'people.imports.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'People import detail',
  methods: {
    GET: {
      summary: 'Read one import',
      responses: [{ status: 200, description: 'The import', schema: importViewSchema }],
      errors: [
        { status: 403, description: '`scope_denied` or a missing feature', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
