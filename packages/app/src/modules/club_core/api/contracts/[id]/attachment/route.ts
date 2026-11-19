// `POST`, `GET` and `DELETE /api/club_core/contracts/{id}/attachment` — a contract's signed PDF (people life-cycle spec
// REQ-L12, B-07, *API* row; #312): upload or replace it as `multipart/form-data` with a `file` field (one PDF up to
// 10 MB, checked by its bytes — 422 `contract_attachment_format_unsupported` / `contract_attachment_too_large`),
// download it, or remove it. The club administrator only (`club_core.contracts.manage`). The file stays in the private
// `attachments` partition and is read only here, with the exact owner, assignment and partition of the contract's file.
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { assertInScope, commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import type { ContractAttachmentResult } from '../../../../commands/contract-files'
import { CLUB_CORE_PARTITION, withUpload } from '../../../../commands/logos'
import { STRUCTURE_WRITE_KINDS, structureTarget } from '../../../../commands/shared'
import { Contract } from '../../../../data/entities'
import { CONTRACT_ATTACHMENT_ASSIGNMENT, CONTRACT_ATTACHMENT_OWNER_ENTITY } from '../../../../lib/files'
import { errorSchema } from '../../../shared'
import { readCheckedUpload } from '../../../uploads'

const FEATURES = ['club_core.contracts.manage']

export const metadata = {
  POST: { requireAuth: true, requireFeatures: FEATURES },
  GET: { requireAuth: true, requireFeatures: FEATURES },
  DELETE: { requireAuth: true, requireFeatures: FEATURES },
}

const paramsSchema = z.object({ id: z.uuid() })
type RouteContext = { params: Promise<{ id: string }> }

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })
const notFound = (): Response => Response.json({ error: 'Not found' }, { status: 404 })

function attachmentResponse(result: ContractAttachmentResult): Response {
  return Response.json({
    ok: true,
    id: result.entity.id,
    hasAttachment: Boolean(result.entity.attachmentId),
    updatedAt: result.entity.updatedAt.toISOString(),
  })
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const { upload } = await readCheckedUpload(ctx, request, 'contract_attachment')
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ContractAttachmentResult>('club_core.contracts.attachment.set', {
        input: { id },
        ctx: withUpload(ctx, upload),
      })
    return attachmentResponse(result)
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.contracts.attachment.set')
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ContractAttachmentResult>('club_core.contracts.attachment.remove', { input: { id }, ctx })
    return attachmentResponse(result)
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.contracts.attachment.remove')
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return notFound()
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope || !ctx.auth) return unauthorized()
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const contract = await em.findOne(
      Contract,
      { id: params.data.id, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null },
      { fields: ['id', 'tenantId', 'organizationId', 'attachmentId'] },
    )
    if (!contract) return notFound()
    await assertInScope(await scopeContract.resolve(ctx), STRUCTURE_WRITE_KINDS, structureTarget(contract))
    if (!contract.attachmentId || !ctx.container.hasRegistration('attachmentService')) return notFound()
    const file = await ctx.container.resolve<AttachmentService>('attachmentService').readScoped({
      attachmentId: contract.attachmentId,
      auth: ctx.auth,
      expectedOwner: { entityId: CONTRACT_ATTACHMENT_OWNER_ENTITY, recordId: contract.id },
      expectedAssignment: { type: CONTRACT_ATTACHMENT_ASSIGNMENT, id: contract.id },
      expectedPartitionCode: CLUB_CORE_PARTITION,
      requirePrivatePartition: true,
    })
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        // The bytes were checked as a PDF on upload; the platform's disposition (download) stays.
        'Content-Type': 'application/pdf',
        'Content-Disposition': file.contentDisposition,
        'Content-Length': String(file.buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.contracts.attachment.read')
  }
}

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  hasAttachment: z.boolean(),
  updatedAt: z.string().describe("The contract's new lock token"),
})
const uploadSchema = z.object({ file: z.string().describe('One PDF, at most 10 MB') })

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Contract attachment',
  methods: {
    POST: {
      summary: "Upload or replace a contract's signed PDF",
      description:
        'Multipart upload with a `file` field; the format is read from the file itself. A second upload replaces the first. No lock token is needed; the response carries the contract’s new `updatedAt`.',
      requestBody: { contentType: 'multipart/form-data', schema: uploadSchema },
      responses: [{ status: 200, description: 'The contract now has the file', schema: responseSchema }],
      errors: [
        { status: 400, description: '`upload_file_missing`', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown contract', schema: errorSchema },
        {
          status: 422,
          description: '`contract_attachment_format_unsupported`, `contract_attachment_too_large`',
          schema: errorSchema,
        },
      ],
    },
    GET: {
      summary: "Download a contract's signed PDF",
      description: 'The PDF bytes, never cached by a shared cache; 404 when the contract has no file.',
      responses: [{ status: 200, description: 'The PDF', schema: z.unknown() }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown contract or no file', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: "Remove a contract's signed PDF",
      description: 'Undoable; the file is kept, so the undo finds it.',
      responses: [{ status: 200, description: 'The contract without a file', schema: responseSchema }],
      errors: [
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown contract', schema: errorSchema },
      ],
    },
  },
}
