import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { catalogueRoleFeatures } from '@vereino/core'
import { setUpClubPeople } from './services/club-setup'

/**
 * `people` seeds the phase 1 `vereino_*` roles (foundation spec P-04, Q17): `vereino_club_admin` (module
 * wildcards), `vereino_coordinator`, `vereino_coach`, `vereino_member` and `vereino_payer`, with the features of the
 * club spec's *Users, Permissions, and Scope* table (`catalogueRoleFeatures()`); the names serve only for
 * assignment, never for checking (DD-06). The platform built-in roles get no Vereino feature.
 */
export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: catalogueRoleFeatures(),

  async seedDefaults({ container, tenantId, organizationId }) {
    await setUpClubPeople(container, { tenantId, organizationId })
  },
}

export default setup
