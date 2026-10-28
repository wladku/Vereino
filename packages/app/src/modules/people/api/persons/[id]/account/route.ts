// `POST /api/people/persons/{id}/account` — `people.persons.create_account` (club spec API table; foundation P-07,
// TEST-F04): 201 `{ userId, warning? }`; 409 `account_exists` / `email_taken`; 422 `account_age_below_threshold`.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { CreateAccountCommandResult } from '../../../../commands/accounts'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.accounts.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ email: z.email() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, CreateAccountCommandResult>('people.persons.create_account', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json(
      { userId: result.userId, ...(result.warning ? { warning: result.warning } : {}) },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.create_account')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Create an account for a person',
  methods: {
    POST: {
      summary: "Create the person's account and send the invitation",
      description:
        "Applies the club's `own_account_min_age`, creates the user with the person's desired roles and sends the password-setup invitation (in the request locale). `warning: invite_email_failed` means the account exists but the e-mail failed; resend it through `POST /api/auth/users/resend-invite`.",
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [
        {
          status: 201,
          description: 'Account created',
          schema: z.object({ userId: z.uuid(), warning: z.literal('invite_email_failed').optional() }),
        },
      ],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'account_exists, email_taken', schema: errorSchema },
        { status: 422, description: 'account_age_below_threshold, account_birth_date_required', schema: errorSchema },
      ],
    },
  },
}
