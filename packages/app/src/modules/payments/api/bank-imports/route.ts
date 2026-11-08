// `/api/payments/bank-imports` — the statement import (payments spec API row `payments.bank_imports.create`; REQ-030,
// TEST-042; issue #113, B-29):
// - `POST` takes `multipart/form-data` with the `file` (CSV in the bank's column layout or MT940, up to 2 MB and 2000
//   lines), an optional `format` (`csv`/`mt940`, detected from the content otherwise) and an optional `columnProfile`
//   (JSON: the header text of the `date`, `amount`, `sender`, `title` and `account` columns). It answers the summary:
//   recorded, to confirm, unmatched and skipped (debits and transfers imported before), and the unreadable lines;
// - `GET` is the import history, newest first.
import { z } from 'zod'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { withStatement, type BankImportResult } from '../../commands/bank'
import { bankImportCreateSchema, bankImportListQuerySchema } from '../../data/validators'
import { listImports } from '../../services/bank'
import { paymentsErrors } from '../errors'
import { PAYMENTS_READ_KINDS, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.bank.import'] },
  POST: { requireAuth: true, requireFeatures: ['payments.bank.import'] },
}

/** The longest file name kept with an import. */
const MAX_FILE_NAME = 200

const summarySchema = z.object({
  ok: z.literal(true),
  importId: z.uuid(),
  format: z.enum(['csv', 'mt940']),
  total: z.number().int().describe('Every transfer line of the file'),
  booked: z.number().int().describe('Recorded automatically'),
  suggested: z.number().int().describe('To confirm'),
  unmatched: z.number().int(),
  skipped: z.number().int().describe('Debits and transfers imported before'),
  debits: z.number().int(),
  duplicates: z.number().int(),
  unreadable: z.array(z.number().int()).describe('Lines whose date or amount could not be read'),
  actingRole: z.string(),
})

const historySchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      fileName: z.string(),
      format: z.string(),
      total: z.number().int(),
      booked: z.number().int(),
      suggested: z.number().int(),
      unmatched: z.number().int(),
      skipped: z.number().int(),
      importedBy: z.object({ firstName: z.string(), lastName: z.string() }).nullable(),
      createdAt: z.string(),
    }),
  ),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

/** The form's text fields as the command input: an empty `format` is detection, `columnProfile` is JSON. */
function importFields(form: FormData): Record<string, unknown> {
  const format = form.get('format')
  const profile = form.get('columnProfile')
  let columnProfile: unknown = null
  if (typeof profile === 'string' && profile.trim()) {
    try {
      columnProfile = JSON.parse(profile)
    } catch {
      throw new CrudHttpError(400, { error: 'columnProfile must be JSON', field: 'columnProfile' })
    }
  }
  return {
    format: typeof format === 'string' && format.trim() && format !== 'auto' ? format.trim() : null,
    columnProfile,
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.container.hasRegistration('attachmentService')) {
      return Response.json({ error: 'Attachment service is unavailable' }, { status: 503 })
    }
    const service = ctx.container.resolve<AttachmentService>('attachmentService')
    if (!service.readUploadForm) return Response.json({ error: 'Attachment service is unavailable' }, { status: 503 })
    const form = await service.readUploadForm(request)
    const file = form.get('file')
    if (!file || typeof file === 'string')
      return await paymentsErrors.throw('bank_statement_missing', { field: 'file' })
    const upload = {
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: (file.name || 'statement').slice(0, MAX_FILE_NAME),
      mimeType: file.type || 'text/plain',
    }
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, BankImportResult>('payments.bank_imports.create', {
        input: importFields(form),
        ctx: withStatement(ctx, upload),
      })
    return Response.json(
      {
        ok: true,
        importId: result.entity.id,
        format: result.entity.format,
        total: result.total,
        booked: result.booked,
        suggested: result.suggested,
        unmatched: result.unmatched,
        skipped: result.skipped,
        debits: result.debits,
        duplicates: result.duplicates,
        unreadable: result.unreadable,
        actingRole: result.actingRole,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'payments.bank_imports.create')
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = bankImportListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: scope.organizationId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    const { items, total } = await listImports(ctx.container, scope, query)
    return Response.json({
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.bank_imports.list')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Bank statement imports',
  methods: {
    GET: {
      summary: 'Import history',
      description:
        'The club’s statement imports, newest first, with their counts at import time and who imported each.',
      query: bankImportListQuerySchema,
      responses: [{ status: 200, description: 'The imports', schema: historySchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Import a bank statement',
      description:
        '`multipart/form-data`: `file` (CSV or MT940), optional `format` and `columnProfile` (JSON). Stores the file privately, matches every incoming transfer to a payer and records confident matches when the club’s auto-recording is on; debits and transfers imported before are skipped.',
      requestBody: { contentType: 'multipart/form-data', schema: bankImportCreateSchema },
      responses: [{ status: 201, description: 'The import summary', schema: summarySchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 413, description: '`bank_statement_too_large`, `bank_statement_too_many`', schema: errorSchema },
        {
          status: 422,
          description:
            '`bank_statement_missing`, `bank_statement_unsupported`, `bank_statement_columns_missing` (`required`, `missing`), `bank_statement_unreadable`',
          schema: errorSchema,
        },
      ],
    },
  },
}
