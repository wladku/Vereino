// At-rest encryption of `payments` (payments spec *Data Models* → `payments_charges.description|payer_label`,
// `payments_payments.reference`, `payments_orders.contact_email|contact_phone|notes`,
// `payments_bank_transactions.counterparty_name|counterparty_account|title`, `payments_cash_handovers.rejection_reason`; foundation spec P-09). None has an
// equality lookup (a statement transfer is found again by its `tx_hash` fingerprint), so none carries a hash sibling,
// and no `payments` entity is sent to a search index.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const CHARGE_ENTITY_ID = 'payments:charge'

export const PAYMENT_ENTITY_ID = 'payments:payment'

export const ORDER_ENTITY_ID = 'payments:order'

export const chargeDescription = encryptedField({ entityId: CHARGE_ENTITY_ID, field: 'description' })

/** The typed-in name of an unregistered renter paying a rental charge (payments parity spec, #291). */
export const chargePayerLabel = encryptedField({ entityId: CHARGE_ENTITY_ID, field: 'payer_label' })

/** A transfer title may name the payer or the child (issue #109). */
export const paymentReference = encryptedField({ entityId: PAYMENT_ENTITY_ID, field: 'reference' })

/** The orderer's contact details and the notes answer of a kit order (issue #115, spec *Data Models* → Order). */
export const orderContactEmail = encryptedField({ entityId: ORDER_ENTITY_ID, field: 'contact_email' })
export const orderContactPhone = encryptedField({ entityId: ORDER_ENTITY_ID, field: 'contact_phone' })
export const orderNotes = encryptedField({ entityId: ORDER_ENTITY_ID, field: 'notes' })

export const BANK_TRANSACTION_ENTITY_ID = 'payments:bank_transaction'

/** A statement transfer's sender, their account and the title name third parties (issue #113, REQ-030). */
export const bankCounterpartyName = encryptedField({ entityId: BANK_TRANSACTION_ENTITY_ID, field: 'counterparty_name' })
export const bankCounterpartyAccount = encryptedField({
  entityId: BANK_TRANSACTION_ENTITY_ID,
  field: 'counterparty_account',
})
export const bankTitle = encryptedField({ entityId: BANK_TRANSACTION_ENTITY_ID, field: 'title' })

export const CASH_HANDOVER_ENTITY_ID = 'payments:cash_handover'

/** Why a cash handover was rejected: a free-text difference that may name a payer or a child (D-042, #791). */
export const cashHandoverRejectionReason = encryptedField({ entityId: CASH_HANDOVER_ENTITY_ID, field: 'rejection_reason' })

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  {
    entityId: BANK_TRANSACTION_ENTITY_ID,
    fields: [bankCounterpartyName.mapEntry, bankCounterpartyAccount.mapEntry, bankTitle.mapEntry],
  },
  { entityId: CHARGE_ENTITY_ID, fields: [chargeDescription.mapEntry, chargePayerLabel.mapEntry] },
  { entityId: PAYMENT_ENTITY_ID, fields: [paymentReference.mapEntry] },
  { entityId: CASH_HANDOVER_ENTITY_ID, fields: [cashHandoverRejectionReason.mapEntry] },
  {
    entityId: ORDER_ENTITY_ID,
    fields: [orderContactEmail.mapEntry, orderContactPhone.mapEntry, orderNotes.mapEntry],
  },
]

export default defaultEncryptionMaps
