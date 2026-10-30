// `GET /api/activities/calendar` (club spec API table, REQ-006; TEST-008; foundation II P-23; #32): the role calendars.
// `as=self` — the caller's own sessions; `as=guardian` — one calendar of every ward across every section (optionally
// one ward with `personId`); `as=coach` — the coach's groups and own sessions; `as=coordinator` — the coordinator's
// sections (optionally one with `sectionId`). The feature gate is `people.self` (every member and staff account
// holds it); the staff perspectives additionally require `activities.coach` / `activities.view`, and every read is
// narrowed by the record scope. A range longer than 62 days, or inverted, answers 400 `calendar_range_invalid`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { calendarQuerySchema } from '../../data/validators'
import { readCalendar } from '../../services/calendar'
import { calendarEntrySchema, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.self'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = calendarQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const result = await readCalendar(ctx, scope, query)
    return Response.json(result, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.calendar.read')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Role calendars',
  methods: {
    GET: {
      summary: 'The sessions of a range as the caller sees them in one role',
      description:
        '`from` and `to` are club-zone dates (at most 62 days). `as=self` lists the sessions of the groups the caller is a participant of; `as=guardian` the sessions of every ward (or of `personId`), with each ward’s declaration and, under `show_called_up_children = consented`, the names of other children whose guardian consented; `as=coach` and `as=coordinator` list the staff view with the per-session declaration summary. Errors: 400 `calendar_range_invalid`, 403 `scope_denied` (a perspective or person outside the caller’s scope).',
      query: calendarQuerySchema,
      responses: [
        {
          status: 200,
          description: 'The calendar entries of the range',
          schema: z.object({
            items: z.array(calendarEntrySchema),
            timeZone: z.string(),
            from: z.string(),
            to: z.string(),
          }),
        },
      ],
      errors: [
        { status: 400, description: 'calendar_range_invalid, validation failed', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
  },
}
