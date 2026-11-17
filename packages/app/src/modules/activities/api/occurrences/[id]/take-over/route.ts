// `POST /api/activities/occurrences/{id}/take-over` — `activities.occurrences.take_over` (parity spec REQ-A14, J-A04
// step 4; E10-S07 #272): a coach or assistant of the session's group takes a planned session that has no coach. The
// session gets them as its coach, the substitution history records it and the existing coach-changed notices go out.
// A second person who was slower gets 409 `occurrence_has_coach`; a coach busy at that time 409
// `occurrence_coach_conflict`; anyone outside the group 403.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { SubstitutionCommandResult } from '../../../../commands/substitutions'
import { conflictErrorSchema, errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.coach'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  coachPersonId: z.uuid(),
  kind: z.enum(['substitute_assigned', 'coach_restored']),
  substitutionEntryId: z.uuid(),
  updatedAt: z.string(),
  actingRole: z.string(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, SubstitutionCommandResult>(
      'activities.occurrences.take_over',
      {
        input: { id },
        ctx,
      },
    )
    return Response.json({
      ok: true,
      id: result.entity.id,
      coachPersonId: result.newCoachPersonId,
      kind: result.kind,
      substitutionEntryId: result.entryId,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.occurrences.take_over')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Take over a session without a coach',
  methods: {
    POST: {
      summary: 'Take over a planned session that has no coach',
      description:
        'The caller — a coach or assistant of the session’s group — becomes the session’s coach. Records a `substitute_assigned` substitution entry (`coach_restored` when the session’s own coach takes it back) and sends the coach-changed notices. The session row is locked, so of two concurrent callers the second gets `occurrence_has_coach`; no body and no version are needed.',
      responses: [{ status: 200, description: 'The session with its new coach', schema: responseSchema }],
      errors: [
        { status: 403, description: 'scope_denied (not a coach or assistant of the group)', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description:
            '`occurrence_has_coach` (someone leads it already), `occurrence_coach_conflict` with `conflicts` (the caller is busy at that time), `occurrence_not_planned`',
          schema: conflictErrorSchema,
        },
      ],
    },
  },
}
