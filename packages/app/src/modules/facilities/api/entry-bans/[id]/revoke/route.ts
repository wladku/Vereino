// `POST /api/facilities/entry-bans/{id}/revoke` — `facilities.entry_bans.revoke` (facilities spec *Data Models* →
// `facilities_entry_bans`: "revocation via `revoked_at`, no deletion"; REQ-016; B-27; #126): the club administrator
// ends a ban; from then on a rental for that renter is no longer refused. A ban already revoked answers 409
// `entry_ban_revoked`. The lock token travels in the platform optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { EntryBanCommandResult } from '../../../../commands/entry-bans'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['facilities.incidents.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  revokedAt: z.string(),
  updatedAt: z.string(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, EntryBanCommandResult>('facilities.entry_bans.revoke', {
      input: { id },
      ctx,
    })
    const row = result.entity
    return Response.json({
      ok: true,
      id: row.id,
      revokedAt: (row.revokedAt as Date).toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.entry_bans.revoke')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Revoke an entry ban',
  methods: {
    POST: {
      summary: 'Revoke an entry ban',
      description:
        'Ends an entry ban (B-27); the ban stays in the register with its revocation time. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      responses: [{ status: 200, description: 'The revoked ban', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`entry_ban_revoked`, `optimistic_lock_conflict`', schema: errorSchema },
      ],
    },
  },
}
