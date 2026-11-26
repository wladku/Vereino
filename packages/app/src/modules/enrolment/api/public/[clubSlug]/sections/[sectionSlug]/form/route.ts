// `GET /api/enrolment/public/{clubSlug}/sections/{sectionSlug}/form` (sign-up form spec P-J1, P-J2, REQ-J03, REQ-J05,
// Q-J04; #799): the section's form — the club's header, the reference date the ages count on, the answer time, the
// texts and the offered groups (public, active, accepting) with their fit rule and a `full` flag, never a count.
// Sessionless: the club and the section come from the one slug lookup of `clubCorePublicSite`. 404
// `applications_closed` while the section (or every group) takes no applications. Per-IP 60 per minute; `no-store`.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enrolmentErrors } from '../../../../../errors'
import { publicForm } from '../../../../../../services/views'
import { errorSchema, publicRoute, routeParam, type RouteContext } from '../../../../../shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { points: 60, duration: 60, keyPrefix: 'enrolment_public_form' } },
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  return publicRoute('enrolment.public.form', async () => {
    const container = await createRequestContainer()
    const result = await publicForm(
      container,
      await routeParam(context, 'clubSlug'),
      await routeParam(context, 'sectionSlug'),
    )
    if (result.status !== 'ok') {
      const error = await enrolmentErrors.create('applications_closed', result.club ? { club: result.club } : undefined)
      return Response.json(error.body, { status: error.status })
    }
    return Response.json(result.value)
  })
}

const fitRuleSchema = z
  .union([
    z.object({
      kind: z.literal('birth_years'),
      uFrom: z.number().int(),
      uTo: z.number().int().nullable(),
      referenceYear: z.number().int(),
      from: z.number().int().nullable(),
      to: z.number().int(),
    }),
    z.object({ kind: z.literal('age'), ageFrom: z.number().int().nullable(), ageTo: z.number().int().nullable() }),
  ])
  .nullable()

const formSchema = z.object({
  club: z.object({ name: z.string(), slug: z.string() }).loose().describe("The club's public header"),
  section: z.object({ name: z.string(), slug: z.string() }),
  referenceDate: z.string().describe('The date ages count on (DD-J03)'),
  today: z.string(),
  answerDays: z.number().int(),
  informationText: z.string().nullable().describe("The club's information for applicants; null = the default text"),
  rulesUrl: z.string().nullable(),
  privacyPolicyUrl: z.string().nullable(),
  contactPhone: z.string().nullable(),
  groups: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      kind: z.string(),
      ageFrom: z.number().int().nullable(),
      ageTo: z.number().int().nullable(),
      ageCategoryLabel: z.string().nullable(),
      fitRule: fitRuleSchema,
      full: z.boolean().describe('The group is full today: a confirmed application goes onto its waiting list'),
    }),
  ),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Section sign-up form',
  methods: {
    GET: {
      summary: 'The sign-up form of a public section',
      description: 'Sessionless. The offered groups with their age rule and whether they are full; no counts.',
      responses: [{ status: 200, description: 'The form', schema: formSchema }],
      errors: [
        { status: 404, description: '`applications_closed`', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: errorSchema },
      ],
    },
  },
}
