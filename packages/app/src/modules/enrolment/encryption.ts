// At-rest encryption of `enrolment` (sign-up form spec *Security, Privacy, and Compliance* → Encryption; #799): the
// participant's and the contact's names, the contact's e-mail and phone, the note and the reject reason, with the
// club's tenant key. None has an equality lookup through the platform (the BR-J3 and data-subject keys are computed
// by the module itself), so none carries a hash sibling, and none is sent to a search index.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const APPLICATION_ENCRYPTION_ENTITY_ID = 'enrolment:application'

const applicationFields = [
  'participant_first_name',
  'participant_last_name',
  'guardian_first_name',
  'guardian_last_name',
  'guardian_email',
  'guardian_phone',
  'note',
  'decision_reason',
].map((field) => encryptedField({ entityId: APPLICATION_ENCRYPTION_ENTITY_ID, field }))

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: APPLICATION_ENCRYPTION_ENTITY_ID, fields: applicationFields.map((field) => field.mapEntry) },
]

export default defaultEncryptionMaps
