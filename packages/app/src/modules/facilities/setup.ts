import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { registerModuleSchedule } from '@/modules/foundation'

/** Every 15 minutes (facilities spec *Events, Jobs* row `facilities:rental-lifecycle`; foundation II P-12). */
export const RENTAL_LIFECYCLE_INTERVAL = '15m' as const

/**
 * `facilities` registers its 15-minute rental lifecycle per organization (#122; idempotent, an upsert on the stable
 * id). Its ACL features are seeded on the `vereino_*` roles by the role catalogue `people` seeds (`@vereino/core`
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
  },
}

export default setup
