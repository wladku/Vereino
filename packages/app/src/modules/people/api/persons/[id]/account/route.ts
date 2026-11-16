// `POST /api/people/persons/{id}/account` — `people.persons.create_account` (club spec API table; foundation P-07,
// TEST-F04): 201 `{ userId, warning? }`; 409 `account_exists` / `email_taken`; 422 `account_age_below_threshold`.
// `PUT` — `people.persons.update_account` and `DELETE` — `people.persons.close_account` (people life-cycle spec REQ-L02,
// phase L1; #303): the login e-mail and the block, with the person's version; closing the account.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type {
  CloseAccountCommandResult,
  CreateAccountCommandResult,
  UpdateAccountCommandResult,
} from '../../../../commands/accounts'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.accounts.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['people.accounts.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['people.accounts.manage'] },
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

const updateBodySchema = z.object({ email: z.email().optional(), blocked: z.boolean().optional() })

const accountSchema = z.object({
  state: z.enum(['none', 'invited', 'active', 'blocked']),
  email: z.string().nullable(),
  invitedAt: z.string().nullable(),
  lastSignInAt: z.string().nullable(),
})

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, UpdateAccountCommandResult>('people.persons.update_account', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json({
      account: result.account,
      updatedAt: result.updatedAt,
      ...(result.warning ? { warning: result.warning } : {}),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.update_account')
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    await commandBus.execute<unknown, CloseAccountCommandResult>('people.persons.close_account', {
      input: { id },
      ctx,
    })
    return new Response(null, { status: 204 })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.close_account')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Create an account for a person',
  methods: {
    POST: {
      summary: "Create the person's account and send the invitation",
      description:
        "Applies the club's `own_account_min_age`, creates the user with the person's desired roles and sends the password-setup invitation (in the request locale). `warning: invite_email_failed` means the account exists but the e-mail failed; send it again through `POST /api/people/persons/{id}/account/invitation`.",
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
    PUT: {
      summary: "Change the login e-mail or block the person's account",
      description:
        "Send the person's `updatedAt` as the optimistic-lock header. A new `email` changes the login (the contact e-mail follows only when it equalled the old login; an invited account gets the invitation again at the new address). `blocked: true` ends the user's sessions and refuses sign-in until `blocked: false`; roles and data stay. Returns the new `account` and the person's `updatedAt`.",
      requestBody: { contentType: 'application/json', schema: updateBodySchema },
      responses: [
        {
          status: 200,
          description: 'Account updated',
          schema: z.object({
            account: accountSchema,
            updatedAt: z.string(),
            warning: z.literal('invite_email_failed').optional(),
          }),
        },
      ],
      errors: [
        { status: 400, description: 'Validation failed, lock_token_required', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found, account_not_found', schema: errorSchema },
        { status: 409, description: 'email_taken, optimistic_lock_conflict', schema: errorSchema },
        { status: 422, description: 'last_club_admin', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: "Close the person's account",
      description:
        "Deletes the platform user (its sessions, role links and pending links go with it) and clears the link on the person. Refused while the person holds an active role, guardianship or membership, and for the club's last active administrator.",
      responses: [{ status: 204, description: 'Account closed' }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found, account_not_found', schema: errorSchema },
        { status: 409, description: 'account_has_purpose', schema: errorSchema },
        { status: 422, description: 'last_club_admin', schema: errorSchema },
      ],
    },
  },
}
