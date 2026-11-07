// `GET, POST /api/activities/occurrences/{id}/coach` (club spec API table, glossary *Substitution*, REQ-008; README
// B-15 "Assign substitute", flow F-03 path A; E06-S13 #95), for the coordinator of the session's section and the club
// administrator:
// - `GET` — the coaches the substitute dialog offers for a planned session (an active coach role or a coach / assistant
//   membership on the session date, by last name, without the current coach), each with the overlapping session that
//   keeps them busy, so the dialog disables them with "Busy: {session}";
// - `POST` — `activities.occurrences.assign_coach`: assigns the coach with an optional reason, records the
//   substitution entry and notifies the coach in the app; 409 `occurrence_coach_conflict` when the coach is busy at
//   that time. Send the lock token in the platform optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { PLAN_KINDS } from '../../../../commands/shared'
import type { SubstitutionCommandResult } from '../../../../commands/substitutions'
import { occurrenceAssignCoachSchema } from '../../../../data/validators'
import { findOccurrence } from '../../../../services/read'
import { substituteOptionsFor } from '../../../../services/substitutions'
import { conflictErrorSchema, errorSchema } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.manage'] },
  POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const optionsSchema = z.object({
  currentCoachPersonId: z.string().nullable(),
  items: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      busy: z
        .object({ occurrenceId: z.uuid(), activityName: z.string().nullable(), startAt: z.string() })
        .nullable()
        .describe('The overlapping planned session that keeps the coach busy, or null when free.'),
    }),
  ),
})

const assignResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  coachPersonId: z.uuid(),
  kind: z.enum(['substitute_assigned', 'coach_restored']),
  substitutionEntryId: z.uuid(),
  updatedAt: z.string(),
  actingRole: z.string(),
})

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const row = await findOccurrence(ctx.container, scope, id)
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
    await assertInScope(await scopeContract.resolve(ctx), PLAN_KINDS, {
      id: row.id,
      tenantId: row.tenantId,
      organizationId: row.organizationId,
      sectionId: row.sectionId,
      groupId: row.groupId,
    })
    return Response.json({
      currentCoachPersonId: row.coachPersonId ?? null,
      items: await substituteOptionsFor(ctx.container, scope, row),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.occurrences.coach_options')
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, SubstitutionCommandResult>(
      'activities.occurrences.assign_coach',
      { input: { ...(typeof body === 'object' && body !== null ? body : {}), id }, ctx },
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
    return errorResponse(error, 'activities.occurrences.assign_coach')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Session coach: substitute options and assignment',
  methods: {
    GET: {
      summary: 'List the coaches a session can be given to',
      description:
        'The persons with an active `coach` role assignment or an active `coach` / `assistant` group membership on the session date, sorted by last name, without the current coach; each carries the overlapping planned session that keeps them busy (`busy`), or null when free.',
      responses: [{ status: 200, description: 'The substitute options', schema: optionsSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Assign a coach to a planned session',
      description:
        'Sets the session’s coach, records a `substitute_assigned` substitution entry (`coach_restored` when the session goes back to its own coach) and notifies the coach in the app. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: occurrenceAssignCoachSchema.omit({ id: true }) },
      responses: [{ status: 200, description: 'The session with its new coach', schema: assignResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description:
            '`occurrence_coach_conflict` with `conflicts` (the coach is busy at that time), `occurrence_not_planned`, `optimistic_lock_conflict`',
          schema: conflictErrorSchema,
        },
        {
          status: 422,
          description: '`occurrence_coach_unchanged`, `activities_reference_invalid` (not a coach of the club)',
          schema: errorSchema,
        },
      ],
    },
  },
}
