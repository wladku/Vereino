// The multipart uploads of `club_core` (logos and section materials, #29; place photos and regulations, UX parity spec
// REQ-U03, #86; engineering standards S8.11): the request is read through the platform's bounded
// `attachmentService.readUploadForm`, and the file is checked by its bytes — format and size — before any command
// runs: 422 with the field's code, never a stored file.
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { CheckedUpload } from '../commands/logos'
import { checkLogo, checkMaterial, checkPlaceFile, storedFileName } from '../lib/files'
import type { ClubCoreErrorCode } from '../lib/error-codes'
import { clubCoreErrors } from './errors'

export type UploadKind = 'logo' | 'material' | 'place_photo' | 'place_regulations'

type Checked = ReturnType<typeof checkLogo>

const UPLOADS: Record<
  UploadKind,
  { check: (bytes: Uint8Array) => Checked; tooLarge: ClubCoreErrorCode; unsupported: ClubCoreErrorCode; name: string }
> = {
  logo: { check: checkLogo, tooLarge: 'logo_too_large', unsupported: 'logo_format_unsupported', name: 'logo' },
  material: {
    check: checkMaterial,
    tooLarge: 'material_too_large',
    unsupported: 'material_format_unsupported',
    name: 'material',
  },
  place_photo: {
    check: (bytes) => checkPlaceFile(bytes, 'photo'),
    tooLarge: 'place_file_too_large',
    unsupported: 'place_file_format_unsupported',
    name: 'photo',
  },
  place_regulations: {
    check: (bytes) => checkPlaceFile(bytes, 'regulations'),
    tooLarge: 'place_file_too_large',
    unsupported: 'place_file_format_unsupported',
    name: 'regulations',
  },
}

export type ReadUpload = { upload: CheckedUpload; fields: Record<string, string | undefined> }

/**
 * Reads the form's `file` and its text fields, and checks the file; throws the coded 400/422 otherwise. The kind is
 * fixed by the route, or read from the form's own text fields (a place file names its `kind`).
 */
export async function readCheckedUpload(
  ctx: CommandRuntimeContext,
  request: Request,
  kindOf: UploadKind | ((fields: Record<string, string | undefined>) => UploadKind),
): Promise<ReadUpload> {
  if (!ctx.container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  const service = ctx.container.resolve<AttachmentService>('attachmentService')
  if (!service.readUploadForm) throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  const form = await service.readUploadForm(request)
  const fields: Record<string, string | undefined> = {}
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') fields[key] = value
  }
  const kind = UPLOADS[typeof kindOf === 'function' ? kindOf(fields) : kindOf]
  const file = form.get('file')
  if (!file || typeof file === 'string') return clubCoreErrors.throw('upload_file_missing')
  const buffer = Buffer.from(await file.arrayBuffer())
  const checked = kind.check(buffer)
  if (!checked.ok) {
    if (checked.problem === 'too_large') return clubCoreErrors.throw(kind.tooLarge)
    if (checked.problem === 'empty') return clubCoreErrors.throw('upload_file_missing')
    return clubCoreErrors.throw(kind.unsupported)
  }
  return {
    upload: {
      buffer,
      fileName: storedFileName(file.name, checked.file.format, kind.name),
      mimeType: checked.file.mimeType,
    },
    fields,
  }
}
