// At-rest encryption of `activities` (club spec `encryption.ts` row for phase 2: the substitution reason; DD-12; P-09;
// E06-S13 #95): the reason a coach gives for an absence, or a coordinator for a substitution, is free text that may
// name health or family matters. It has no equality lookup, so it carries no hash sibling, and it is not searched.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const SUBSTITUTION_ENTRY_ENTITY_ID = 'activities:substitution_entry'

export const substitutionReason = encryptedField({ entityId: SUBSTITUTION_ENTRY_ENTITY_ID, field: 'reason' })

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: SUBSTITUTION_ENTRY_ENTITY_ID, fields: [substitutionReason.mapEntry] },
]

export default defaultEncryptionMaps
