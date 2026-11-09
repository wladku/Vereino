import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { registerModuleSchedule } from '@/modules/foundation'

/** Every 15 minutes (facilities spec *Events, Jobs* row `facilities:rental-lifecycle`; foundation II P-12). */
export const RENTAL_LIFECYCLE_INTERVAL = '15m' as const

/** Every 15 minutes (facilities spec *Events, Jobs* row `facilities:expire-requests`; #125). */
export const EXPIRE_REQUESTS_INTERVAL = '15m' as const

/**
 * `facilities` registers its 15-minute rental lifecycle (#122) and request expiry (#125) per organization (idempotent,
 * upserts on the stable ids). Its ACL features are seeded on the `vereino_*` roles by the role catalogue `people` seeds (`@vereino/core`
 * `roleCatalogue`).
 */
export const setup: ModuleSetupConfig = {
  async seedDefaults({ container, tenantId, organizationId }) {
    await registerModuleSchedule(container, {
      module: 'facilities',
      name: 'rental-lifecycle',
      schedule: { interval: RENTAL_LIFECYCLE_INTERVAL },
      scope: { tenantId, organizationId },
      description: 'Close the confirmed rentals whose slot has ended.',
    })
    await registerModuleSchedule(container, {
      module: 'facilities',
      name: 'expire-requests',
      schedule: { interval: EXPIRE_REQUESTS_INTERVAL },
      scope: { tenantId, organizationId },
      description: 'Expire the booking requests left undecided for 48 hours and delete the unconfirmed ones.',
    })
  },
}

export default setup
