// `GET /api/activities/occurrences/{id}/guardian-contacts` (club spec API row, REQ-037, DD-39, TEST-052; foundation II
// J-G03, P-27; #34): the phone and e-mail of the consenting guardians (with an account) of the session's participants,
// for a coach of the session's group or the coach assigned to it. A `GET` is not a command, so the read writes its own
// audit row (`activities_contact_access_log`: actor, role, session, person ids, purpose — never the values) and commits
// it before the contacts are read; the platform access log gets a mirror row per guardian.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { readGuardianContacts } from '../../../../services/guardian-contacts'
import { errorSchema } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.coach'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const personRefSchema = z.object({ personId: z.uuid(), firstName: z.string(), lastName: z.string() })

const contactsSchema = z.object({
  items: z.array(
    personRefSchema.extend({
      phone: z.string().nullable(),
      email: z.string().nullable(),
      wards: z.array(personRefSchema).describe('The session’s participants this guardian is responsible for'),
    }),
  ),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
})

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const page = await readGuardianContacts(ctx, scope, id)
    if (!page) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(page, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.guardian_contacts')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Guardian contacts of a session for its coach',
  methods: {
    GET: {
      summary: 'Read the consenting guardians’ phone and e-mail (audited)',
      description:
        'The guardians of the session’s participants who gave the consent to share their contact details with coaches and have an account, with the wards they are responsible for. Only a coach of the session’s group or the coach assigned to the session reads it. Every read is recorded (actor, session, person ids — never the values) before the data is returned.',
      responses: [{ status: 200, description: 'The consenting guardians’ contacts', schema: contactsSchema }],
      errors: [
        { status: 403, description: 'scope_denied (not a coach of the session)', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
