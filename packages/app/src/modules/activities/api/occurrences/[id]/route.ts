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
import { findActingRole } from '@vereino/core'
import { cancelRoleOf, type OccurrenceCommandResult } from '../../../commands/occurrences'
import { occurrenceUpdateSchema } from '../../../data/validators'
import { confirmByIso, deadlinePassed } from '../../../lib/confirm-by'
import { gatheringIso } from '../../../lib/gathering'
import { storedVenue } from '../../../lib/venue'
import { activityLabels, activityTeams, findOccurrence, nameMaps } from '../../../services/read'
import { findPlaces } from '../../../services/directory'
import { substituteForOf, substitutionHistory } from '../../../services/substitutions'
import { countMoveNotified } from '../../../services/session-notice'
import { selfPersonId } from '../../../commands/shared'
import {
  SCHEDULE_READ_KINDS,
  conflictErrorSchema,
  errorSchema,
  occurrenceListItemSchema,
  updateResponseSchema,
} from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.view'] },
  // DD-A05 (#270): every role that edits a session holds `activities.coach` (coach, coordinator, administrator); the
  // command decides by the grants — a coordinator or administrator any session in scope, a coach only the session of
  // a one-off event of a group they coach.
  PATCH: { requireAuth: true, requireFeatures: ['activities.coach'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const moveResponseSchema = updateResponseSchema.extend({
  notified: z
    .number()
    .int()
    .min(0)
    .describe(
      'How many people the move tells (in the app or by e-mail), without the person who moved it; 0 when nothing is announced (a coach or deadline change alone).',
    ),
})

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
  placeAddress: z.string().nullable().describe("The address of the session's place (#268), or null."),
  placeGeoLat: z.number().nullable(),
  placeGeoLng: z.number().nullable(),
  mayRestore: z
    .boolean()
    .describe('The caller may restore the cancelled session: the club administrator, while it has not ended (#268).'),
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
    const [names, activities, teams, substituted, substitutions, cancelRole, places] = await Promise.all([
      nameMaps(ctx.container, scope, {
        groupIds: [row.groupId],
        sectionIds: [row.sectionId],
        placeIds: row.placeId ? [row.placeId] : [],
        personIds: row.coachPersonId ? [row.coachPersonId] : [],
      }),
      activityLabels(ctx.container, scope, [row.activityId]),
      activityTeams(ctx.container, scope, [row.activityId]),
      substituteForOf(ctx.container, scope, [{ id: row.id, coachPersonId: row.coachPersonId ?? null }]),
      substitutionHistory(ctx.container, scope, row.id),
      cancelRoleOf(ctx.container, grants, row),
      findPlaces(ctx.container, scope, row.placeId ? [row.placeId] : []),
    ])
    const place = row.placeId ? places.get(row.placeId) : undefined
    // Restore (#268): the club administrator only, a cancelled session that has not ended — the command's own checks.
    const mayRestore =
      row.status === 'cancelled' &&
      row.endAt.getTime() > Date.now() &&
      findActingRole(grants, ['club_admin'], {
        id: row.id,
        tenantId: row.tenantId,
        organizationId: row.organizationId,
        sectionId: row.sectionId,
        groupId: row.groupId,
      }) !== null
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
      confirmByMinutesBefore: row.confirmByMinutesBefore ?? null,
      confirmBy: confirmByIso(row.startAt, row.confirmByMinutesBefore),
      deadlinePassed: deadlinePassed(row.startAt, row.confirmByMinutesBefore, new Date()),
      placeId: row.placeId,
      // REQ-A08: a typed venue fills the place's name and address, so every reader shows where the session is.
      placeName: row.placeId ? (names.places.get(row.placeId) ?? null) : (row.venueName ?? null),
      venue: storedVenue(row),
      placeAddress: row.placeId ? (place?.address ?? null) : (row.venueAddress ?? null),
      placeGeoLat: place?.geoLat ?? null,
      placeGeoLng: place?.geoLng ?? null,
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
      mayRestore,
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
    // REQ-A09 (#271): the toast names how many people the move tells; the session is already moved, so a failed count
    // answers 0 instead of turning the success into an error.
    const scope = trustedScopeOf(ctx)
    const notified =
      scope && result.change
        ? await countMoveNotified(ctx.container, scope, id, {
            personId: selfPersonId(await scopeContract.resolve(ctx)),
            actingRole: result.actingRole,
          }).catch(() => 0)
        : 0
    return Response.json({
      ok: true,
      id: result.entity.id,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
      notified,
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
        'Changes the instants, place or typed venue, coach, gathering time or deadline of one planned session and detaches it from its series, so a later series change leaves it as it is. A `placeId` replaces a typed venue and a `venue` a club place (REQ-A08); a venue only for the session of a one-off event. A coordinator or the club administrator edits any session in scope; a coach of the group only the session of a one-off event (DD-A05). A change of the time, the place or venue or the gathering time of a future session is announced in the app, in the session thread and by e-mail (REQ-A09); `notified` counts the people it tells, without the mover. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: occurrenceUpdateSchema.omit({ id: true }) },
      responses: [{ status: 200, description: 'The moved session', schema: moveResponseSchema }],
      errors: [
        {
          status: 403,
          description: '`scope_denied`; `coach_edit_series_session` for a coach on a session of a series',
          schema: errorSchema,
        },
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
            '`activity_times_inverted`, `activities_reference_invalid`, `place_not_bookable`, `venue_or_place_required`, `venue_requires_one_off`, `occurrence_gathering_after_start`, `occurrence_gathering_too_early`, `occurrence_confirm_by_after_start`, `occurrence_confirm_by_too_early`, `occurrence_confirm_by_in_past` (also a move whose kept deadline falls in the past without `confirmBy`)',
          schema: errorSchema,
        },
      ],
    },
  },
}
