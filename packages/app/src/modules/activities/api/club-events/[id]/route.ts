// `GET /api/activities/club-events/{id}` — one club event with its parts (club events spec REQ-T02, REQ-T11, *API,
// Command, and Error Contracts*; #376): readable club-wide by a coordinator and by the club administrator (Q-T18), with
// the derived dates and place, `mayManage`, and each part — for a part with a group its session's time, coach, status,
// gathering time, deadline and declared count; for an open part its own times and status — in time order.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { clubEventTarget } from '../../../services/club-event-scope'
import {
  clubEventDerived,
  clubEventPartViews,
  clubEventPublicPathOf,
  findClubEvent,
} from '../../../services/club-events'
import { attendanceSettings } from '../../../services/directory'
import { CLUB_EVENT_READ_KINDS, CLUB_EVENT_READ_OPTIONS, clubEventListItemSchema } from '../../club-event-shared'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const partSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['group', 'open']).describe('A part with a group owns a session; an open part keeps its own times.'),
  title: z.string(),
  categoryLabel: z.string().nullable(),
  type: z.string(),
  visitingTeamIds: z.array(z.uuid()),
  visitingTeams: z.array(z.object({ id: z.uuid(), name: z.string(), clubName: z.string().nullable() })),
  activityId: z.uuid().nullable(),
  occurrenceId: z.uuid().nullable(),
  groupId: z.uuid().nullable(),
  groupName: z.string().nullable(),
  sectionName: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  coachPersonId: z.uuid().nullable(),
  coachName: z.string().nullable(),
  status: z.string().nullable(),
  cancelReason: z.string().nullable(),
  gatheringAt: z.string().nullable(),
  confirmBy: z.string().nullable(),
  declaredCount: z.number().int(),
  updatedAt: z.string().describe('The part’s lock token.'),
})

const responseSchema = clubEventListItemSchema.extend({
  publicPath: z
    .string()
    .nullable()
    .describe('The path of the tournament page while the event is published and the club page is public; else null.'),
  parts: z.array(partSchema),
})

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const row = await findClubEvent(ctx.container, scope, id)
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
    const grants = await scopeContract.resolve(ctx)
    await assertInScope(grants, CLUB_EVENT_READ_KINDS, clubEventTarget(row), CLUB_EVENT_READ_OPTIONS)
    const { timeZone } = await attendanceSettings(ctx.container, scope)
    const [derived, parts, publicPath] = await Promise.all([
      clubEventDerived(ctx.container, scope, grants, [row], timeZone),
      clubEventPartViews(ctx.container, scope, row.id),
      clubEventPublicPathOf(ctx.container, scope, row),
    ])
    return Response.json({
      id: row.id,
      name: row.name,
      publicSlug: row.publicSlug,
      sectionId: row.sectionId ?? null,
      placeId: row.placeId,
      description: row.description ?? null,
      gatheringMinutesBefore: row.gatheringMinutesBefore ?? null,
      confirmByMinutesBefore: row.confirmByMinutesBefore ?? null,
      isPublic: row.isPublic,
      status: row.status,
      cancelReason: row.cancelReason ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...derived.get(row.id),
      publicPath,
      parts,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.club_events.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Read a club event',
  methods: {
    GET: {
      summary: 'Read a club event with its parts',
      description:
        'Returns the club event when the caller is a coordinator or the club administrator of the club (Q-T18), with its dates, place, `mayManage` and its parts in time order.',
      responses: [{ status: 200, description: 'The club event', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied` (a coach or a participant)', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
