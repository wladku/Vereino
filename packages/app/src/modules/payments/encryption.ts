// At-rest encryption of `payments` (payments spec *Data Models* → `payments_charges.description`,
// `payments_payments.reference`; foundation spec P-09). Neither has an equality lookup, so neither carries a hash
// sibling, and no `payments` entity is sent to a search index.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const CHARGE_ENTITY_ID = 'payments:charge'

export const PAYMENT_ENTITY_ID = 'payments:payment'

export const chargeDescription = encryptedField({ entityId: CHARGE_ENTITY_ID, field: 'description' })

/** A transfer title may name the payer or the child (issue #109). */
export const paymentReference = encryptedField({ entityId: PAYMENT_ENTITY_ID, field: 'reference' })

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: CHARGE_ENTITY_ID, fields: [chargeDescription.mapEntry] },
  { entityId: PAYMENT_ENTITY_ID, fields: [paymentReference.mapEntry] },
]

export default defaultEncryptionMaps
