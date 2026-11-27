// `POST /api/enrolment/applications/{id}/accept` → `enrolment.applications.accept` (sign-up form spec M-J3, BR-J4,
// BR-J6, DD-J10, DD-J10a, REQ-J12…REQ-J14; phase 3, #800): accepts an open application into a group of its section
// from a start day — the persons (new, or a possible duplicate reused), the guardianship, the membership and, after the
// commit, the account invitation. Not undoable. The body carries `updatedAt` (409 `optimistic_lock_conflict`); an
// application of another section or club answers 404.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { AcceptResult } from '../../../../commands/accept'
import { enrolmentErrors } from '../../../errors'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['enrolment.applications.decide'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const bodySchema = z.object({
  groupId: z.uuid(),
  startDay: z.string().describe('YYYY-MM-DD, today or later, within the season of the reference date'),
  child: z.object({ personId: z.uuid().nullable().optional() }).optional(),
  guardian: z
    .object({ personId: z.uuid().nullable().optional(), birthDate: z.string().nullable().optional() })
    .optional(),
  overLimit: z.boolean().optional().describe('Accept into a full group (BR-J4)'),
  sendInvitation: z.boolean().optional().describe('The account invitation of the guardian or the adult (default on)'),
  updatedAt: z.string(),
})

const acceptedSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  state: z.literal('accepted'),
  updatedAt: z.string(),
  membershipId: z.uuid(),
  participantPersonId: z.uuid(),
  guardianPersonId: z.uuid().nullable(),
  invitation: z.enum(['sent', 'skipped', 'failed']),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return await enrolmentErrors.throw('application_not_found')
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const input = { ...(body && typeof body === 'object' ? body : {}), id: params.data.id }
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, AcceptResult>('enrolment.applications.accept', { input, ctx })
    return Response.json({
      ok: true,
      id: result.entity.id,
      state: result.entity.state,
      updatedAt: result.entity.updatedAt.toISOString(),
      membershipId: result.membershipId,
      participantPersonId: result.participantPersonId,
      guardianPersonId: result.guardianPersonId,
      invitation: result.invitation,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'enrolment.applications.accept')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Accept an application',
  methods: {
    POST: {
      summary:
        'Accepts an open application into a group of its section from a start day: persons, guardianship and membership in one transaction, then the account invitation (DD-J10). Not undoable.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'Accepted', schema: acceptedSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Missing feature `enrolment.applications.decide`', schema: errorSchema },
        { status: 404, description: '`application_not_found`', schema: errorSchema },
        {
          status: 409,
          description:
            '`group_full`, `participant_already_in_group`, `guardianship_duplicate`, `application_state_conflict`, `optimistic_lock_conflict`',
          schema: errorSchema,
        },
        {
          status: 422,
          description:
            '`start_day_invalid`, `application_group_invalid`, `accept_person_invalid`, `invitation_birth_date_required`',
          schema: errorSchema,
        },
      ],
    },
  },
}
