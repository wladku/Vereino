// At-rest encryption of `payments` (payments spec *Data Models* → `payments_charges.description`; foundation spec
// P-09). The description has no equality lookup, so it carries no hash sibling, and no `payments` entity is sent to a
// search index.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const CHARGE_ENTITY_ID = 'payments:charge'

export const chargeDescription = encryptedField({ entityId: CHARGE_ENTITY_ID, field: 'description' })

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: CHARGE_ENTITY_ID, fields: [chargeDescription.mapEntry] },
]

export default defaultEncryptionMaps
