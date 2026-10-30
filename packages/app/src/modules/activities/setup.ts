import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { setUpClubActivities } from './services/club-setup'

/**
 * `activities` registers its daily generator and the 15-minute confirmation expiry per organization (foundation II P-12)
 * and seeds the default declaration policies (#32). Its ACL features are seeded on the
 * `vereino_*` roles by the role catalogue `people` seeds (`@vereino/core` `roleCatalogue`).
 */
export const setup: ModuleSetupConfig = {
  async seedDefaults({ container, tenantId, organizationId }) {
    await setUpClubActivities(container, { tenantId, organizationId })
  },
}

export default setup
