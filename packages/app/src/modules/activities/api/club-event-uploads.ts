// The multipart upload of a club event's poster or funder logo (club events spec DD-T10, REQ-T08; #379; engineering
// standards S8.11): the request is read through the platform's bounded `attachmentService.readUploadForm`, the `kind`
// is read from the form, and the file is checked by its bytes — format and size of that kind — before any command
// runs: 422 with the file's code, never a stored file.
//
// Event photos spec (REQ-I01, REQ-I02, DD-I08; #872): a picture (`photo`, `graphic`) also reads its `description`,
// and its metadata (EXIF with GPS, XMP, IPTC, comments) is removed here, before any byte is stored; only the JPEG
// orientation is kept. A file the stripper cannot parse is refused like an unsupported format. The stored name of a
// picture never repeats the uploaded one (a phone's file name may carry a name or a date).
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { storedFileName, stripImageMetadata } from '@vereino/core'
import { z } from 'zod'
import type { CheckedClubEventUpload } from '../commands/club-event-files'
import {
  CLUB_EVENT_FILE_KINDS,
  checkClubEventFile,
  isPictureKind,
  type ClubEventFileKind,
} from '../lib/club-event-files'
import { activitiesErrors } from './errors'

const kindSchema = z.enum(CLUB_EVENT_FILE_KINDS)

export type ClubEventUploadForm = {
  upload: CheckedClubEventUpload
  kind: ClubEventFileKind
  funderName: string | null
  description: string | null
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
  const rawDescription = form.get('description')
  const description = typeof rawDescription === 'string' ? rawDescription : null
  const file = form.get('file')
  if (!file || typeof file === 'string') return activitiesErrors.throw('club_event_file_missing', { field: 'file' })
  const buffer = Buffer.from(await file.arrayBuffer())
  const checked = checkClubEventFile(buffer, kind)
  if (!checked.ok) {
    if (checked.problem === 'too_large') return activitiesErrors.throw('club_event_file_too_large', { field: 'file' })
    if (checked.problem === 'empty') return activitiesErrors.throw('club_event_file_missing', { field: 'file' })
    return activitiesErrors.throw('club_event_file_format_unsupported', { field: 'file' })
  }
  const format = checked.file.format
  let stored: Uint8Array = buffer
  if (isPictureKind(kind)) {
    if (format === 'pdf') return activitiesErrors.throw('club_event_file_format_unsupported', { field: 'file' })
    const stripped = stripImageMetadata(buffer, format)
    if (!stripped.ok) return activitiesErrors.throw('club_event_file_format_unsupported', { field: 'file' })
    stored = stripped.bytes
  }
  const fallback = kind === 'poster' ? 'poster' : kind === 'funder_logo' ? 'logo' : 'picture'
  return {
    upload: {
      buffer: Buffer.from(stored.buffer, stored.byteOffset, stored.byteLength),
      fileName: storedFileName(isPictureKind(kind) ? null : file.name, format, fallback),
      mimeType: checked.file.mimeType,
    },
    kind,
    funderName,
    description,
  }
}
