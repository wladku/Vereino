// `GET /api/activities/activities/{id}` — one activity with its names and the caller's acting role, guarded by
// `assertInScope` with the list's grant kinds (a coach of the group, the coordinator of its section, the club
// administrator).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { findActivity, nameMaps } from '../../../services/read'
import { SCHEDULE_READ_KINDS, activityListItemSchema, errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const responseSchema = activityListItemSchema.extend({ actingRole: z.string() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const row = await findActivity(ctx.container, scope, id)
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
    const actingRole = await assertInScope(await scopeContract.resolve(ctx), SCHEDULE_READ_KINDS, {
      id: row.id,
      tenantId: row.tenantId,
      organizationId: row.organizationId,
      sectionId: row.sectionId,
      groupId: row.groupId,
    })
    const names = await nameMaps(ctx.container, scope, {
      groupIds: [row.groupId],
      sectionIds: [row.sectionId],
      placeIds: [row.defaultPlaceId],
      personIds: row.defaultCoachPersonId ? [row.defaultCoachPersonId] : [],
    })
    return Response.json({
      id: row.id,
      sectionId: row.sectionId,
      sectionName: names.sections.get(row.sectionId) ?? null,
      groupId: row.groupId,
      groupName: names.groups.get(row.groupId) ?? null,
      name: row.name,
      type: row.type,
      placeId: row.defaultPlaceId,
      placeName: names.places.get(row.defaultPlaceId) ?? null,
      coachPersonId: row.defaultCoachPersonId ?? null,
      coachName: row.defaultCoachPersonId ? (names.persons.get(row.defaultCoachPersonId) ?? null) : null,
      opponentExternalTeamId: row.opponentExternalTeamId ?? null,
      invitedExternalTeamIds: row.invitedExternalTeamIds,
      recurrenceRule: row.recurrenceRule ?? null,
      startsOn: row.startsOn,
      endsOn: row.endsOn ?? null,
      startTime: row.defaultStartTime.slice(0, 5),
      endTime: row.defaultEndTime.slice(0, 5),
      generatedUntil: row.generatedUntil ?? null,
      description: row.description ?? null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.activities.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Activity detail',
  methods: {
    GET: {
      summary: 'Read one activity',
      description:
        'Returns the activity when it is in the record scope of the caller (a coach of its group, the coordinator of its section, the club administrator), with the role the caller reads it as.',
      responses: [{ status: 200, description: 'The activity', schema: responseSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
