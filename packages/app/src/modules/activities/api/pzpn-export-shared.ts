// Shared pieces of `GET /api/activities/reports/pzpn-schedule` and `pzpn-attendance` (training outlines spec REQ-O10,
// DD-O09; #684): the handler that answers the CSV file — headers in the user's language, the locale's separator, a
// UTF-8 BOM — and the OpenAPI document both routes describe.
import { z } from 'zod'
import type { OpenApiMethodDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { pzpnExportQuerySchema } from '../data/validators'
import { csvSeparatorFor } from '../lib/coach-units'
import { pzpnCsv, pzpnFileName, type PzpnExportKind } from '../lib/pzpn-export'
import type { PzpnExportQuery, PzpnExportRows } from '../services/pzpn-export'
import type { ActivitiesScope } from '../services/directory'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { errorSchema } from './shared'

type Reader = (ctx: CommandRuntimeContext, scope: ActivitiesScope, query: PzpnExportQuery) => Promise<PzpnExportRows>
type Headers = (translate: (key: string, fallback: string) => string) => string[]

/** A GET handler that answers the export as a `text/csv` attachment. */
export function pzpnExportHandler(kind: PzpnExportKind, read: Reader, headers: Headers) {
  return async function GET(request: Request): Promise<Response> {
    try {
      const ctx = await commandContextForRequest(request)
      const scope = ctx ? trustedScopeOf(ctx) : null
      if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      const query = pzpnExportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
      const { rows } = await read(ctx, scope, query)
      const { locale, translate } = await resolveTranslations()
      const csv = pzpnCsv(headers(translate), rows, csvSeparatorFor(locale))
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${pzpnFileName(kind, query.from, query.to)}"`,
          'cache-control': 'private, no-store',
        },
      })
    } catch (error: unknown) {
      return errorResponse(error, `activities.reports.pzpn_${kind}`)
    }
  }
}

const ACCESS =
  'With `activities.reports.view` the club administrator exports any team, a coordinator the teams of their sections; with `activities.reports.view_own` a coach the groups they coach. A team outside that reach answers the same 404 as an unknown one.'

/** The OpenAPI document of one export route. */
export function pzpnExportDoc(summary: string, columns: string): OpenApiMethodDoc {
  return {
    summary,
    description: `${columns} The file is UTF-8 with a BOM and CRLF line ends; the headers are in the user’s language and the separator is the locale’s (\`;\` where decimals take a comma, e.g. Polish; \`,\` otherwise). ${ACCESS} The period \`from\`…\`to\` covers at most 366 days. Errors: 400 \`report_period_invalid\`, 403 \`scope_denied\`, 404 \`report_group_not_found\`.`,
    query: pzpnExportQuerySchema,
    responses: [{ status: 200, description: 'A `text/csv` file', schema: z.string() }],
    errors: [
      { status: 400, description: 'report_period_invalid, validation failed', schema: errorSchema },
      { status: 401, description: 'Unauthorized', schema: errorSchema },
      { status: 403, description: 'scope_denied', schema: errorSchema },
      { status: 404, description: 'report_group_not_found', schema: errorSchema },
    ],
  }
}
