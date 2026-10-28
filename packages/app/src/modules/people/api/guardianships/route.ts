// `POST /api/people/guardianships` — `people.guardianships.create` (phase A1: what the guardian grant and the payer
// rule need; #27 adds the consents and the guardianship list).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { GuardianshipCommandResult } from '../../commands/guardianships'
import { guardianshipCreateSchema } from '../../data/validators'
import { errorSchema } from '../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.manage'] },
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, GuardianshipCommandResult>('people.guardianships.create', {
      input: body,
      ctx,
    })
    return Response.json({ id: result.guardianship.id }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error, 'people.guardianships.create')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Guardianships',
  methods: {
    POST: {
      summary: 'Add a guardianship',
      description:
        'Guardian → ward for a period (club administrator). Errors: 403 `scope_denied`, 404 unknown person, 422 `guardianship_self`, `validity_inverted`.',
      requestBody: { contentType: 'application/json', schema: guardianshipCreateSchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.uuid() }) }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Unknown person', schema: errorSchema },
        { status: 422, description: 'guardianship_self, validity_inverted', schema: errorSchema },
      ],
    },
  },
}
