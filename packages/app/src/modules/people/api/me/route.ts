// `GET /api/people/me` and `PUT /api/people/me` — `people.persons.update_self` (club spec API table; REQ-001, REQ-002,
// REQ-006, REQ-035, REQ-037; #27). The member's own profile: the person linked to the session's user in the session's
// organization, the active wards with their guardianship consents, the active staff roles, the acting contexts, the
// resolved interface locale (DD-34) and whether the payments tile may be shown (R10); E06-S22 (#104) adds the wards'
// age, the consent authors' names and the member's own active guardians with their consents. 404 `person_not_linked` when the
// account is linked to no person (the UI says "Account not linked to a person — contact the club"). The scope comes
// only from the session: no id in the path or the body names the person.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { peopleErrors } from '../../api/errors'
import type { UpdateSelfResult } from '../../commands/self'
import { selfUpdateSchema } from '../../data/validators'
import { GUARDIAN_RELATIONS } from '../../lib/people-rules'
import { loadMemberProfile } from '../../services/member-profile'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.self'] },
  PUT: { requireAuth: true, requireFeatures: ['people.self'] },
}

async function sessionProfile(request: Request) {
  const ctx = await commandContextForRequest(request)
  const scope = ctx ? trustedScopeOf(ctx) : null
  if (!ctx?.auth || !scope) return null
  return { ctx, scope }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await sessionProfile(request)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const profile = await loadMemberProfile(session.ctx, session.scope)
    if (!profile) return await peopleErrors.throw('person_not_linked')
    return Response.json(profile, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'people.me.read')
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const session = await sessionProfile(request)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = session.ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, UpdateSelfResult>('people.persons.update_self', {
      input: body,
      ctx: session.ctx,
    })
    const profile = await loadMemberProfile(session.ctx, session.scope)
    if (!profile) return await peopleErrors.throw('person_not_linked')
    return Response.json(
      { person: profile.person, locale: profile.locale, actingRole: result.actingRole },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'people.me.update')
  }
}

const selfConsentSchema = z.object({ granted: z.boolean(), at: z.string().nullable() })

const memberConsentSchema = z.object({
  granted: z.boolean(),
  at: z.string().nullable(),
  byPersonId: z.string().nullable(),
  byName: z
    .string()
    .nullable()
    .describe('The name of the last author when family (the ward or a guardian of the ward); null otherwise'),
  byRole: z
    .enum(['club_admin', 'coordinator', 'coach', 'staff'])
    .nullable()
    .describe('The role label of the last author outside the family (#191); null for a family author or never set'),
})

const memberConsentsSchema = z.object({
  regulations: memberConsentSchema,
  image: memberConsentSchema,
  trips: memberConsentSchema,
})

const memberPersonSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  birthDate: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  preferredLocale: z.string().nullable().describe('null = the club default locale'),
  consents: z.object({
    shareContactWithCoaches: selfConsentSchema,
    sharePresenceWithGuardians: selfConsentSchema,
    publishNameConsent: selfConsentSchema.describe(
      'The consent of an instructor to show "First L." on the public club pages (DD-29)',
    ),
  }),
  updatedAt: z.string().nullable().describe('Lock token of PUT /api/people/me'),
})

const memberProfileSchema = z.object({
  person: memberPersonSchema,
  wards: z.array(
    z.object({
      personId: z.uuid(),
      firstName: z.string(),
      lastName: z.string(),
      birthDate: z.string().nullable(),
      age: z.number().int().nullable().describe('Completed years on the club day'),
      hasAccount: z.boolean(),
      guardianship: z.object({
        id: z.uuid(),
        relation: z.enum(GUARDIAN_RELATIONS),
        isPrimaryPayer: z.boolean(),
        validFrom: z.string(),
        validTo: z.string().nullable(),
        consents: memberConsentsSchema,
        updatedAt: z.string().nullable().describe('Lock token of POST /api/people/guardianships/{id}/consents'),
      }),
    }),
  ),
  guardians: z
    .array(
      z.object({
        guardianshipId: z.uuid(),
        firstName: z.string(),
        lastName: z.string(),
        relation: z.enum(GUARDIAN_RELATIONS),
        consents: memberConsentsSchema,
      }),
    )
    .describe("The member's own active guardians and the consents they gave (read-only for the member)"),
  roles: z.array(z.object({ role: z.string(), sectionId: z.string().nullable() })),
  contexts: z.array(z.string()).describe('Acting contexts of the role-context switcher (self, guardian, …)'),
  locale: z.string().describe('The resolved interface locale: preferred → club default → request → en'),
  club: z.object({
    shortName: z.string().nullable(),
    defaultLocale: z.string(),
    timezone: z.string(),
    logoUrl: z.string().nullable().describe('The club logo (#29); null shows the club name only'),
  }),
  paymentsVisible: z.boolean().describe('False for a minor (R10) and without payments.view_own'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'The member profile of the signed-in user',
  methods: {
    GET: {
      summary: 'Read own profile, wards and consents',
      description:
        "The person linked to the signed-in user in the session organization, the active wards with their age and consents (with the authors' names), the member's own active guardians with their consents, the active staff roles, the acting contexts and the resolved locale. 404 `person_not_linked` when the account is linked to no person.",
      responses: [{ status: 200, description: 'The member profile', schema: memberProfileSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: 'person_not_linked', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Change own language, contact details and consents',
      description:
        '`preferredLocale` (null = the club default; an unknown locale → 422 `locale_unsupported`), `phone` (a changed number must be Polish or E.164, else 422 `phone_invalid`), `email`, and the consents `shareContactWithCoaches`, `sharePresenceWithGuardians` and `publishNameConsent` (`true` gives with the date, `false` withdraws, absent keeps). Send the person lock token (`person.updatedAt`) in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: selfUpdateSchema },
      responses: [
        {
          status: 200,
          description: 'The changed person and the resolved locale',
          schema: z.object({ person: memberPersonSchema, locale: z.string(), actingRole: z.string() }),
        },
      ],
      errors: [
        { status: 400, description: 'Validation failed, `lock_token_required`', schema: errorSchema },
        { status: 404, description: 'person_not_linked', schema: errorSchema },
        { status: 409, description: 'optimistic_lock_conflict', schema: errorSchema },
        {
          status: 422,
          description: '`locale_unsupported`; `phone_invalid` (not a Polish number or E.164, with `fieldErrors.phone`)',
          schema: errorSchema,
        },
      ],
    },
  },
}
