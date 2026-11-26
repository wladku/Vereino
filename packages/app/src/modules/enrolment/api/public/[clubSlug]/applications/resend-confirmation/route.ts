// `POST /api/enrolment/public/{clubSlug}/applications/resend-confirmation` → `enrolment.applications.resend_confirmation`
// (sign-up form spec P-J2 "Send again", DD-J06, DD-J08; #799): a new confirmation link for each of the address's
// unconfirmed applications in that club (the old links stop working). Uniform 202 whether or not the address is known;
// per address 3 an hour, failing closed.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { emailSubjectLimit, enforceSessionlessLimits } from '@/modules/foundation'
import { emailBodySchema } from '../../../../../data/validators'
import { errorSchema, publicRoute, routeParam, sessionlessContext, type RouteContext } from '../../../../shared'

export const metadata = {
  POST: {
    requireAuth: false,
    rateLimit: { points: 10, duration: 600, keyPrefix: 'enrolment_public_resend_confirmation' },
  },
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return publicRoute('enrolment.public.resend_confirmation', async () => {
    const body: unknown = await request.json().catch(() => null)
    const parsed = emailBodySchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: 'Validation failed' }, { status: 400 })
    const clubSlug = await routeParam(context, 'clubSlug')
    const limited = await enforceSessionlessLimits(
      request,
      [emailSubjectLimit('enrolment_resend_confirmation_email', parsed.data.email, { points: 3, duration: 3600 })],
      { failClosed: true },
    )
    if (limited) return limited
    const ctx = await sessionlessContext(request)
    await ctx.container.resolve<CommandBus>('commandBus').execute('enrolment.applications.resend_confirmation', {
      input: { ...parsed.data, clubSlug },
      ctx,
    })
    return Response.json({ status: 'accepted' }, { status: 202 })
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'New application link',
  methods: {
    POST: {
      summary: 'E-mail new application links to an address',
      description: 'Sessionless. Always 202: the answer never tells whether the address is known.',
      requestBody: { contentType: 'application/json', schema: emailBodySchema },
      responses: [{ status: 202, description: 'Accepted', schema: z.object({ status: z.literal('accepted') }) }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: errorSchema },
        { status: 503, description: 'The per-e-mail limiter is unavailable', schema: errorSchema },
      ],
    },
  },
}
