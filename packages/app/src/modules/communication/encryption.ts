// At-rest encryption of `communication` (foundation III *Security* → Personal data; club spec `encryption.ts` row for
// phase 3; P-09): a thread's subject and a message's body are club-entered text that may name children. Neither has an
// equality lookup, so neither carries a hash sibling, and neither is sent to a search index.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const THREAD_ENTITY_ID = 'communication:thread'
export const THREAD_MESSAGE_ENTITY_ID = 'communication:thread_message'

export const threadSubject = encryptedField({ entityId: THREAD_ENTITY_ID, field: 'subject' })
export const threadMessageBody = encryptedField({ entityId: THREAD_MESSAGE_ENTITY_ID, field: 'body' })

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: THREAD_ENTITY_ID, fields: [threadSubject.mapEntry] },
  { entityId: THREAD_MESSAGE_ENTITY_ID, fields: [threadMessageBody.mapEntry] },
]

export default defaultEncryptionMaps
