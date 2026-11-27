// `POST /api/enrolment/public/{clubSlug}/sections/{sectionSlug}/applications` → `enrolment.applications.submit`
// (sign-up form spec P-J2, BR-J1…BR-J3, REQ-J04…REQ-J08, DD-J08; #799): a sessionless application. The honeypot
// `website` is refused (422 `application_refused`) before anything is read; field errors answer 422 with
// `fieldErrors`. Limits: per client IP in `metadata`, then per address 5 an hour, failing closed (503 when the
// limiter cannot count). Answers 202 `{ status: 'pending_confirmation' }` for every accepted input, a repeated
// application too (BR-J3), so the form never tells whether an address or a child is known.
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { emailSubjectLimit, enforceSessionlessLimits } from '@/modules/foundation'
import { enrolmentErrors } from '../../../../../errors'
import { applicationSubmitSchema } from '../../../../../../data/validators'
import {
  NO_STORE,
  acceptedSchema,
  errorSchema,
  fieldErrorResponse,
  publicRoute,
  routeParam,
  sessionlessContext,
  type RouteContext,
} from '../../../../../shared'

/** 10 applications per 10 minutes per client IP (S8.6 "public forms"). */
export const metadata = {
  POST: { requireAuth: false, rateLimit: { points: 10, duration: 600, keyPrefix: 'enrolment_public_application' } },
}

/** 5 applications an hour per address, whatever the IP (DD-J08). */
const EMAIL_WINDOW = { points: 5, duration: 3600 }

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return publicRoute('enrolment.public.submit', async () => {
    const body: unknown = await request.json().catch(() => null)
    const honeypot = (body as { website?: unknown } | null)?.website
    if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
      const error = await enrolmentErrors.create('application_refused')
      return Response.json(error.body, { status: error.status })
    }
    const parsed = applicationSubmitSchema.safeParse(body)
    if (!parsed.success) return fieldErrorResponse(parsed.error.issues)
    const limited = await enforceSessionlessLimits(
      request,
      [emailSubjectLimit('enrolment_application_email', parsed.data.email, EMAIL_WINDOW)],
      { failClosed: true },
    )
    if (limited) return limited
    const ctx = await sessionlessContext(request)
    await ctx.container.resolve<CommandBus>('commandBus').execute('enrolment.applications.submit', {
      input: {
        clubSlug: await routeParam(context, 'clubSlug'),
        sectionSlug: await routeParam(context, 'sectionSlug'),
        application: body,
      },
      ctx,
    })
    return Response.json({ status: 'pending_confirmation' }, { status: 202, headers: NO_STORE })
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Apply to a section',
  methods: {
    POST: {
      summary: 'Send an application to a section',
      description:
        'Sessionless (REQ-J04). `website` is a honeypot (leave it empty). Stores the application unconfirmed and e-mails a confirmation link valid for 1 hour; nothing reaches the club before the confirmation. A repeated application answers the same and sends a new link. Rate-limited per client IP and per e-mail address (failing closed).',
      requestBody: { contentType: 'application/json', schema: applicationSubmitSchema },
      responses: [{ status: 202, description: 'The confirmation e-mail is on its way', schema: acceptedSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 404, description: '`applications_closed`', schema: errorSchema },
        {
          status: 422,
          description:
            '`application_field_invalid` (with `fieldErrors`), `application_refused` (honeypot), `birth_date_future`, `age_out_of_bounds`, `application_group_invalid`',
          schema: errorSchema,
        },
        { status: 429, description: 'Too many requests (per IP or per e-mail)', schema: errorSchema },
        { status: 503, description: 'The per-e-mail limiter is unavailable', schema: errorSchema },
      ],
    },
  },
}
