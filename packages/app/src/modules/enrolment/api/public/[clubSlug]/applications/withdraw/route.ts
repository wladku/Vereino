// `POST /api/enrolment/public/{clubSlug}/applications/withdraw` → `enrolment.applications.withdraw` (sign-up form spec
// P-J4, J-J06, REQ-J09; #799): the applicant withdraws an open application through the status link (token in the
// body, looked up within the slug's club only). 409 `application_state_conflict` once it is closed; 410 for an
// expired, unknown or foreign token.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceSessionlessLimits, tokenLimit } from '@/modules/foundation'
import { tokenBodySchema } from '../../../../../data/validators'
import { errorSchema, publicRoute, routeParam, sessionlessContext, type RouteContext } from '../../../../shared'

export const metadata = {
  POST: { requireAuth: false, rateLimit: { points: 30, duration: 600, keyPrefix: 'enrolment_public_withdraw' } },
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return publicRoute('enrolment.public.withdraw', async () => {
    const body: unknown = await request.json().catch(() => null)
    const parsed = tokenBodySchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: 'Validation failed' }, { status: 400 })
    const limited = await enforceSessionlessLimits(request, [
      tokenLimit('enrolment_status_token_write', parsed.data.token, 'write'),
    ])
    if (limited) return limited
    const ctx = await sessionlessContext(request)
    await ctx.container.resolve<CommandBus>('commandBus').execute('enrolment.applications.withdraw', {
      input: { ...parsed.data, clubSlug: await routeParam(context, 'clubSlug') },
      ctx,
    })
    return Response.json({ state: 'withdrawn' })
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Withdraw an application',
  methods: {
    POST: {
      summary: 'Withdraw an open application through its status link',
      description: 'Sessionless (REQ-J09). The token goes in the body.',
      requestBody: { contentType: 'application/json', schema: tokenBodySchema },
      responses: [{ status: 200, description: 'Withdrawn', schema: z.object({ state: z.literal('withdrawn') }) }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 409, description: '`application_state_conflict` (already closed)', schema: errorSchema },
        { status: 410, description: '`token_link_expired`', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: errorSchema },
      ],
    },
  },
}
