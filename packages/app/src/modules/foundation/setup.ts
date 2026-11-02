import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { registerModuleSchedule } from './services/register-module-schedule'

/** Every 2 minutes (foundation III P-30, DD-M03): the dispatch sweeper resumes stalled and retried deliveries. */
export const DISPATCH_SWEEP_INTERVAL = '2m' as const

/**
 * The foundation registers the dispatch sweeper per organization (foundation II P-12; #71). Idempotent: the schedule
 * id is stable, so a rerun of the setup updates the same row; a failure is logged and never stops the tenant setup.
 */
export const setup: ModuleSetupConfig = {
  async seedDefaults({ container, tenantId, organizationId }) {
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
