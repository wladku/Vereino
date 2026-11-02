// At-rest encryption of the foundation's dispatch outbox (foundation III *Security* → Personal data, DD-M04; P-09): the
// template params (the subject and excerpt may be personal), the recipient's address with the `email_hash` lookup
// sibling the platform fills (the hash is kept after the address is wiped at the final state) and the per-recipient
// secret params (a raw link token). None of them is searchable.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from './services/encrypted-field'

export const DISPATCH_ENTITY_ID = 'foundation:dispatch'
export const DELIVERY_ENTITY_ID = 'foundation:delivery'

export const dispatchParams = encryptedField({ entityId: DISPATCH_ENTITY_ID, field: 'params' })
export const deliveryEmail = encryptedField({ entityId: DELIVERY_ENTITY_ID, field: 'email', hash: true })
export const deliverySecretParams = encryptedField({ entityId: DELIVERY_ENTITY_ID, field: 'secret_params' })

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: DISPATCH_ENTITY_ID, fields: [dispatchParams.mapEntry] },
  { entityId: DELIVERY_ENTITY_ID, fields: [deliveryEmail.mapEntry, deliverySecretParams.mapEntry] },
]

export default defaultEncryptionMaps
