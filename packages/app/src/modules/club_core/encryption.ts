// At-rest encryption of `club_core` (club spec *Data Models* → `club_core_places.contacts`,
// `club_core_institutions` contact, `bank_account` and `notes`; foundation spec P-09). None of these fields has an
// equality lookup, so none carries a hash sibling, and none is sent to a search index.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const PLACE_ENTITY_ID = 'club_core:place'
export const INSTITUTION_ENTITY_ID = 'club_core:institution'

export const placeContacts = encryptedField({ entityId: PLACE_ENTITY_ID, field: 'contacts' })
export const institutionContactName = encryptedField({ entityId: INSTITUTION_ENTITY_ID, field: 'contact_name' })
export const institutionContactPhone = encryptedField({ entityId: INSTITUTION_ENTITY_ID, field: 'contact_phone' })
export const institutionContactEmail = encryptedField({ entityId: INSTITUTION_ENTITY_ID, field: 'contact_email' })
export const institutionBankAccount = encryptedField({ entityId: INSTITUTION_ENTITY_ID, field: 'bank_account' })
export const institutionNotes = encryptedField({ entityId: INSTITUTION_ENTITY_ID, field: 'notes' })

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: PLACE_ENTITY_ID, fields: [placeContacts.mapEntry] },
  {
    entityId: INSTITUTION_ENTITY_ID,
    fields: [
      institutionContactName.mapEntry,
      institutionContactPhone.mapEntry,
      institutionContactEmail.mapEntry,
      institutionBankAccount.mapEntry,
      institutionNotes.mapEntry,
    ],
  },
]

export default defaultEncryptionMaps
