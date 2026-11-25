// `/api/club_core/offboarding` (many clubs spec phase 4, REQ-M06, *API* table; E22-S06b, #676): whether the club is
// leaving the instance — the notice the operator recorded (`club_core offboard-club`) and the deletion date — whether
// the administrator may export the club's data, and the newest export. Read by the `/backend` banner. Answers for the
// caller's own club only (the trusted scope); a club without a notice answers nulls and `exportAvailable: false`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { readOffboardingView } from '../../services/club-export'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['club_core.manage'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const view = await readOffboardingView(ctx.container, scope)
    return Response.json(view, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.offboarding.read')
  }
}

const exportViewSchema = z.object({
  jobId: z.uuid(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  requestedAt: z.string(),
  finishedAt: z.string().nullable(),
  bytes: z.number().int().nullable().describe("The archive's size once the export completed"),
})

const offboardingSchema = z.object({
  noticeAt: z.string().nullable().describe('When the operator recorded the notice; null while the club is not leaving'),
  deleteAfter: z.string().nullable().describe('The earliest instant the club may be deleted'),
  exportAvailable: z.boolean().describe('Whether the administrator may export the club data (a notice is recorded)'),
  export: exportViewSchema.nullable().describe('The newest export of the club, or null'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Club offboarding',
  methods: {
    GET: {
      summary: 'Read whether the club is leaving the instance',
      description:
        "The notice period the operator recorded for the caller's club, whether the club administrator may export the club data, and the newest export (`POST /api/club_core/offboarding/export`). Without a notice every date is null and `exportAvailable` is false.",
      responses: [{ status: 200, description: 'The club offboarding state', schema: offboardingSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Missing `club_core.manage`', schema: errorSchema },
      ],
    },
  },
}
