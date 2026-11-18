// `PUT /api/activities/occurrences/{id}/score` — `activities.occurrences.record_score` (groups and activities parity
// spec REQ-A15, Q-A21; E10-S07 #272): the score of a match or sparring, recorded by the session's coach, a coach of its
// group, the coordinator of its section or the club administrator once it started (also after it is closed). Both
// scores null clear it. Send the session version in the platform optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ScoreCommandResult } from '../../../../commands/score'
import { occurrenceScoreBodySchema } from '../../../../data/validators'
import { errorSchema, scoreSchema } from '../../../shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['activities.coach'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  score: scoreSchema,
  updatedAt: z.string(),
  actingRole: z.string(),
})

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ScoreCommandResult>('activities.occurrences.record_score', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json({
      ok: true,
      id: result.entity.id,
      score: result.score,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.occurrences.record_score')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'The score of a match or sparring',
  methods: {
    PUT: {
      summary: 'Record or clear the score of a session',
      description:
        '`scoreHome` and `scoreAway` (0–99; "home" is the club’s team unless the activity is away), both or neither — both null clear the score and its note — and an optional `note` (up to 500 characters). Only a match or sparring, once it started; also after it is closed. Send the session version (`updatedAt`) in the platform optimistic-lock header.',
      requestBody: {
        contentType: 'application/json',
        schema: occurrenceScoreBodySchema,
      },
      responses: [{ status: 200, description: 'The saved score (null when cleared)', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        {
          status: 403,
          description: 'scope_denied (not the session’s coach or a coach of the group)',
          schema: errorSchema,
        },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description:
            '`score_before_start`, `occurrence_not_planned` (cancelled), `optimistic_lock_conflict` (a stale version)',
          schema: errorSchema,
        },
        { status: 422, description: '`score_not_applicable` (not a match or sparring)', schema: errorSchema },
      ],
    },
  },
}
