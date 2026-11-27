// `GET /api/enrolment/groups/{id}/sign-up-code` (E29-S02, #869; D41, D44): the public address of the section sign-up
// form with this group chosen, for the QR code a coach or coordinator shows on the group page or prints. `open` only
// while a parent scanning it would get the form with the group offered; `closed` otherwise. Reading a group's page
// needs `groups.view`, and so does this: the answer holds only public slugs and the group's id. A group of another
// club, or an unknown id, answers 404 (D-034).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { enrolmentErrors } from '../../../errors'
import { groupSignUpCode } from '../../../../services/sign-up-code'
import { NO_STORE, errorSchema, memberContext } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['groups.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return await enrolmentErrors.throw('group_not_found')
    const member = await memberContext(request)
    if (!member.ok) return member.error
    const code = await groupSignUpCode(member.ctx.container, member.scope, params.data.id)
    if (code.status === 'not_found') return await enrolmentErrors.throw('group_not_found')
    return Response.json(code, { headers: NO_STORE })
  } catch (error: unknown) {
    return errorResponse(error, 'enrolment.groups.sign_up_code')
  }
}

const signUpCodeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('open'),
    url: z.string().describe("The form's absolute address on the club's address, with `?group={id}`"),
    clubName: z.string(),
    sectionName: z.string(),
    groupName: z.string(),
  }),
  z.object({
    status: z.literal('closed').describe('A parent scanning the code now would see that sign-ups are closed'),
    groupName: z.string(),
  }),
])

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Group sign-up code',
  methods: {
    GET: {
      summary: "The address of the section's sign-up form with this group chosen",
      description: 'For the QR code on the group page. Public slugs and the group id only; no token, nothing personal.',
      responses: [{ status: 200, description: 'The code, or closed', schema: signUpCodeSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: '`group_not_found`', schema: errorSchema },
      ],
    },
  },
}
