// `POST /api/people/guardianships/{id}/end` — `people.guardianships.end`: `validTo` becomes the last active day
// (default: today in the club zone); a guardianship is ended, never deleted (club spec *Data Models*).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { GuardianshipCommandResult } from '../../../../commands/guardianships'
import { errorSchema, guardianshipView, guardianshipViewSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ validTo: z.string().optional() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, GuardianshipCommandResult>('people.guardianships.end', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    // The caller holds `people.manage`, so the consents are part of the response.
    return Response.json(guardianshipView(result.guardianship, { withConsents: true }))
  } catch (error: unknown) {
    return errorResponse(error, 'people.guardianships.end')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'End a guardianship',
  methods: {
    POST: {
      summary: 'End a guardianship',
      description:
        'Sets the last active day (club administrator); send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 422 `validity_inverted`.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The ended guardianship', schema: guardianshipViewSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'optimistic_lock_conflict', schema: errorSchema },
        { status: 422, description: 'validity_inverted', schema: errorSchema },
      ],
    },
  },
}
