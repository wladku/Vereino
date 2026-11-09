// At-rest encryption of `facilities` (facilities spec *Data Models* → `facilities_rentals`, `facilities_entry_bans`;
// *Security, Privacy, and Compliance*; foundation spec P-09; #122): the renter's name and contact data, the purpose,
// the decision reason and the notes of a rental, the reason of an entry ban, and the purpose and cancellation reason of
// an internal booking (#123). None has an equality lookup, so none
// carries a hash sibling, and none is sent to a search index.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const RENTAL_ENCRYPTION_ENTITY_ID = 'facilities:rental'
export const ENTRY_BAN_ENCRYPTION_ENTITY_ID = 'facilities:entry_ban'
export const INTERNAL_BOOKING_ENCRYPTION_ENTITY_ID = 'facilities:internal_booking'
export const LOG_ENCRYPTION_ENTITY_ID = 'facilities:facility_log'
export const INCIDENT_ENCRYPTION_ENTITY_ID = 'facilities:incident'

const rentalFields = [
  'renter_display_name',
  'contact_name',
  'contact_phone',
  'contact_email',
  'purpose',
  'decision_reason',
  'notes',
].map((field) => encryptedField({ entityId: RENTAL_ENCRYPTION_ENTITY_ID, field }))

export const entryBanReason = encryptedField({ entityId: ENTRY_BAN_ENCRYPTION_ENTITY_ID, field: 'reason' })

// #123: the purpose and the cancellation reason of an internal booking (free text that may name people).
const internalBookingFields = ['purpose', 'cancel_reason'].map((field) =>
  encryptedField({ entityId: INTERNAL_BOOKING_ENCRYPTION_ENTITY_ID, field }),
)

// #126: the log's remarks, and the incident's description and people involved (evidence that names people).
const logFields = ['remarks'].map((field) => encryptedField({ entityId: LOG_ENCRYPTION_ENTITY_ID, field }))
const incidentFields = ['description', 'involved'].map((field) =>
  encryptedField({ entityId: INCIDENT_ENCRYPTION_ENTITY_ID, field }),
)

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: RENTAL_ENCRYPTION_ENTITY_ID, fields: rentalFields.map((field) => field.mapEntry) },
  { entityId: ENTRY_BAN_ENCRYPTION_ENTITY_ID, fields: [entryBanReason.mapEntry] },
  { entityId: INTERNAL_BOOKING_ENCRYPTION_ENTITY_ID, fields: internalBookingFields.map((field) => field.mapEntry) },
  { entityId: LOG_ENCRYPTION_ENTITY_ID, fields: logFields.map((field) => field.mapEntry) },
  { entityId: INCIDENT_ENCRYPTION_ENTITY_ID, fields: incidentFields.map((field) => field.mapEntry) },
]

export default defaultEncryptionMaps
