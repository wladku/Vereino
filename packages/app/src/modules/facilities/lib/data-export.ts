// The `facilities` part of the person data export (person data export spec
// `.ai/specs/2026-11-21-vereino-person-data-export.md`, DD-X03, DD-X06, *Contributor inventory* → `facilities`; #527,
// phase X2): how the subject's rows are shown — their rentals as a person renter, the entry bans on them, the internal
// bookings they made, their place maintainer rows and the incidents they reported (photos by metadata only). Another
// person never appears by id: a staff actor is `{ relation: 'staff' }`, the subject acting on their own row is
// `'subject'`. No row carries the verification token hash or a link token. Free text that may name other people is
// listed in each section's `reviewFields`.

export const FACILITIES_EXPORT_MODULE = 'facilities' as const

/** The section tables, in the order the file lists them. */
export const FACILITIES_EXPORT_TABLES = {
  rentals: 'facilities_rentals',
  entryBans: 'facilities_entry_bans',
  internalBookings: 'facilities_internal_bookings',
  placeMaintainers: 'facilities_place_maintainers',
  incidents: 'facilities_incidents',
} as const

/** The actor-count tables (DD-X06). */
export const FACILITIES_ACTOR_TABLES = {
  logs: 'facilities_logs',
  maintenanceTasks: 'facilities_maintenance_tasks',
  rentals: 'facilities_rentals',
  entryBans: 'facilities_entry_bans',
  internalBookings: 'facilities_internal_bookings',
} as const

/** RoPA A8 — place rentals; A9 — facility safety and operation (`docs/compliance/ropa.md`). */
export const FACILITIES_RENTALS_ACTIVITY = 'A8' as const
export const FACILITIES_OPERATION_ACTIVITY = 'A9' as const

/** Free-text fields that may name other people (A-9), per section. */
export const FACILITIES_REVIEW_FIELDS = {
  rentals: ['decisionReason', 'notes'],
  entryBans: ['reason'],
  internalBookings: ['purpose', 'cancelReason'],
  incidents: ['involved', 'description'],
} as const

/** A staff member as the file shows them: the role label only (DD-X03). */
export type StaffRef = { relation: 'staff' }

/** Who acted on a row: nobody, the subject themself, or a staff member without name or id. */
export type ActorRef = null | 'subject' | StaffRef

export function actorRef(actorPersonId: string | null | undefined, subjectPersonId: string): ActorRef {
  if (!actorPersonId) return null
  return actorPersonId === subjectPersonId ? 'subject' : { relation: 'staff' }
}

/** A club record (place or section) by id, with its name when the directory still has it. */
export type ClubRecordRef = { id: string; name: string | null }

export type NameLookup = ReadonlyMap<string, { name: string }>

function clubRecord(id: string, names: NameLookup): ClubRecordRef {
  return { id, name: names.get(id)?.name ?? null }
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

type Timestamps = { createdAt?: Date | null; updatedAt?: Date | null }

function timestamps(row: Timestamps): { createdAt: string | null; updatedAt: string | null } {
  return { createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) }
}

export type RentalExportSource = Timestamps & {
  id: string
  placeId: string
  renterDisplayName: string
  renterCategory: string
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  contactLocale?: string | null
  purpose?: string | null
  requestedVia: string
  startsAt: Date
  endsAt: Date
  units: number
  rateId?: string | null
  amount: number
  chargeId?: string | null
  status: string
  usedAt?: Date | null
  holdExpiresAt?: Date | null
  decidedByPersonId?: string | null
  decidedAt?: Date | null
  decisionReason?: string | null
  entryBanMatch: boolean
  cancellationDeadline?: Date | null
  paymentDeadline?: Date | null
  regulationsAcceptedAt?: Date | null
  regulationsAcceptedVia?: string | null
  needsReschedule: boolean
  notes?: string | null
}

