// `POST /api/enrolment/public/{clubSlug}/applications/status` (sign-up form spec P-J4, DD-J07, REQ-J09; #799): the
// applicant's status page posts the token from its path in the body; the link is looked up within the slug's club
// only. 200 with the state of that application only — never another application or a person of the club; 410
// `token_link_expired` for an expired, unknown or foreign token (the page then offers a new link). Spends nothing.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceSessionlessLimits, foundationErrors, tokenLimit } from '@/modules/foundation'
import { tokenBodySchema } from '../../../../../data/validators'
import { statusView } from '../../../../../services/views'
import { errorSchema, publicRoute, routeParam, type RouteContext } from '../../../../shared'

export const metadata = {
  POST: { requireAuth: false, rateLimit: { points: 60, duration: 60, keyPrefix: 'enrolment_public_status' } },
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return publicRoute('enrolment.public.status', async () => {
    const body: unknown = await request.json().catch(() => null)
    const parsed = tokenBodySchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: 'Validation failed' }, { status: 400 })
    const limited = await enforceSessionlessLimits(request, [
      tokenLimit('enrolment_status_token_read', parsed.data.token, 'read'),
    ])
    if (limited) return limited
    const container = await createRequestContainer()
    const result = await statusView(container, await routeParam(context, 'clubSlug'), parsed.data.token)
    if (result.status !== 'ok') {
      const error = await foundationErrors.create(
        'token_link_expired',
        'club' in result && result.club ? { club: result.club } : undefined,
      )
      return Response.json(error.body, { status: error.status })
    }
    return Response.json(result.value)
  })
}

const statusSchema = z.object({
  club: z.object({ name: z.string(), slug: z.string() }).loose(),
  state: z.enum(['new', 'trial', 'waiting', 'accepted', 'rejected', 'withdrawn', 'expired']),
  kind: z.enum(['child', 'adult']),
  sectionName: z.string(),
  groupName: z.string().nullable(),
  waitingNumber: z.number().int().nullable(),
  decisionReason: z.string().nullable().describe('The reject reason (rejected only)'),
  confirmedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  canWithdraw: z.boolean(),
  answerDays: z.number().int(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Application status',
  methods: {
    POST: {
      summary: 'The state of an application through its status link',
      description: 'Sessionless (REQ-J09). The token goes in the body. Read only.',
      requestBody: { contentType: 'application/json', schema: tokenBodySchema },
      responses: [{ status: 200, description: 'The application', schema: statusSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 410, description: '`token_link_expired` (expired, unknown or of another club)', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: errorSchema },
      ],
    },
  },
}
