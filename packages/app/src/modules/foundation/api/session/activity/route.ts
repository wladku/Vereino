// `POST /api/foundation/session/activity` (S8.5, ENG-Q-12; #737): the app shell reports that the signed-in user works,
// at most once a minute. A staff session's expiry moves to the idle timeout after now (never past 8 hours after
// sign-in); a member session is left alone. Without activity reports a staff session ends after the idle timeout.
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { recordStaffActivityForRequest } from '../../../services/staff-session'
import { errorResponse } from '../../../services/route-context'

export const metadata = {
  POST: { requireAuth: true },
}

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth?.sub) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
    const result = await recordStaffActivityForRequest(auth)
    if (!result) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
    return Response.json(result, { headers: NO_STORE })
  } catch (error: unknown) {
    return errorResponse(error, 'foundation.session.activity')
  }
}

const activitySchema = z.object({
  staff: z.boolean().describe('Whether the account is a staff account with the idle timeout'),
  expiresAt: z.string().nullable().describe('When the session now expires (staff only)'),
  idleTimeoutSeconds: z.number().int().nullable().describe('The staff idle timeout in seconds (staff only)'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: 'Session activity',
  methods: {
    POST: {
      summary: 'Report activity of the own session',
      description:
        'Moves the expiry of a staff session to the idle timeout after now, never past 8 hours after sign-in. A member session is left alone.',
      responses: [{ status: 200, description: 'The session state after the report', schema: activitySchema }],
      errors: [
        { status: 401, description: 'Unauthorized or the session expired', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
