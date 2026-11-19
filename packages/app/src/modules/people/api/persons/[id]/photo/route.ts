// `POST`, `GET` and `DELETE /api/people/persons/{id}/photo` — the person's photo (people life-cycle spec REQ-L12, B-10
// Details, *API* row; #312). Upload or replace it as `multipart/form-data` with a `file` field (PNG, JPEG or WebP up to
// 5 MB, checked by its bytes — 422 `person_photo_format_unsupported` / `person_photo_too_large`) or remove it: the club
// administrator (`people.manage`). Read it with `people.view` when the person is in the caller's full read scope (the
// person, a guardian, the club administrator; a coordinator's basic read has no photo, 403). The file stays in the
// private `attachments` partition and is read only here, with the exact owner, assignment and partition.
import { z } from 'zod'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { storedFileName } from '@vereino/core'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  foundationErrors,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { withPhotoUpload, type PhotoCommandResult, type PhotoUpload } from '../../../../commands/photos'
import {
  PERSON_PHOTO_ASSIGNMENT,
  PERSON_PHOTO_OWNER_ENTITY,
  PERSON_PHOTO_PARTITION,
  checkPersonPhoto,
} from '../../../../lib/person-photo'
import { findPerson } from '../../../../services/people-read'
import { peopleErrors } from '../../../errors'
import { PEOPLE_READ_OPTIONS, PERSON_READ_KINDS, errorSchema, isBasicRead } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.manage'] },
  GET: { requireAuth: true, requireFeatures: ['people.view'] },
  DELETE: { requireAuth: true, requireFeatures: ['people.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })
type RouteContext = { params: Promise<{ id: string }> }

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })
const notFound = (): Response => Response.json({ error: 'Not found' }, { status: 404 })

function attachmentService(container: CommandRuntimeContext['container']): AttachmentService {
  if (!container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  return container.resolve<AttachmentService>('attachmentService')
}

/** Reads the form's `file` through the platform's bounded reader and checks its bytes; the coded 400/422 otherwise. */
async function readPhoto(service: AttachmentService, request: Request): Promise<PhotoUpload> {
  if (!service.readUploadForm) throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  const form = await service.readUploadForm(request)
  const file = form.get('file')
  if (!file || typeof file === 'string') throw new CrudHttpError(400, { error: 'File is required' })
  const buffer = Buffer.from(await file.arrayBuffer())
  const checked = checkPersonPhoto(buffer)
  if (!checked.ok) {
    if (checked.problem === 'empty') throw new CrudHttpError(400, { error: 'File is required' })
    return peopleErrors.throw(
      checked.problem === 'too_large' ? 'person_photo_too_large' : 'person_photo_format_unsupported',
    )
  }
  return {
    buffer,
    fileName: storedFileName(file.name, checked.file.format, 'photo'),
    mimeType: checked.file.mimeType,
  }
}

function photoResponse(result: PhotoCommandResult): Response {
  return Response.json({
    ok: true,
    id: result.person.id,
    hasPhoto: Boolean(result.person.photoAttachmentId),
    updatedAt: result.person.updatedAt.toISOString(),
  })
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const upload = await readPhoto(attachmentService(ctx.container), request)
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, PhotoCommandResult>('people.persons.photo.set', {
        input: { id },
        ctx: withPhotoUpload(ctx, upload),
      })
    return photoResponse(result)
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.photo.set')
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, PhotoCommandResult>('people.persons.photo.remove', { input: { id }, ctx })
    return photoResponse(result)
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.photo.remove')
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return notFound()
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return unauthorized()
    const person = await findPerson(ctx.container, scope, params.data.id)
    if (!person) return notFound()
    const actingRole = await assertInScope(
      await scopeContract.resolve(ctx),
      PERSON_READ_KINDS,
      { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId, personId: person.id },
      PEOPLE_READ_OPTIONS,
    )
    // The photo is personal data outside a coordinator's basic read.
    if (isBasicRead(actingRole)) return await foundationErrors.throw('scope_denied')
    if (!person.photoAttachmentId) return notFound()
    const file = await attachmentService(ctx.container).readScoped({
      attachmentId: person.photoAttachmentId,
      auth: ctx.auth,
      expectedOwner: { entityId: PERSON_PHOTO_OWNER_ENTITY, recordId: person.id },
      expectedAssignment: { type: PERSON_PHOTO_ASSIGNMENT, id: person.id },
      expectedPartitionCode: PERSON_PHOTO_PARTITION,
      requirePrivatePartition: true,
    })
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': 'inline; filename="photo"',
        'Content-Length': String(file.buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.photo.read')
  }
}

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  hasPhoto: z.boolean(),
  updatedAt: z.string().describe("The person's new lock token"),
})
const uploadSchema = z.object({ file: z.string().describe('PNG, JPEG or WebP image, at most 5 MB (no SVG)') })

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Person photo',
  methods: {
    POST: {
      summary: "Upload or replace a person's photo",
      description:
        'Multipart upload with a `file` field; the format is read from the file itself, so an SVG renamed `.png` is refused. No lock token is needed; the response carries the person’s new `updatedAt`.',
      requestBody: { contentType: 'multipart/form-data', schema: uploadSchema },
      responses: [{ status: 200, description: 'The person now has the photo', schema: responseSchema }],
      errors: [
        { status: 400, description: 'No file', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown person', schema: errorSchema },
        {
          status: 422,
          description: '`person_photo_format_unsupported`, `person_photo_too_large`',
          schema: errorSchema,
        },
      ],
    },
    GET: {
      summary: "Read a person's photo",
      description:
        "The photo bytes for the person, a guardian and the club administrator; never cached by a shared cache. A coordinator's basic read has no photo (403).",
      responses: [{ status: 200, description: 'The photo', schema: z.unknown() }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown person or no photo', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: "Remove a person's photo",
      description: 'Undoable; the file is kept, so the undo finds it.',
      responses: [{ status: 200, description: 'The person without a photo', schema: responseSchema }],
      errors: [
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown person', schema: errorSchema },
      ],
    },
  },
}
