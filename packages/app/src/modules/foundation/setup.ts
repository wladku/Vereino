import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { DISPATCH_SWEEP_INTERVAL, DISPATCH_SWEEP_KEY, sweepEnabled } from './services/club-jobs'
import { registerModuleSchedule } from './services/register-module-schedule'

export { DISPATCH_SWEEP_INTERVAL }

/**
 * The foundation registers the dispatch sweeper per organization (foundation II P-12; #71) — until the operator moved
 * it onto the one system-scope dispatch sweep (`foundation retire-club-schedules --job foundation:dispatch-sweep`,
 * many-clubs spec DD-M07 (b), #629); from then on a new club needs no schedule of its own. Idempotent: the schedule id
 * is stable, so a rerun of the setup updates the same row; a failure is logged and never stops the tenant setup.
 */
export const setup: ModuleSetupConfig = {
  async seedDefaults({ container, tenantId, organizationId }) {
    if (await sweepEnabled(container, DISPATCH_SWEEP_KEY)) return
    await registerModuleSchedule(container, {
      module: 'foundation',
      name: 'dispatch-sweep',
      schedule: { interval: DISPATCH_SWEEP_INTERVAL },
      scope: { tenantId, organizationId },
      description: 'Resume queued message deliveries that are due or whose worker stopped.',
    })
  },
}

export default setup
