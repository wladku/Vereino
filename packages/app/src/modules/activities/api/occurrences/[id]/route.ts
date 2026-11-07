// `GET, PATCH /api/activities/occurrences/{id}` (club spec API table, REQ-005, TEST-007): one session with its names
// and the caller's acting role (a coach of the group, the coordinator of its section, the club administrator), whom a
// substitute stands in for and the substitution history (E06-S13 #95), whether the caller may cancel it (`mayCancel`,
// #215: false where `coach_may_cancel` is off and the caller holds only a coach grant on it), and the move — `activities.occurrences.update`, which detaches the session from its series and is refused with 409 when
// it overbooks the place tree or the coach. Send the lock token in the platform optimistic-lock header.
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
import { cancelRoleOf, type OccurrenceCommandResult } from '../../../commands/occurrences'
import { occurrenceUpdateSchema } from '../../../data/validators'
import { gatheringIso } from '../../../lib/gathering'
import { activityLabels, activityTeams, findOccurrence, nameMaps } from '../../../services/read'
import { substituteForOf, substitutionHistory } from '../../../services/substitutions'
import {
  SCHEDULE_READ_KINDS,
  conflictErrorSchema,
  errorSchema,
  occurrenceListItemSchema,
  updateResponseSchema,
} from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.view'] },
  PATCH: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const detailSchema = occurrenceListItemSchema.extend({
  sectionName: z.string().nullable(),
  activityRecurring: z.boolean().describe('The session belongs to a weekly series (not a one-off activity).'),
  opponentName: z.string().nullable().describe('The opponent of a match or sparring (an external team).'),
  invitedTeamNames: z.array(z.string()).describe('The invited external teams of a tournament or another event.'),
  substitutions: z
    .array(
      z.object({
        id: z.uuid(),
        kind: z.enum(['absence_reported', 'substitute_assigned', 'coach_restored']),
        previousCoachPersonId: z.string().nullable(),
        previousCoachName: z.string().nullable(),
        newCoachPersonId: z.string().nullable(),
        newCoachName: z.string().nullable(),
        reason: z.string().nullable(),
        decidedByPersonId: z.uuid(),
        decidedByName: z.string().nullable(),
        actingRole: z.string(),
        createdAt: z.string(),
      }),
    )
    .describe('The substitution history, oldest first (E06-S13); entries are never edited.'),
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
    const grants = await scopeContract.resolve(ctx)
    const actingRole = await assertInScope(grants, SCHEDULE_READ_KINDS, {
      id: row.id,
      tenantId: row.tenantId,
      organizationId: row.organizationId,
      sectionId: row.sectionId,
      groupId: row.groupId,
      occurrenceId: row.id,
    })
    const [names, activities, teams, substituted, substitutions, cancelRole] = await Promise.all([
      nameMaps(ctx.container, scope, {
        groupIds: [row.groupId],
        sectionIds: [row.sectionId],
        placeIds: [row.placeId],
        personIds: row.coachPersonId ? [row.coachPersonId] : [],
      }),
      activityLabels(ctx.container, scope, [row.activityId]),
      activityTeams(ctx.container, scope, [row.activityId]),
      substituteForOf(ctx.container, scope, [{ id: row.id, coachPersonId: row.coachPersonId ?? null }]),
      substitutionHistory(ctx.container, scope, row.id),
      cancelRoleOf(ctx.container, grants, row),
    ])
    const substituteFor = substituted.get(row.id)
    const activity = activities.get(row.activityId)
    const activityTeam = teams.get(row.activityId)
    return Response.json({
      id: row.id,
      activityId: row.activityId,
      activityName: activity?.name ?? null,
      activityType: activity?.type ?? null,
      activityRecurring: activity?.recurring ?? false,
      groupId: row.groupId,
      groupName: names.groups.get(row.groupId) ?? null,
      sectionId: row.sectionId,
      sectionName: names.sections.get(row.sectionId) ?? null,
      occurrenceDate: row.occurrenceDate,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      gatheringMinutesBefore: row.gatheringMinutesBefore ?? null,
      gatheringAt: gatheringIso(row.startAt, row.gatheringMinutesBefore),
      placeId: row.placeId,
      placeName: names.places.get(row.placeId) ?? null,
      coachPersonId: row.coachPersonId ?? null,
      coachName: row.coachPersonId ? (names.persons.get(row.coachPersonId) ?? null) : null,
      substituteForPersonId: substituteFor?.personId ?? null,
      substituteForName: substituteFor?.name ?? null,
      status: row.status,
      cancelReason: row.cancelReason ?? null,
      isDetached: row.isDetached,
      needsReschedule: row.needsReschedule,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      opponentName: activityTeam?.opponentName ?? null,
      invitedTeamNames: activityTeam?.invitedTeamNames ?? [],
      substitutions,
      actingRole,
      mayCancel: cancelRole !== null,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.occurrences.detail')
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, OccurrenceCommandResult>('activities.occurrences.update', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json({
      ok: true,
      id: result.entity.id,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.occurrences.update')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Session detail and move',
  methods: {
    GET: {
      summary: 'Read one session',
      description:
        'Returns the session when it is in the record scope of the caller (a coach of its group, the coordinator of its section, the club administrator), with the role the caller reads it as, whether the caller may cancel it (`mayCancel`), whom a substitute coach stands in for and the substitution history.',
      responses: [{ status: 200, description: 'The session', schema: detailSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
    PATCH: {
      summary: 'Move or re-staff one session',
      description:
        'Changes the instants, place or coach of one planned session and detaches it from its series, so a later series change leaves it as it is. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: occurrenceUpdateSchema.omit({ id: true }) },
      responses: [{ status: 200, description: 'The moved session', schema: updateResponseSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description:
            '`occurrence_place_conflict` / `occurrence_coach_conflict` with `conflicts`, `occurrence_not_planned`, `optimistic_lock_conflict`',
          schema: conflictErrorSchema,
        },
        {
          status: 422,
          description:
            '`activity_times_inverted`, `activities_reference_invalid`, `place_not_bookable`, `occurrence_gathering_after_start`, `occurrence_gathering_too_early`',
          schema: errorSchema,
        },
      ],
    },
  },
}