/** A rental the subject took as a person renter (A8): the contact data decrypted, no token hash. */
export function rentalExportRow(row: RentalExportSource, subjectPersonId: string, places: NameLookup) {
  return {
    id: row.id,
    place: clubRecord(row.placeId, places),
    renterDisplayName: row.renterDisplayName,
    renterCategory: row.renterCategory,
    contactName: row.contactName ?? null,
    contactPhone: row.contactPhone ?? null,
    contactEmail: row.contactEmail ?? null,
    contactLocale: row.contactLocale ?? null,
    purpose: row.purpose ?? null,
    requestedVia: row.requestedVia,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    units: row.units,
    rateId: row.rateId ?? null,
    amount: row.amount,
    chargeId: row.chargeId ?? null,
    status: row.status,
    emailVerifiedAt: iso(row.usedAt),
    holdExpiresAt: iso(row.holdExpiresAt),
    decidedBy: actorRef(row.decidedByPersonId, subjectPersonId),
    decidedAt: iso(row.decidedAt),
    decisionReason: row.decisionReason ?? null,
    entryBanMatch: row.entryBanMatch,
    cancellationDeadline: iso(row.cancellationDeadline),
    paymentDeadline: iso(row.paymentDeadline),
    regulationsAcceptedAt: iso(row.regulationsAcceptedAt),
    regulationsAcceptedVia: row.regulationsAcceptedVia ?? null,
    needsReschedule: row.needsReschedule,
    notes: row.notes ?? null,
    ...timestamps(row),
  }
}

export type EntryBanExportSource = Timestamps & {
  id: string
  placeId: string
  startsOn: string
  endsOn?: string | null
  reason: string
  incidentId?: string | null
  issuedByPersonId?: string | null
  revokedAt?: Date | null
}

/** An entry ban on the subject as a person (A9): the reason decrypted, the issuer as staff. */
export function entryBanExportRow(row: EntryBanExportSource, subjectPersonId: string, places: NameLookup) {
  return {
    id: row.id,
    place: clubRecord(row.placeId, places),
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? null,
    reason: row.reason,
    incidentId: row.incidentId ?? null,
    issuedBy: actorRef(row.issuedByPersonId, subjectPersonId),
    revokedAt: iso(row.revokedAt),
    ...timestamps(row),
  }
}

export type InternalBookingExportSource = Timestamps & {
  id: string
  placeId: string
  sectionId: string
  startsAt: Date
  endsAt: Date
  purpose: string
  actingRole: string
  status: string
  needsReschedule: boolean
  cancelledByPersonId?: string | null
  cancelReason?: string | null
}

/** An internal booking the subject made (A9): purpose and cancel reason decrypted, the canceller as a relation. */
export function internalBookingExportRow(
  row: InternalBookingExportSource,
  subjectPersonId: string,
  places: NameLookup,
  sections: NameLookup,
) {
  return {
    id: row.id,
    place: clubRecord(row.placeId, places),
    section: clubRecord(row.sectionId, sections),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    purpose: row.purpose,
    actingRole: row.actingRole,
    status: row.status,
    needsReschedule: row.needsReschedule,
    cancelledBy: actorRef(row.cancelledByPersonId, subjectPersonId),
    cancelReason: row.cancelReason ?? null,
    ...timestamps(row),
  }
}

export type PlaceMaintainerExportSource = Timestamps & {
  id: string
  placeId: string
  assignedByPersonId?: string | null
  assignedAt: Date
}

/** A place the subject maintains (A9): the assigner as staff. */
export function placeMaintainerExportRow(
  row: PlaceMaintainerExportSource,
  subjectPersonId: string,
  places: NameLookup,
) {
  return {
    id: row.id,
    place: clubRecord(row.placeId, places),
    assignedBy: actorRef(row.assignedByPersonId, subjectPersonId),
    assignedAt: row.assignedAt.toISOString(),
    ...timestamps(row),
  }
}

export type IncidentPhotoExportSource = {
  id: string
  incidentId: string
  attachmentId: string
  position: number
  fileName: string
  mimeType: string
  fileSize: number
}

export type IncidentExportSource = Timestamps & {
  id: string
  placeId: string
  occurredAt: Date
  kind: string
  description: string
  involved?: string | null
  actionTaken: readonly string[]
  threadId?: string | null
}

/** An incident the subject reported (A9): description and people involved decrypted, its photos by metadata only. */
export function incidentExportRow(
  row: IncidentExportSource,
  photos: readonly IncidentPhotoExportSource[],
  places: NameLookup,
) {
  return {
    id: row.id,
    place: clubRecord(row.placeId, places),
    occurredAt: row.occurredAt.toISOString(),
    kind: row.kind,
    description: row.description,
    involved: row.involved ?? null,
    actionTaken: [...row.actionTaken],
    threadId: row.threadId ?? null,
    photos: photos
      .filter((photo) => photo.incidentId === row.id)
      .sort((a, b) => a.position - b.position)
      .map((photo) => ({
        id: photo.id,
        attachmentId: photo.attachmentId,
        position: photo.position,
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        fileSize: photo.fileSize,
      })),
    ...timestamps(row),
  }
}
