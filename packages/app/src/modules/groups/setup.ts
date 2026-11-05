import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedAgeCategoryDictionary } from './services/age-categories'

/**
 * `groups` seeds the club's age category dictionary with the PZPN defaults (club spec REQ-019, *Setup and data*, #92).
 * Its ACL features are seeded on the `vereino_*` roles by the role catalogue `people` seeds (`@vereino/core`
 * `roleCatalogue`).
 */
export const setup: ModuleSetupConfig = {
  async seedDefaults({ container, tenantId, organizationId }) {
    await seedAgeCategoryDictionary(container, { tenantId, organizationId })
  },
}

export default setup
