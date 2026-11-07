// `POST /api/activities/occurrences/{id}/cancel` — `activities.occurrences.cancel` (club spec API table, glossary
// *Session cancellation*, REQ-005, REQ-009, TEST-012): a planned session becomes `cancelled` with a reason, by a coach of
// its group, the coordinator of its section or the club administrator; the people it concerns get an in-app notice
// after commit. Send the lock token in the platform optimistic-lock header. The answer names how many people the
// cancellation tells (`notified`, without the canceller; E06-S15 #97), for the member page's toast. A coach's
// cancellation also tells the section's coordinators (#139). Where the club setting `coach_may_cancel` is off, a
// caller who holds only a coach grant on the session gets 403 `coach_cancel_disabled` (#199).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { selfPersonId } from '../../../../commands/shared'
import type { OccurrenceCommandResult } from '../../../../commands/occurrences'
import { countCancellationNotified } from '../../../../services/cancellation-notice'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.coach'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ reason: z.string().min(1).max(500) })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.literal('cancelled'),
  updatedAt: z.string(),
  actingRole: z.string(),
  notified: z.number().int().min(0),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, OccurrenceCommandResult>('activities.occurrences.cancel', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    // The session is already cancelled: a failed count answers 0 instead of turning the success into an error.
    const scope = trustedScopeOf(ctx)
    const notified = scope
      ? await countCancellationNotified(ctx.container, scope, id, {
          personId: selfPersonId(await scopeContract.resolve(ctx)),
          actingRole: result.actingRole,
        }).catch(() => 0)
      : 0
    return Response.json({
      ok: true,
      id: result.entity.id,
      status: result.entity.status,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
      notified,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.occurrences.cancel')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Cancel a session',
  methods: {
    POST: {
      summary: 'Cancel a planned session with a reason',
      description:
        'Marks the session cancelled and notifies, in the app, the participants with an account, the guardians of minor participants and the coaches — and, when a coach cancels, the coordinators of the section of the session (never the canceller); `notified` counts the people the cancellation tells (in the app or by e-mail), without the canceller. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The cancelled session', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input (a reason is required)', schema: errorSchema },
        {
          status: 403,
          description:
            '`scope_denied`; `coach_cancel_disabled` when the club setting `coach_may_cancel` is off and the caller holds only a coach grant on the session',
          schema: errorSchema,
        },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`invalid_transition` (the session is done or already cancelled), `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
