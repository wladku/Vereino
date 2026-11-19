// `POST /api/groups/memberships/move` — `groups.memberships.move` (people life-cycle spec REQ-L11, DD-L15, *API* row
// `groups.memberships.move`; #312): moves a membership to another group from `date`. The old membership ends on the day
// before `date` and one of the same role starts in the target group on `date`, in one transaction. The caller holds
// `groups.manage` and both groups lie in their scope; send the moved membership's lock token in the platform
// optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { MembershipMoveResult } from '../../../commands/memberships'
import { errorSchema, membershipListItemSchema, membershipView } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['groups.manage'] },
}

const bodySchema = z.object({
  membershipId: z.uuid(),
  toGroupId: z.uuid(),
  date: z.string().describe('The first day in the target group (YYYY-MM-DD); the old membership ends the day before'),
})

const membershipSchema = membershipListItemSchema.omit({ person: true })
const responseSchema = z.object({ ended: membershipSchema, started: membershipSchema, actingRole: z.string() })

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => null)
    const parsed = bodySchema.parse(body)
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, MembershipMoveResult>('groups.memberships.move', {
        input: { id: parsed.membershipId, toGroupId: parsed.toGroupId, date: parsed.date },
        ctx,
      })
    return Response.json({
      ended: membershipView(result.entity),
      started: membershipView(result.started),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'groups.memberships.move')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Groups',
  summary: 'Move a membership to another group',
  methods: {
    POST: {
      summary: 'Move a group membership to another group',
      description:
        "Ends the membership on the day before `date` and starts one of the same role in the target group on `date`, in one transaction; undoable. The old group's undecided declarations after the last day are dropped, and the month's fee is charged once. Send the moved membership's lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied` (either group outside the caller's sections), 404, 409 `optimistic_lock_conflict`, 409 `membership_overlap` (a membership of the same person and role in the target group overlaps), 422 `membership_not_started` (the membership has not started, or `date` is not after its first day), 422 `groups_reference_invalid` (the same, an unknown or an inactive target group, or a membership over before `date`).",
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The ended and the started membership', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid body or lock_token_required', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'optimistic_lock_conflict or membership_overlap', schema: errorSchema },
        { status: 422, description: 'membership_not_started or groups_reference_invalid', schema: errorSchema },
      ],
    },
  },
}
