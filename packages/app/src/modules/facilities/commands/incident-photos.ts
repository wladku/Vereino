// `facilities.incidents.photos.add` (M-12 "Report incident" → photo, B-27; facilities spec "attachments via
// `attachments`"; #126): a photo of an incident — PNG, JPEG or WebP up to 5 MB, at most 5 per incident — added by
// whoever may report it: the facility attendant within their places and the club administrator (`PLACE_KINDS`). The
// route checks the format and the size by the file's bytes; the bytes go to the platform `attachments` module
// (private partition) and the link row is written in the upload transaction (`persistLink`) after the incident row
// is locked again: photos are counted under that lock, so two parallel uploads at 4 photos end with 5. There is no
// delete: a photo is evidence like its incident. Not undoable (its bytes are not in the stored input).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { z } from 'zod'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec } from '@/modules/foundation'
import { Incident, IncidentPhoto } from '../data/entities'
import {
  INCIDENT_PHOTO_ASSIGNMENT,
  INCIDENT_PHOTO_OWNER_ENTITY,
  INCIDENT_PHOTO_PARTITION,
  nextIncidentPhotoPosition,
} from '../lib/incidents'
import { INCIDENT_REPORT_KINDS } from './incidents'
import {
  facilitiesLog,
  inWriteTransaction,
  placeTarget,
  rowLoader,
  throwFieldError,
  type FacilitiesCommandResult,
} from './shared'

export const INCIDENT_PHOTO_RESOURCE_KIND = 'facilities.incident_photo'

/** Where the route hands the checked upload to the command (never part of the stored command input). */
const FACILITIES_UPLOAD_CONTEXT = Symbol.for('vereino.facilities.upload')

export type CheckedPhoto = { buffer: Buffer; fileName: string; mimeType: string }

type UploadContext = CommandRuntimeContext & { [FACILITIES_UPLOAD_CONTEXT]?: CheckedPhoto }

/** The command context carrying a checked upload. */
export function withPhoto(ctx: CommandRuntimeContext, photo: CheckedPhoto): CommandRuntimeContext {
  return Object.assign(ctx, { [FACILITIES_UPLOAD_CONTEXT]: photo })
}

function photoOf(ctx: CommandRuntimeContext): CheckedPhoto {
  const photo = (ctx as UploadContext)[FACILITIES_UPLOAD_CONTEXT]
  if (!photo || !Buffer.isBuffer(photo.buffer)) throw new CrudHttpError(400, { error: 'File is required' })
  return photo
}

/** The platform attachment service, or 503 when the `attachments` module is not enabled. */
export function attachmentServiceOf(ctx: CommandRuntimeContext): AttachmentService {
  if (!ctx.container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  return ctx.container.resolve<AttachmentService>('attachmentService')
}

export type IncidentPhotoSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  incidentId: string
  placeId: string
  attachmentId: string
  position: number
  fileName: string
}

export type IncidentPhotoCommandResult = FacilitiesCommandResult<IncidentPhoto, IncidentPhotoSnapshot>

export function incidentPhotoSnapshot(row: IncidentPhoto): IncidentPhotoSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    incidentId: row.incidentId,
    placeId: row.placeId,
    attachmentId: row.attachmentId,
    position: row.position,
    fileName: row.fileName,
  }
}

const photoAddSchema = z.object({ incidentId: z.uuid() }).strict()

/** The incident, row-locked in the trusted tenant: the lock serializes the photo count. */
function incidentSpec(ctx: CommandRuntimeContext): AuthorizeScopedSpec<typeof photoAddSchema, Incident> {
  const load = rowLoader(ctx, Incident)
  return {
    input: photoAddSchema,
    resourceKind: INCIDENT_PHOTO_RESOURCE_KIND,
    allowedKinds: INCIDENT_REPORT_KINDS,
    loadTarget: (parsed, em, lock) => load(em, parsed.incidentId, lock),
    resolveTarget: (_parsed, entity) => placeTarget(entity as Incident),
    // A photo is a new row of its own; the incident's lock token is not needed to add one.
    lock: 'none',
  }
}

/** The position of the next photo; 422 `incident_photos_limit_reached` for a sixth one. */
async function nextPosition(em: EntityManager, incident: Incident): Promise<number> {
  const rows = await em.find(
    IncidentPhoto,
    { tenantId: incident.tenantId, organizationId: incident.organizationId, incidentId: incident.id, deletedAt: null },
    { fields: ['id', 'position'] },
  )
  const position = nextIncidentPhotoPosition(rows.map((row) => row.position))
  if (position === null) return throwFieldError('incident_photos_limit_reached', 'file')
  return position
}

const addIncidentPhotoCommand: CommandHandler<Record<string, unknown>, IncidentPhotoCommandResult> = {
  id: 'facilities.incidents.photos.add',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const photo = photoOf(ctx)
    const spec = incidentSpec(ctx)
    // An early refusal before the bytes are stored; the count is repeated under the lock in `persistLink`.
    await inWriteTransaction(ctx, 'facilities.incidents.photos.add.check', async (em) => {
      const authorized = await authorizeScoped(spec, rawInput, ctx, em)
      await nextPosition(em, authorized.entity as Incident)
      return true
    })
    const scope = trustedScopeOf(ctx)
    if (!scope) throw new Error('[internal] incident photo upload without a trusted scope')
    const { incidentId } = photoAddSchema.parse(rawInput)
    const id = randomUUID()
    const box: { result?: IncidentPhotoCommandResult } = {}
    await attachmentServiceOf(ctx).createScoped({
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      entityId: INCIDENT_PHOTO_OWNER_ENTITY,
      recordId: incidentId,
      partitionCode: INCIDENT_PHOTO_PARTITION,
      fileName: photo.fileName,
      declaredMimeType: photo.mimeType,
      buffer: photo.buffer,
      assignments: [{ type: INCIDENT_PHOTO_ASSIGNMENT, id }],
      persistLink: async (tx, attachmentId) => {
        const authorized = await authorizeScoped(spec, rawInput, ctx, tx)
        const incident = authorized.entity as Incident
        const position = await nextPosition(tx, incident)
        const row = tx.create(IncidentPhoto, {
          id,
          tenantId: incident.tenantId,
          organizationId: incident.organizationId,
          incidentId: incident.id,
          placeId: incident.placeId,
          attachmentId,
          position,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          fileSize: photo.buffer.length,
        })
        tx.persist(row)
        await tx.flush()
        box.result = { entity: row, actingRole: authorized.actingRole, before: null }
      },
    })
    const result = box.result
    if (!result) throw new Error('[internal] the incident photo upload produced no result')
    return result
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: INCIDENT_PHOTO_RESOURCE_KIND,
      labelKey: 'facilities.audit.incidents.photoAdd',
      fallback: 'Add an incident photo',
      after: incidentPhotoSnapshot(result.entity),
    }),
}

registerCommand(addIncidentPhotoCommand)
