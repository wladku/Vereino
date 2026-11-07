// `POST /api/activities/occurrences/{id}/absence` — `activities.occurrences.report_absence` (club spec API table,
// glossary *Substitution*, REQ-008; README M-04, flow F-03 path A; E06-S13 #95): the session's assigned coach reports
// that they cannot run a planned session that has not started, with an optional reason (up to 200 characters). The
// session is left without a coach, goes to "Needing a coach" and the coordinators of its section are notified in the
// app. Send the lock token in the platform optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { SubstitutionCommandResult } from '../../../../commands/substitutions'
import { occurrenceAbsenceSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.coach'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  coachPersonId: z.null(),
  substitutionEntryId: z.uuid(),
  updatedAt: z.string(),
  actingRole: z.string(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, SubstitutionCommandResult>(
      'activities.occurrences.report_absence',
      { input: { ...(typeof body === 'object' && body !== null ? body : {}), id }, ctx },
    )
    return Response.json({
      ok: true,
      id: result.entity.id,
      coachPersonId: null,
      substitutionEntryId: result.entryId,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.occurrences.report_absence')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Report a coach absence',
  methods: {
    POST: {
      summary: 'The assigned coach reports they cannot run the session',
      description:
        'Leaves the planned session without a coach, records an `absence_reported` substitution entry and notifies the coordinators of the session’s section in the app (the club administrators when the section has none). Only the session’s assigned coach, before the session starts. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: occurrenceAbsenceSchema.omit({ id: true }) },
      responses: [{ status: 200, description: 'The session without a coach', schema: responseSchema }],
      errors: [
        {
          status: 400,
          description: 'Invalid input (a reason over 200 characters), `lock_token_required`',
          schema: errorSchema,
        },
        { status: 403, description: '`scope_denied` (not the session’s assigned coach)', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`occurrence_not_planned`, `absence_after_start`, `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
