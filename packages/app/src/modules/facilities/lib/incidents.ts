// Pure rules of the incidents (facilities spec *Data Models* → `facilities_incidents`, REQ-016, §6 of the facility
// regulations; M-12 "Report incident", B-27; #126): an incident has a kind, a description of 10–2000 characters, the
// actions taken and the people involved; it happened no later than now; it is never deleted (evidence). The kinds
// deliberately name no injury or illness: the description must not hold health data (M-12 hint), and a health
// category would invite it. An incident keeps up to 5 photos (PNG, JPEG or WebP up to 5 MB, checked by the bytes;
// never deleted either). Nothing here reads the database or the clock (S3.5).
import { checkFileBytes, type FileCheck, type FileFormat } from '@vereino/core'

export const INCIDENT_KINDS = [
  'rules_violation',
  'damage',
  'vandalism',
  'unauthorized_entry',
  'safety_hazard',
  'other',
] as const
export type IncidentKind = (typeof INCIDENT_KINDS)[number]

export const INCIDENT_ACTIONS = [
  'none',
  'warning_given',
  'removed_from_facility',
  'activity_stopped',
  'police_called',
  'emergency_services_called',
  'owner_notified',
  'entry_ban_requested',
] as const
export type IncidentAction = (typeof INCIDENT_ACTIONS)[number]

/** M-12 validation: the description holds 10–2000 characters (422 `incident_description_length`). */
export const INCIDENT_DESCRIPTION_MIN_LENGTH = 10
export const INCIDENT_DESCRIPTION_MAX_LENGTH = 2000

/** M-12: the people involved, as free text (names or descriptions; encrypted at rest). */
export const INCIDENT_INVOLVED_MAX_LENGTH = 1000

/** The clock skew a phone may have when it sends "now" as the time of the incident. */
export const INCIDENT_CLOCK_SKEW_MS = 5 * 60 * 1000

/** True when the trimmed description has 10–2000 characters. */
export function incidentDescriptionValid(description: string): boolean {
  const length = description.trim().length
  return length >= INCIDENT_DESCRIPTION_MIN_LENGTH && length <= INCIDENT_DESCRIPTION_MAX_LENGTH
}

/** True when the incident happened no later than now, allowing a phone's clock skew (422 `incident_time_future`). */
export function incidentTimeAllowed(occurredAt: Date, now: Date): boolean {
  return occurredAt.getTime() <= now.getTime() + INCIDENT_CLOCK_SKEW_MS
}

/** The actions in catalogue order without repeats; `none` only when nothing else was done. */
export function normalizedActions(actions: readonly IncidentAction[]): IncidentAction[] {
  const held = new Set(actions)
  if (held.size > 1) held.delete('none')
  return INCIDENT_ACTIONS.filter((action) => held.has(action))
}

/** Attachment owner (the incident) and assignment (the photo link) of an incident photo (the upload and the read). */
export const INCIDENT_PHOTO_OWNER_ENTITY = 'facilities:incident'
export const INCIDENT_PHOTO_ASSIGNMENT = 'facilities:incident_photo'

/** The private partition the incident photos are stored in. */
export const INCIDENT_PHOTO_PARTITION = 'privateAttachments'

/** Formats of an incident photo: the raster image formats (no SVG, no PDF). */
export const INCIDENT_PHOTO_FORMATS: readonly FileFormat[] = ['png', 'jpeg', 'webp']

/** 5 MB: a phone photo, as for a place photo. */
export const INCIDENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024

/** An incident holds at most 5 photos (422 `incident_photos_limit_reached`). */
export const INCIDENT_PHOTOS_MAX = 5

/** An incident photo upload: PNG, JPEG or WebP up to 5 MB, by its bytes. */
export function checkIncidentPhoto(bytes: Uint8Array): FileCheck {
  return checkFileBytes(bytes, INCIDENT_PHOTO_FORMATS, INCIDENT_PHOTO_MAX_BYTES)
}

/** The position of the next photo: after the highest one, 0 for the first; null when the incident is full. */
export function nextIncidentPhotoPosition(positions: readonly number[]): number | null {
  if (positions.length >= INCIDENT_PHOTOS_MAX) return null
  return positions.length === 0 ? 0 : Math.max(...positions) + 1
}
