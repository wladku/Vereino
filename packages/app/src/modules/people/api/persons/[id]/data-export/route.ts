// `GET /api/people/persons/{id}/data-export` (person data export spec *API* row, REQ-X01–X05, DD-X04, DD-X07; #527):
// the club administrator downloads one JSON file with everything Vereino holds about one person of the club, for an
// access (art. 15) or portability (art. 20) request. Fail closed: the trusted scope from the session, the person
// found in it (404 `person_not_found` otherwise, also for another club's person), then `assertInScope` with the
// `club_admin` grant only (403 `scope_denied` for a feature holder acting as anything else). Every export commits a
// `people_data_export_log` row before any data is read (`auditedRead`); a failed log write or a failed part is an
// uncoded 500 and no file. The file is streamed, never stored (`Cache-Control: no-store`), and its name carries the
// date only.
import { z } from 'zod'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  auditedRead,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { peopleErrors } from '../../../errors'
import { PersonDataExportLog } from '../../../../data/entities'
import { DATA_EXPORT_PURPOSE, DATA_EXPORT_RESOURCE_KIND, dataExportFileName } from '../../../../lib/data-export'
import { buildPersonDataExport } from '../../../../services/data-export'
import { findPerson } from '../../../../services/people-read'
import { errorSchema } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.persons.export'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const person = await findPerson(ctx.container, scope, id)
    if (!person) return await peopleErrors.throw('person_not_found')
    const actingRole = await assertInScope(await scopeContract.resolve(ctx), ['club_admin'], {
      id: person.id,
      tenantId: person.tenantId,
      organizationId: person.organizationId,
      personId: person.id,
    })
    const rbac = ctx.container.resolve<RbacService>('rbacService')
    const withPesel = await rbac.userHasAllFeatures(ctx.auth.sub, ['people.pesel.view'], scope)
    const now = new Date()
    const document = await auditedRead(
      ctx,
      {
        log: PersonDataExportLog,
        scope,
        actingRole,
        resourceKind: DATA_EXPORT_RESOURCE_KIND,
        resourceIds: [person.id],
        purpose: DATA_EXPORT_PURPOSE,
      },
      () => buildPersonDataExport(ctx.container, person, { withPesel, now }),
    )
    return new Response(JSON.stringify(document, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${dataExportFileName(now)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.data_export')
  }
}

const documentSchema = z.object({
  format: z.literal('vereino.person-data-export'),
  version: z.literal(1),
  generatedAt: z.string(),
  subject: z.record(z.string(), z.unknown()),
  sections: z.array(
    z.object({
      module: z.string(),
      table: z.string(),
      activity: z.string(),
      portable: z.boolean(),
      rows: z.array(z.record(z.string(), z.unknown())),
      omittedOtherAuthors: z.number().int().optional(),
      reviewFields: z.array(z.string()).optional(),
    }),
  ),
  actorCounts: z.array(z.object({ module: z.string(), table: z.string(), count: z.number().int() })),
  reviewRequired: z.array(z.object({ module: z.string(), table: z.string(), recordId: z.string(), field: z.string() })),
  omitted: z.array(
    z.object({
      module: z.string().optional(),
      category: z.string().optional(),
      reason: z.enum(['module_not_enabled', 'no_contributor', 'security_audit_not_subject_data', 'attachment_binary']),
    }),
  ),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Person data export',
  methods: {
    GET: {
      summary: "Export one person's data (access and portability requests)",
      description:
        'Returns, as a download (`Content-Disposition: attachment; filename="person-data-YYYY-MM-DD.json"`, `Cache-Control: no-store`), one JSON document (`format: vereino.person-data-export`, `version: 1`) with the person\'s rows from every Vereino module that holds data about them, encrypted values decrypted. Other people appear only as a relation, with a name only for a guardian, ward, payer, debtor, orderer or coach link (art. 15(4)); rows where the person acted as staff are counted per table (`actorCounts`); free-text fields that may name other people are listed in `reviewRequired`; modules not enabled, platform audit and access logs, application logs, backups and attachment binaries are listed in `omitted`. The PESEL is exported only with `people.pesel.view`. Only the club administrator of the person\'s organization (`club_admin` grant). Every call first commits a `people_data_export_log` row (actor, role, person, purpose); when it cannot be written, nothing is exported (500).',
      responses: [{ status: 200, description: 'The export document', schema: documentSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied` (not acting as the club administrator)', schema: errorSchema },
        { status: 404, description: "`person_not_found` (also another club's person)", schema: errorSchema },
      ],
    },
  },
}
