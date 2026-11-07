// At-rest encryption of `facilities` (facilities spec *Data Models* → `facilities_rentals`, `facilities_entry_bans`;
// *Security, Privacy, and Compliance*; foundation spec P-09; #122): the renter's name and contact data, the purpose,
// the decision reason and the notes of a rental, and the reason of an entry ban. None has an equality lookup, so none
// carries a hash sibling, and none is sent to a search index.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const RENTAL_ENCRYPTION_ENTITY_ID = 'facilities:rental'
export const ENTRY_BAN_ENCRYPTION_ENTITY_ID = 'facilities:entry_ban'

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

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: RENTAL_ENCRYPTION_ENTITY_ID, fields: rentalFields.map((field) => field.mapEntry) },
  { entityId: ENTRY_BAN_ENCRYPTION_ENTITY_ID, fields: [entryBanReason.mapEntry] },
]

export default defaultEncryptionMaps
