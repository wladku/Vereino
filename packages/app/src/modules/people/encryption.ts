// At-rest encryption of `people` (club spec *Data Models* → `people_persons`; foundation spec P-09, V-3, DD-38).
// The PESEL carries the deterministic `pesel_hash` sibling the platform fills with `hashForLookup`, used for
// duplicate detection; names and e-mail are encrypted without a hash. None of them is sent to an external search
// provider; names are found through the platform's hashed `search_tokens`.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const PERSON_ENTITY_ID = 'people:person'

export const personPesel = encryptedField({ entityId: PERSON_ENTITY_ID, field: 'pesel', hash: true })
export const personFirstName = encryptedField({ entityId: PERSON_ENTITY_ID, field: 'first_name' })
export const personLastName = encryptedField({ entityId: PERSON_ENTITY_ID, field: 'last_name' })
export const personEmail = encryptedField({ entityId: PERSON_ENTITY_ID, field: 'email' })

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  {
    entityId: PERSON_ENTITY_ID,
    fields: [personFirstName.mapEntry, personLastName.mapEntry, personEmail.mapEntry, personPesel.mapEntry],
  },
]

export default defaultEncryptionMaps
