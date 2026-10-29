// At-rest encryption of `groups` (club spec *Data Models* → `groups_external_teams.contact`; foundation spec P-09).
// The contact has no equality lookup, so it carries no hash sibling, and no `groups` entity is sent to a search index.
import type { ModuleEncryptionMap } from '@open-mercato/shared/modules/encryption'
import { encryptedField } from '@/modules/foundation'

export const EXTERNAL_TEAM_ENTITY_ID = 'groups:external_team'

export const externalTeamContact = encryptedField({ entityId: EXTERNAL_TEAM_ENTITY_ID, field: 'contact' })

export const defaultEncryptionMaps: ModuleEncryptionMap[] = [
  { entityId: EXTERNAL_TEAM_ENTITY_ID, fields: [externalTeamContact.mapEntry] },
]

export default defaultEncryptionMaps
