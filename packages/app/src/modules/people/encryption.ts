// At-rest encryption of `people` (club spec *Data Models* → `people_persons`; foundation spec P-09, V-3, DD-38).
// The PESEL carries the deterministic `pesel_hash` sibling the platform fills with `hashForLookup`, used for
// duplicate detection, and so does the import's `external_id` (#28); names, e-mail, phone and notes are encrypted
// without a hash, and so is the staged row of an import. None of them is sent to an
// external search provider; names are found through the platform's hashed `search_tokens`.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const PERSON_ENTITY_ID = 'people:person'

export const personPesel = encryptedField({ entityId: PERSON_ENTITY_ID, field: 'pesel', hash: true })
export const personFirstName = encryptedField({ entityId: PERSON_ENTITY_ID, field: 'first_name' })
export const personLastName = encryptedField({ entityId: PERSON_ENTITY_ID, field: 'last_name' })
export const personEmail = encryptedField({ entityId: PERSON_ENTITY_ID, field: 'email' })
export const personPhone = encryptedField({ entityId: PERSON_ENTITY_ID, field: 'phone' })
export const personNotes = encryptedField({ entityId: PERSON_ENTITY_ID, field: 'notes' })
/** The import's identifier for a person without a PESEL (#28), with the `external_id_hash` lookup sibling. */
export const personExternalId = encryptedField({ entityId: PERSON_ENTITY_ID, field: 'external_id', hash: true })

export const PERSON_IMPORT_ROW_ENTITY_ID = 'people:person_import_row'
/** The staged row's values (names, PESEL, contacts) of a bulk import (club spec → `people_import_rows`, #28). */
export const importRowRaw = encryptedField({ entityId: PERSON_IMPORT_ROW_ENTITY_ID, field: 'raw' })

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  {
    entityId: PERSON_ENTITY_ID,
    fields: [
      personFirstName.mapEntry,
      personLastName.mapEntry,
      personEmail.mapEntry,
      personPhone.mapEntry,
      personNotes.mapEntry,
      personPesel.mapEntry,
      personExternalId.mapEntry,
    ],
  },
  { entityId: PERSON_IMPORT_ROW_ENTITY_ID, fields: [importRowRaw.mapEntry] },
]

export default defaultEncryptionMaps
