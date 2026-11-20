// The multipart upload of a club event's poster or funder logo (club events spec DD-T10, REQ-T08; #379; engineering
// standards S8.11): the request is read through the platform's bounded `attachmentService.readUploadForm`, the `kind`
// is read from the form, and the file is checked by its bytes — format and size of that kind — before any command
// runs: 422 with the file's code, never a stored file.
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { storedFileName } from '@vereino/core'
import { z } from 'zod'
import type { CheckedClubEventUpload } from '../commands/club-event-files'
import { CLUB_EVENT_FILE_KINDS, checkClubEventFile, type ClubEventFileKind } from '../lib/club-event-files'
import { activitiesErrors } from './errors'

const kindSchema = z.enum(CLUB_EVENT_FILE_KINDS)

export type ClubEventUploadForm = {
  upload: CheckedClubEventUpload
  kind: ClubEventFileKind
  funderName: string | null
}

/** Reads the form's `file`, `kind` and `funderName`, and checks the file by its bytes; throws the coded 4xx otherwise. */
export async function readClubEventUpload(ctx: CommandRuntimeContext, request: Request): Promise<ClubEventUploadForm> {
  if (!ctx.container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  const service = ctx.container.resolve<AttachmentService>('attachmentService')
  if (!service.readUploadForm) throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  const form = await service.readUploadForm(request)
  const rawKind = form.get('kind')
  const kind = kindSchema.parse(typeof rawKind === 'string' ? rawKind : undefined)
  const rawName = form.get('funderName')
  const funderName = typeof rawName === 'string' ? rawName : null
  const file = form.get('file')
  if (!file || typeof file === 'string') return activitiesErrors.throw('club_event_file_missing', { field: 'file' })
  const buffer = Buffer.from(await file.arrayBuffer())
  const checked = checkClubEventFile(buffer, kind)
  if (!checked.ok) {
    if (checked.problem === 'too_large') return activitiesErrors.throw('club_event_file_too_large', { field: 'file' })
    if (checked.problem === 'empty') return activitiesErrors.throw('club_event_file_missing', { field: 'file' })
    return activitiesErrors.throw('club_event_file_format_unsupported', { field: 'file' })
  }
  return {
    upload: {
      buffer,
      fileName: storedFileName(file.name, checked.file.format, kind === 'poster' ? 'poster' : 'logo'),
      mimeType: checked.file.mimeType,
    },
    kind,
    funderName,
  }
}
