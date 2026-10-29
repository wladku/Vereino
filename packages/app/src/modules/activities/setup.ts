import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { registerGenerateSchedule } from './services/club-setup'

/**
 * `activities` registers its daily generator per organization (foundation II P-12). Its ACL features are seeded on the
 * `vereino_*` roles by the role catalogue `people` seeds (`@vereino/core` `roleCatalogue`).
 */
export const setup: ModuleSetupConfig = {
  async seedDefaults({ container, tenantId, organizationId }) {
    await registerGenerateSchedule(container, { tenantId, organizationId })
  },
}

export default setup
