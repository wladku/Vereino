// `POST /api/people/persons/{id}/return` — `people.persons.return` (people life-cycle spec *API* row, *Former person*;
// phase L4, #306): "Return to the club" clears the last day; memberships, roles and guardianships are not restored.
// 409 `person_not_left`.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ReturnCommandResult } from '../../../../commands/departures'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    await commandBus.execute<unknown, ReturnCommandResult>('people.persons.return', { input: { id }, ctx })
    return Response.json({ ok: true, id })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.return')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Return to the club',
  methods: {
    POST: {
      summary: 'Return a former person to the club',
      description:
        'Clears the last day, so the person shows in the lists and pickers again. Nothing that ended is restored: the person gets new memberships and roles.',
      responses: [{ status: 200, description: 'Returned', schema: z.object({ ok: z.literal(true), id: z.uuid() }) }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'person_not_left', schema: errorSchema },
      ],
    },
  },
}
