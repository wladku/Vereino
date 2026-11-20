import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { setUpClubFacilities } from './services/club-setup'

export { EXPIRE_REQUESTS_INTERVAL, MAINTENANCE_REMINDERS_CRON, RENTAL_LIFECYCLE_INTERVAL } from './services/club-setup'

/**
 * `facilities` registers its 15-minute rental lifecycle (#122) and request expiry (#125) and the daily maintenance
 * reminders (#128) per organization (idempotent, upserts on the stable ids; `facilities set-up-club` re-runs it for a
 * club set up before a schedule existed, #221). Its ACL features are seeded on the `vereino_*` roles by the role
 * catalogue `people` seeds (`@vereino/core` `roleCatalogue`).
 */
export const setup: ModuleSetupConfig = {
  async seedDefaults({ container, tenantId, organizationId }) {
    await setUpClubFacilities(container, { tenantId, organizationId })
  },
}

export default setup
