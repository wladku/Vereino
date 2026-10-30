// The multipart uploads of `club_core` (logos and section materials, #29; engineering standards S8.11): the request is
// read through the platform's bounded `attachmentService.readUploadForm`, and the file is checked by its bytes — format
// and size — before any command runs: 422 with the field's code, never a stored file.
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { CheckedUpload } from '../commands/logos'
import { checkLogo, checkMaterial, storedFileName } from '../lib/files'
import { clubCoreErrors } from './errors'

type UploadKind = 'logo' | 'material'

export type ReadUpload = { upload: CheckedUpload; fields: Record<string, string | undefined> }

/** Reads the form's `file` and its text fields, and checks the file; throws the coded 400/422 otherwise. */
export async function readCheckedUpload(
  ctx: CommandRuntimeContext,
  request: Request,
  kind: UploadKind,
): Promise<ReadUpload> {
  if (!ctx.container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  const service = ctx.container.resolve<AttachmentService>('attachmentService')
  if (!service.readUploadForm) throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  const form = await service.readUploadForm(request)
  const file = form.get('file')
  if (!file || typeof file === 'string') return clubCoreErrors.throw('upload_file_missing')
  const buffer = Buffer.from(await file.arrayBuffer())
  const checked = kind === 'logo' ? checkLogo(buffer) : checkMaterial(buffer)
  if (!checked.ok) {
    if (checked.problem === 'too_large') {
      return clubCoreErrors.throw(kind === 'logo' ? 'logo_too_large' : 'material_too_large')
    }
    if (checked.problem === 'empty') return clubCoreErrors.throw('upload_file_missing')
    return clubCoreErrors.throw(kind === 'logo' ? 'logo_format_unsupported' : 'material_format_unsupported')
  }
  const fields: Record<string, string | undefined> = {}
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') fields[key] = value
  }
  return {
    upload: {
      buffer,
      fileName: storedFileName(file.name, checked.file.format, kind),
      mimeType: checked.file.mimeType,
    },
    fields,
  }
}
