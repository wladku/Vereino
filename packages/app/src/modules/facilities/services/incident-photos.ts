// The incident photos as the panels read them (#126): the link rows of the incidents a list already admitted, and one
// photo's bytes for a caller whose grant covers the incident's place (the attendant's places or the club). The bytes
// are read through the platform's `attachmentService` with the exact owner, assignment and private partition of the
// photo, so the route never serves another file.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { AwilixContainer } from 'awilix'
import type { Scope } from '@vereino/core'
import { assertInScope } from '@/modules/foundation'
import { INCIDENT_REPORT_KINDS } from '../commands/incidents'
import { placeTarget } from '../commands/shared'
import { Incident, IncidentPhoto } from '../data/entities'
import { INCIDENT_PHOTO_ASSIGNMENT, INCIDENT_PHOTO_OWNER_ENTITY, INCIDENT_PHOTO_PARTITION } from '../lib/incidents'
import type { FacilitiesScope } from './directory'

export type IncidentPhotoView = { id: string; fileName: string; mimeType: string; size: number; url: string }

/** The authenticated route of one photo. */
export function incidentPhotoUrl(incidentId: string, photoId: string): string {
  return `/api/facilities/incidents/${encodeURIComponent(incidentId)}/photos/${encodeURIComponent(photoId)}`
}

/** The photos of the incidents, in upload order, by incident id. */
export async function photosOfIncidents(
  container: AwilixContainer,
  scope: FacilitiesScope,
  incidentIds: readonly string[],
): Promise<Map<string, IncidentPhotoView[]>> {
  const result = new Map<string, IncidentPhotoView[]>()
  if (incidentIds.length === 0) return result
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await em.find(
    IncidentPhoto,
    { ...scope, incidentId: { $in: [...new Set(incidentIds)] }, deletedAt: null },
    { orderBy: { position: 'asc' } },
  )
  for (const row of rows) {
    const views = result.get(row.incidentId) ?? []
    views.push({
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      size: row.fileSize,
      url: incidentPhotoUrl(row.incidentId, row.id),
    })
    result.set(row.incidentId, views)
  }
  return result
}

export type PhotoFile = { buffer: Buffer; mimeType: string; fileName: string }

/**
 * One photo of the incident for the caller: null when the incident or the photo is unknown in the organization;
 * 403 `scope_denied` (thrown) when no grant of the reporting kinds covers the incident's place.
 */
export async function readIncidentPhoto(
  container: AwilixContainer,
  scope: FacilitiesScope,
  grants: Scope,
  auth: Parameters<AttachmentService['readScoped']>[0]['auth'],
  ids: { incidentId: string; photoId: string },
): Promise<PhotoFile | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const incident = await em.findOne(Incident, { ...scope, id: ids.incidentId, deletedAt: null })
  if (!incident) return null
  await assertInScope(grants, INCIDENT_REPORT_KINDS, placeTarget(incident))
  const photo = await em.findOne(IncidentPhoto, {
    ...scope,
    id: ids.photoId,
    incidentId: incident.id,
    deletedAt: null,
  })
  if (!photo || !container.hasRegistration('attachmentService')) return null
  const file = await container.resolve<AttachmentService>('attachmentService').readScoped({
    attachmentId: photo.attachmentId,
    auth,
    expectedOwner: { entityId: INCIDENT_PHOTO_OWNER_ENTITY, recordId: incident.id },
    expectedAssignment: { type: INCIDENT_PHOTO_ASSIGNMENT, id: photo.id },
    expectedPartitionCode: INCIDENT_PHOTO_PARTITION,
    requirePrivatePartition: true,
  })
  return { buffer: file.buffer, mimeType: photo.mimeType, fileName: photo.fileName }
}
