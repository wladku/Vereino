// `POST /api/enrolment/public/{clubSlug}/applications/resend-link` → `enrolment.applications.resend_link`
// (sign-up form spec P-J4 "Send me a new link", DD-J07; #799): a new status link for each of the address's open
// applications in that club (the old links stop working). Uniform 202 whether or not the address is known; per address
// and club 3 an hour (`linkRequestEmailLimit`): a spent limit sends nothing and still answers 202.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { linkRequestEmailLimit, sessionlessSubjectAllowed } from '@/modules/foundation'
import { emailBodySchema } from '../../../../../data/validators'
import { errorSchema, publicRoute, routeParam, sessionlessContext, type RouteContext } from '../../../../shared'

export const metadata = {
  POST: { requireAuth: false, rateLimit: { points: 10, duration: 600, keyPrefix: 'enrolment_public_resend_link' } },
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return publicRoute('enrolment.public.resend_link', async () => {
    const body: unknown = await request.json().catch(() => null)
    const parsed = emailBodySchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: 'Validation failed' }, { status: 400 })
    const clubSlug = await routeParam(context, 'clubSlug')
    if (
      !(await sessionlessSubjectAllowed(
        request,
        linkRequestEmailLimit('enrolment_resend_link_email', clubSlug, parsed.data.email),
      ))
    ) {
      return Response.json({ status: 'accepted' }, { status: 202 })
    }
    const ctx = await sessionlessContext(request)
    await ctx.container.resolve<CommandBus>('commandBus').execute('enrolment.applications.resend_link', {
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
