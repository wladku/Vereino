// At-rest encryption of `payments` (payments spec *Data Models* → `payments_charges.description`,
// `payments_payments.reference`, `payments_orders.contact_email|contact_phone|notes`; foundation spec P-09). None has
// an equality lookup, so none carries a hash sibling, and no `payments` entity is sent to a search index.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const CHARGE_ENTITY_ID = 'payments:charge'

export const PAYMENT_ENTITY_ID = 'payments:payment'

export const ORDER_ENTITY_ID = 'payments:order'

export const chargeDescription = encryptedField({ entityId: CHARGE_ENTITY_ID, field: 'description' })

/** A transfer title may name the payer or the child (issue #109). */
export const paymentReference = encryptedField({ entityId: PAYMENT_ENTITY_ID, field: 'reference' })

/** The orderer's contact details and the notes answer of a kit order (issue #115, spec *Data Models* → Order). */
export const orderContactEmail = encryptedField({ entityId: ORDER_ENTITY_ID, field: 'contact_email' })
export const orderContactPhone = encryptedField({ entityId: ORDER_ENTITY_ID, field: 'contact_phone' })
export const orderNotes = encryptedField({ entityId: ORDER_ENTITY_ID, field: 'notes' })

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: CHARGE_ENTITY_ID, fields: [chargeDescription.mapEntry] },
  { entityId: PAYMENT_ENTITY_ID, fields: [paymentReference.mapEntry] },
  {
    entityId: ORDER_ENTITY_ID,
    fields: [orderContactEmail.mapEntry, orderContactPhone.mapEntry, orderNotes.mapEntry],
  },
]

export default defaultEncryptionMaps
