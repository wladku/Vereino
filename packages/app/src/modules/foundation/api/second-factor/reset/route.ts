// `POST /api/foundation/second-factor/reset` (staff second factor spec *API, Command, and Error Contracts*; REQ-2F04,
// DD-2F07; #736): the club administrator resets another person's second factor after verifying them. Runs the command
// `foundation.second_factor.reset`: the person's identity links are removed and all their sessions end. Oneself → 403
// `second_factor_reset_self`; an unknown user, another club's user and a user without the requirement → 404.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { ResetSecondFactorResult } from '../../../commands/second-factor'
import { commandContextForRequest, errorResponse } from '../../../services/route-context'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['foundation.second_factor.reset'] },
}

const inputSchema = z.object({
  userId: z.uuid(),
  note: z.string().min(3).max(500).describe('How the administrator verified the person'),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    let body: unknown = null
    try {
      body = await request.json()
    } catch {
      body = null
    }
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ResetSecondFactorResult>('foundation.second_factor.reset', { input: body ?? {}, ctx })
    return Response.json(
      { ok: true, unlinked: result.unlinked, sessionsEnded: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'foundation.second_factor.reset')
  }
}

const errorSchema = z.object({ error: z.string(), code: z.string().optional() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: "Reset a person's second factor",
  methods: {
    POST: {
      summary: "Reset a person's second factor (club administrator)",
      description:
        "Removes the person's sign-in identity links and ends all their sessions; the note records how the administrator verified the person. Not undoable.",
      requestBody: { contentType: 'application/json', schema: inputSchema },
      responses: [
        {
          status: 200,
          description: 'Reset',
          schema: z.object({ ok: z.literal(true), unlinked: z.number().int(), sessionsEnded: z.literal(true) }),
        },
      ],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Forbidden, `scope_denied`, `second_factor_reset_self`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
