import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { setUpClubPayments } from './services/club-setup'

/**
 * `payments` registers its four schedules per organization (payments parity spec DD-C08; #301): the daily charge
 * generation (06:00) and overdue reminders (09:00) in the club's time zone, and the 15-minute checkout reconciliation
 * and order-campaign closing. Idempotent: the registrations upsert on stable ids. Its ACL features are seeded on the
 * `vereino_*` roles by the role catalogue `people` seeds (`@vereino/core` `roleCatalogue`).
 */
export const setup: ModuleSetupConfig = {
  async seedDefaults({ container, tenantId, organizationId }) {
    await setUpClubPayments(container, { tenantId, organizationId })
  },
}

export default setup
