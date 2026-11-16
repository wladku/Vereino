// `POST /api/people/persons/{id}/account/invitation` — `people.persons.resend_invitation` (people life-cycle spec
// REQ-L01, DD-L01; #303): 200 `{ sentAt, warning? }`; 404 without an account; 409 `invitation_not_pending`; 429 with
// `Retry-After` after 3 re-sends of the account in 5 minutes or 20 of the administrator in an hour.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import type { ResendInvitationCommandResult } from '../../../../../commands/accounts'
import { limitResend } from '../../../../../services/account-limits'
import { errorSchema } from '../../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.accounts.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const limited = await limitResend(ctx.container, request, {
      tenantId: scope.tenantId,
      personId: id,
      actorUserId: ctx.auth.sub,
    })
    if (limited) return limited
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ResendInvitationCommandResult>(
      'people.persons.resend_invitation',
      { input: { id }, ctx },
    )
    return Response.json({ sentAt: result.sentAt, ...(result.warning ? { warning: result.warning } : {}) })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.resend_invitation')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Send the invitation again',
  methods: {
    POST: {
      summary: "Send the person's invitation again",
      description:
        'Only while the account is invited (no password, never signed in). Sends a new password-setup link valid 60 minutes; earlier links stay valid until they expire. `warning: invite_email_failed` means the e-mail failed and the action stays available. At most 3 re-sends per account in 5 minutes and 20 per administrator in an hour (429 with `Retry-After`).',
      responses: [
        {
          status: 200,
          description: 'Invitation sent again',
          schema: z.object({ sentAt: z.string(), warning: z.literal('invite_email_failed').optional() }),
        },
      ],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found, account_not_found', schema: errorSchema },
        { status: 409, description: 'invitation_not_pending', schema: errorSchema },
        {
          status: 429,
          description: 'Too many re-sends',
          schema: z.object({ error: z.string(), code: z.literal('rate_limited'), retryAfterSeconds: z.number() }),
        },
      ],
    },
  },
}
