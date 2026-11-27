// `POST /api/people/persons/{id}/account/invitation-link` — `people.persons.share_invitation` (personal invitation link
// spec REQ-IL01, REQ-IL02, REQ-IL05; Q-IL05 approved 2026-11-26; #868): 200 `{ url, expiresAt }`, a new personal
// link valid 7 days that replaces the person's earlier ones; 404 for a person outside the caller's reach or without an
// account; 409 `invitation_not_pending`; 429 with `Retry-After` on the re-send limits it shares with
// `POST …/account/invitation` (3 per account in 5 minutes, 20 per staff member in an hour). Never cached.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import type { ShareInvitationCommandResult } from '../../../../../commands/accounts'
import { limitResend } from '../../../../../services/account-limits'
import { errorSchema } from '../../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.invitations.share'] },
}

const paramsSchema = z.object({ id: z.uuid() })

function noStore(response: Response): Response {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

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
    if (limited) return noStore(limited)
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ShareInvitationCommandResult>(
      'people.persons.share_invitation',
      { input: { id }, ctx },
    )
    return noStore(Response.json({ url: result.url, expiresAt: result.expiresAt }))
  } catch (error: unknown) {
    return noStore(errorResponse(error, 'people.persons.share_invitation'))
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Personal invitation link',
  methods: {
    POST: {
      summary: "Take the person's personal invitation link",
      description:
        "Only while the account is invited (no password, never signed in). The club administrator may take it for any person; a coach for an active guardian of a child in a group they coach; a coordinator for one of a child in a section they coordinate — anyone else gets 404, as for an unknown id. Returns a new link on the club's address, valid 7 days; the person's earlier links stop working. The link is recorded in the audit log with the staff member (never the link itself). Shares the re-send limits with `POST …/account/invitation`: at most 3 per account in 5 minutes and 20 per staff member in an hour (429 with `Retry-After`). `Cache-Control: no-store`.",
      responses: [
        {
          status: 200,
          description: 'A new personal invitation link',
          schema: z.object({ url: z.string(), expiresAt: z.string() }),
        },
      ],
      errors: [
        {
          status: 404,
          description: 'Not found, account_not_found (also outside the caller’s reach)',
          schema: errorSchema,
        },
        { status: 409, description: 'invitation_not_pending', schema: errorSchema },
        {
          status: 429,
          description: 'Too many invitations',
          schema: z.object({ error: z.string(), code: z.literal('rate_limited'), retryAfterSeconds: z.number() }),
        },
      ],
    },
  },
}
