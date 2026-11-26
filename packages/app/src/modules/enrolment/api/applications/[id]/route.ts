// `GET /api/enrolment/applications/{id}` (sign-up form spec M-J3, REQ-J11, BR-J5; #799): one application of a section
// the caller decides — the data of BR-J1 decrypted, the flags, the age on the reference date, the possible duplicates
// (ids), the section's groups with their places and fit for the waiting-list sheet. An application of another
// section or club, or an unconfirmed one, answers 404 (D-034). The read is recorded in the platform access log
// (purpose `enrolment.decide`); the module's own read log comes with the coaches' reads of phase 4.
import { z } from 'zod'
import type { AccessLogService } from '@open-mercato/core/modules/audit_logs/services/accessLogService'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { errorResponse } from '@/modules/foundation'
import { enrolmentErrors } from '../../errors'
import { applicationDetail } from '../../../services/views'
import { errorSchema, listItemSchema, memberContext } from '../../shared'

const logger = createLogger('enrolment').child({ component: 'application-detail' })

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['enrolment.applications.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return await enrolmentErrors.throw('application_not_found')
    const member = await memberContext(request)
    if (!member.ok) return member.error
    const detail = await applicationDetail(
      { container: member.ctx.container, scope: member.scope, grants: member.grants },
      params.data.id,
    )
    if (!detail) return await enrolmentErrors.throw('application_not_found')
    try {
      await member.ctx.container.resolve<AccessLogService>('accessLogService').logMany([
        {
          ...member.scope,
          actorUserId: member.ctx.auth.sub,
          resourceKind: 'enrolment:application',
          resourceId: detail.id,
          accessType: 'read',
          fields: ['participant', 'guardian', 'contact', 'note'],
          context: { purpose: 'enrolment.decide' },
        },
      ])
    } catch (error: unknown) {
      logger.warn('Access log write failed', { err: error })
    }
    return Response.json(detail, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'enrolment.applications.detail')
  }
}

const detailSchema = listItemSchema.extend({
  participantFirstName: z.string().nullable(),
  participantLastName: z.string().nullable(),
  participantBirthDate: z.string().nullable(),
  guardianFirstName: z.string().nullable(),
  guardianLastName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
  wantsTrial: z.boolean(),
  experience: z.string().nullable(),
  ageFit: z.enum(['fits', 'outside', 'unknown']),
  decisionReason: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  anonymized: z.boolean(),
  duplicates: z.array(z.object({ personId: z.uuid(), role: z.string(), reason: z.string() })),
  groups: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      full: z.boolean(),
      placesLimit: z.number().int().nullable(),
      occupied: z.number().int(),
      ageFit: z.string(),
    }),
  ),
  canDecide: z.boolean(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Application',
  methods: {
    GET: {
      summary: 'One application of a section the caller decides',
      responses: [{ status: 200, description: 'The application', schema: detailSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: '`application_not_found`', schema: errorSchema },
      ],
    },
  },
}
