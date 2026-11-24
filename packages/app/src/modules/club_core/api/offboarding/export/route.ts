// `/api/club_core/offboarding/export` (many clubs spec phase 4, REQ-M06, *API* table; E22-S06b, #676; owner's approval
// on #676, 2026-11-23): the club administrator's export of their own club. `POST` starts a queued export (command
// `club_core.clubs.export_request`, then the `club_core:club-export` worker) and answers 202 with the progress job;
// `GET` downloads the newest finished archive. Both answer for the caller's own club only: the scope comes from the
// session, never from the request. 409 `export_running` while an export is pending or running.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import type { RequestClubExportResult } from '../../../commands/offboarding'
import { publishClubExport, readClubExportArchive } from '../../../services/club-export'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['club_core.manage'] },
  POST: { requireAuth: true, requireFeatures: ['club_core.manage'] },
}

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const body: unknown = await request.json().catch(() => ({}))
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, RequestClubExportResult>('club_core.clubs.export_request', { input: body ?? {}, ctx })
    await publishClubExport(ctx.container, {
      jobId: result.jobId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
    })
    return Response.json({ jobId: result.jobId, status: 'pending' }, { status: 202 })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.offboarding.export.start')
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return unauthorized()
    const archive = await readClubExportArchive(ctx.container, scope)
    return new Response(new Uint8Array(archive.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(archive.buffer.length),
        'Content-Disposition': `attachment; filename="${archive.fileName}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.offboarding.export.download')
  }
}

const startedSchema = z.object({
  jobId: z.uuid().describe('The platform progress job of the export'),
  status: z.literal('pending'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: "The club administrator's club data export",
  methods: {
    POST: {
      summary: 'Start an export of the club data',
      description:
        "Queues an export of every row and file of the caller's club into one ZIP archive (the operator's `club_core export-club` format), stored privately. Allowed only to the club administrator while a notice period is recorded. Follow the job through `GET /api/club_core/offboarding` (`export.status`) or the platform progress bar, then download the archive with `GET`. A newer export replaces the older archive. The request is audited.",
      requestBody: { contentType: 'application/json', schema: z.object({}).strict() },
      responses: [{ status: 202, description: 'Export queued', schema: startedSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Missing `club_core.manage`, or `scope_denied`', schema: errorSchema },
        {
          status: 409,
          description: '`export_unavailable` (no notice recorded), `export_running` (an export is pending or running)',
          schema: errorSchema,
        },
      ],
    },
    GET: {
      summary: 'Download the newest club data export',
      description:
        "The newest finished archive of the caller's club as `application/zip` (`<slug>-export-<date>.zip`). The archive holds the club members' personal data: it is sent with `Cache-Control: no-store` and never by e-mail.",
      responses: [{ status: 200, description: 'The archive (application/zip)', schema: z.unknown() }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Missing `club_core.manage`', schema: errorSchema },
        { status: 404, description: '`export_not_found` (no finished export)', schema: errorSchema },
        { status: 409, description: '`export_running`', schema: errorSchema },
      ],
    },
  },
}
