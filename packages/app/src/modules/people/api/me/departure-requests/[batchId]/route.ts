// `DELETE /api/people/me/departure-requests/{batchId}` — `people.departure_requests.withdraw` (people life-cycle spec
// *API* row, `/club/profile/leave` "Withdraw"; phase L4, #306): the member withdraws the open rows of their own request.
// 409 `departure_request_not_open` when nothing of it is open any more.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { DepartureRequestCommandResult } from '../../../../commands/departure-requests'
import { errorSchema } from '../../../shared'

export const metadata = {
  DELETE: { requireAuth: true, requireFeatures: ['people.self'] },
}

const paramsSchema = z.object({ batchId: z.uuid() })

export async function DELETE(request: Request, context: { params: Promise<{ batchId: string }> }): Promise<Response> {
  try {
    const { batchId } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    await commandBus.execute<unknown, DepartureRequestCommandResult>('people.departure_requests.withdraw', {
      input: { batchId },
      ctx,
    })
    return new Response(null, { status: 204 })
  } catch (error: unknown) {
    return errorResponse(error, 'people.departure_requests.withdraw')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Withdraw my request to leave',
  methods: {
    DELETE: {
      summary: 'Withdraw a request to leave the club',
      description: 'Removes the open rows of the request the member filed (by its `batchId`).',
      responses: [{ status: 204, description: 'Withdrawn' }],
      errors: [
        { status: 404, description: 'person_not_linked', schema: errorSchema },
        { status: 409, description: 'departure_request_not_open', schema: errorSchema },
      ],
    },
  },
}
