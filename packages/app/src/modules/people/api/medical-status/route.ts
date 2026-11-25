// `GET /api/people/medical-status?personIds=…` (training outlines and medical expiry spec API table, REQ-O02, DD-O02,
// DD-O03; #682): the medical certificate status — red (missing, unreadable or passed), orange (under a month left),
// green — with the date, for the roster, the attendance list and a match's squad. Ids outside the caller's scope are
// dropped, never answered 403 one by one: the club administrator reads every person, a coordinator the members of their
// sections, a coach the members of their groups, a guardian the wards, a person themself. A read through a
// coordinator's or coach's grant is recorded first through `auditedRead` (DPIA D-14), ids only.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import {
  auditedRead,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { peopleErrors } from '../../api/errors'
import { PersonDataExportLog } from '../../data/entities'
import { clubToday } from '../../services/club-clock'
import { MEDICAL_STATUS_MAX_IDS, medicalStatusScopedIds, readMedicalStatuses } from '../../services/medical'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.medical.view'] },
}

/** The purpose recorded for a staff read of the status (ropa A15). */
export const MEDICAL_STATUS_PURPOSE = 'medical_status_read'

const querySchema = z.object({
  personIds: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    )
    .pipe(z.array(z.uuid())),
})

const itemSchema = z.object({
  personId: z.uuid(),
  status: z.enum(['red', 'orange', 'green']),
  state: z.enum(['missing', 'unknown', 'expired', 'expiring', 'valid']),
  validUntil: z.iso.date().nullable(),
})
const responseSchema = z.object({ items: z.array(itemSchema), today: z.iso.date() })

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const url = new URL(request.url)
    const { personIds } = querySchema.parse({ personIds: url.searchParams.get('personIds') ?? '' })
    if (personIds.length > MEDICAL_STATUS_MAX_IDS) await peopleErrors.throw('medical_status_too_many')
    const today = await clubToday(ctx.container, scope)
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const grants = await scopeContract.resolve(ctx)
    const allowed = await medicalStatusScopedIds(ctx.container, em, scope, grants, personIds, today)
    const read = () => readMedicalStatuses(em, scope, allowed.ids, today)
    const items =
      allowed.staff && allowed.ids.length > 0
        ? await auditedRead(
            ctx,
            {
              log: PersonDataExportLog,
              scope,
              actingRole: allowed.actingRole,
              resourceKind: 'people:person',
              resourceIds: allowed.ids,
              purpose: MEDICAL_STATUS_PURPOSE,
              fields: ['medical_valid_until'],
            },
            read,
          )
        : await read()
    return Response.json({ items, today }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'people.medical_status')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Medical certificate status of persons in scope',
  methods: {
    GET: {
      summary: 'Medical certificate status per person',
      description:
        "`personIds` is a comma-separated list of at most 200 person ids (400 `medical_status_too_many`). Each id the caller may read comes back with `status` (`red`, `orange`, `green`), `state` (`missing`, `unknown`, `expired`, `expiring`, `valid`) and `validUntil`; ids outside the caller's scope are left out. Red: no date, or the date passed; orange: today to today + 30 days; green: later — in the club's time zone. A coordinator's or coach's read is logged (ids only) before the data is read.",
      query: querySchema,
      responses: [{ status: 200, description: 'The statuses', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Validation failed, `medical_status_too_many`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
