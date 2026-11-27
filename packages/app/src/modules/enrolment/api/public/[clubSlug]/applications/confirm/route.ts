// `POST /api/enrolment/public/{clubSlug}/applications/confirm` → `enrolment.applications.confirm` (sign-up form spec
// P-J3, DD-J06, DD-J09, REQ-J07; #799): the confirmation page posts the e-mailed token in the body — never in a path,
// so access logs never carry it, and the page's GET spends nothing. The link is looked up within the slug's club only;
// another club's token, an unknown, used or expired one answers 410 without data. The application goes to `new`, or
// onto the waiting list of a chosen group that is full (with its number).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceSessionlessLimits, tokenLimit } from '@/modules/foundation'
import type { ConfirmResult } from '../../../../../commands/applications'
import { tokenBodySchema } from '../../../../../data/validators'
import { errorSchema, publicRoute, routeParam, sessionlessContext, type RouteContext } from '../../../../shared'

export const metadata = {
  POST: { requireAuth: false, rateLimit: { points: 30, duration: 600, keyPrefix: 'enrolment_public_confirm' } },
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return publicRoute('enrolment.public.confirm', async () => {
    const body: unknown = await request.json().catch(() => null)
    const parsed = tokenBodySchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: 'Validation failed' }, { status: 400 })
    const limited = await enforceSessionlessLimits(request, [
      tokenLimit('enrolment_confirm_token_write', parsed.data.token, 'write'),
    ])
    if (limited) return limited
    const ctx = await sessionlessContext(request)
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ConfirmResult>('enrolment.applications.confirm', {
        input: { ...parsed.data, clubSlug: await routeParam(context, 'clubSlug') },
        ctx,
      })
    return Response.json({
      state: result.entity.state,
      waitingNumber: result.waitingNumber,
      answerDays: result.answerDays,
    })
  })
}

const confirmedSchema = z.object({
  state: z.enum(['new', 'waiting']),
  waitingNumber: z.number().int().nullable().describe('The place on the waiting list of a full group'),
  answerDays: z.number().int(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Confirm an application',
  methods: {
    POST: {
      summary: 'Confirm an application with the e-mailed token',
      description:
        'Sessionless (REQ-J07). Spends the 1-hour link; the token goes in the body. Rate-limited per IP and per token.',
      requestBody: { contentType: 'application/json', schema: tokenBodySchema },
      responses: [{ status: 200, description: 'The application reached the club', schema: confirmedSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 410, description: '`token_link_expired`, `token_link_used`; no data', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: errorSchema },
      ],
    },
  },
}
