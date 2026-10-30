// `GET` and `POST /api/people/imports` (club spec REQ-036, DD-38, API table; #28): the import history, and the upload
// of a CSV or XLSX of families with its column mapping, which answers 201 with the import and every row classified
// (`people.imports.create`). The upload is `multipart/form-data` with `file` and `mapping` (JSON: field → 0-based
// column). The format is read from the file's bytes; a file the import cannot read or a mapping it cannot use is 422
// `import_mapping_invalid` with a `problem`. The club administrator only: `people.manage` and `people.pesel.view`.
import { z } from 'zod'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { withImportUpload, type ImportCommandResult } from '../../commands/imports'
import { importListQuerySchema, importMappingSchema } from '../../data/validators'
import { IMPORT_MAX_FILE_BYTES, readImportFile } from '../../lib/import-file'
import { findImport, listImports } from '../../services/import-read'
import { peopleErrors } from '../errors'
import {
  IMPORT_FEATURES,
  assertImportReader,
  importRouteContext,
  importViewSchema,
  pagedSchema,
  unauthorized,
} from '../imports-shared'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: IMPORT_FEATURES },
  POST: { requireAuth: true, requireFeatures: IMPORT_FEATURES },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const route = await importRouteContext(request)
    if (!route) return unauthorized()
    await assertImportReader(route)
    const query = importListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    return Response.json(await listImports(route.ctx.container, route.scope, query))
  } catch (error: unknown) {
    return errorResponse(error, 'people.imports.list')
  }
}

/** The form's `file` read and checked by its bytes, and the parsed `mapping` field. */
async function readImportForm(container: CommandRuntimeContext['container'], request: Request) {
  if (!container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  const service = container.resolve<AttachmentService>('attachmentService')
  if (!service.readUploadForm) throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  const form = await service.readUploadForm(request)
  const file = form.get('file')
  if (!file || typeof file === 'string')
    return peopleErrors.throw('import_mapping_invalid', { problem: 'file_missing' })
  if (file.size > IMPORT_MAX_FILE_BYTES) return peopleErrors.throw('import_mapping_invalid', { problem: 'too_large' })
  const buffer = Buffer.from(await file.arrayBuffer())
  const read = await readImportFile(new Uint8Array(buffer))
  if (!read.ok) return peopleErrors.throw('import_mapping_invalid', { problem: read.problem })
  const mappingField = form.get('mapping')
  let mapping: unknown = null
  try {
    mapping = typeof mappingField === 'string' ? (JSON.parse(mappingField) as unknown) : null
  } catch {
    mapping = null
  }
  if (!importMappingSchema.safeParse(mapping).success) {
    return peopleErrors.throw('import_mapping_invalid', { problem: 'mapping_malformed' })
  }
  return { upload: { buffer, format: read.format, sheet: read.sheet }, mapping }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const route = await importRouteContext(request)
    if (!route) return unauthorized()
    const { upload, mapping } = await readImportForm(route.ctx.container, request)
    const { result } = await route.ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ImportCommandResult>('people.imports.create', {
        input: { mapping },
        ctx: withImportUpload(route.ctx, upload),
      })
    const view = await findImport(route.ctx.container, route.scope, result.record.id)
    return Response.json(view, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error, 'people.imports.create')
  }
}

const uploadSchema = z.object({
  file: z.string().describe('CSV (UTF-8, `,` or `;`) or XLSX (first sheet), at most 5 MB and 1000 data rows'),
  mapping: z.string().describe('JSON: import field (`participant.firstName`, `guardian1.email`, `group`, …) → column'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'People imports',
  methods: {
    GET: {
      summary: 'Import history',
      description: 'Newest first, with who uploaded and who committed each import and what it created.',
      query: importListQuerySchema,
      responses: [{ status: 200, description: 'Paged imports', schema: pagedSchema(importViewSchema) }],
      errors: [{ status: 403, description: '`scope_denied` or a missing feature', schema: errorSchema }],
    },
    POST: {
      summary: 'Upload a file of families and preview it',
      description:
        'Stores the file in the private attachments partition and stages every row classified `new`, `matched` (by PESEL or import identifier only), `review` (no identifier) or `error` (with the column, never the value).',
      requestBody: { contentType: 'multipart/form-data', schema: uploadSchema },
      responses: [{ status: 201, description: 'The previewed import', schema: importViewSchema }],
      errors: [
        { status: 403, description: '`scope_denied` or a missing feature', schema: errorSchema },
        { status: 413, description: 'Request larger than the attachment limit', schema: errorSchema },
        {
          status: 422,
          description:
            '`import_mapping_invalid` with `problem`: `file_missing`, `empty`, `format_unsupported`, `too_large`, `too_many_rows`, `too_many_columns`, `malformed`, `mapping_malformed`, `column_out_of_range`, `column_reused`, `participant_name_required`, `guardian_name_required`',
          schema: errorSchema,
        },
      ],
    },
  },
}
