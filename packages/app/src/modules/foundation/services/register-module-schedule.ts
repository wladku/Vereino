// P-12 registerModuleSchedule (foundation II DD-G07, V-6): upserts one scheduled job per organization for the
// worker `<module>:<name>`, from a module's `setup.ts` `seedDefaults`. The stable id is the platform's
// `stableScheduleUuid` construction (a module-private function in the installed `communication_channels` and
// `ai_assistant` setups, mirrored here), so a re-run updates the same row.
import { createHash } from 'node:crypto'
import type { AwilixContainer } from 'awilix'
import { createLogger } from '@open-mercato/shared/lib/logger'
import {
  moduleScheduleKey,
  moduleScheduleQueue,
  moduleScheduleTiming,
  moduleWorkerId,
  type ModuleScheduleScope,
  type ModuleScheduleSpec,
} from '@vereino/core'

const logger = createLogger('foundation')

/** The subset of the installed `SchedulerService.register` input a module schedule uses. */
type SchedulerServiceLike = {
  register(registration: {
    id: string
    name: string
    scopeType: 'organization'
    organizationId: string
    tenantId: string
    scheduleType: 'cron' | 'interval'
    scheduleValue: string
    timezone: string
    targetType: 'queue'
    targetQueue: string
    sourceType: 'module'
    sourceModule: string
    description?: string
  }): Promise<void>
}

export type ModuleScheduleRegistration = {
  /** Owning module id; the scheduler dispatches only to workers whose id starts with it. */
  module: string
  /** Kebab-case job name; the worker file is `workers/<name>.ts`. */
  name: string
  /** Cron in the club's time zone, or an interval of at least one minute. */
  schedule: ModuleScheduleSpec
  /** The organization the job runs for; the scheduler injects it into every run's payload. */
  scope: ModuleScheduleScope
  description?: string
}

/** sha256 of the stable key formatted as a uuid (`scheduled_jobs.id` is a uuid column). */
function stableScheduleUuid(stableKey: string): string {
  const hex = createHash('sha256').update(stableKey).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * Registers (upserts) the schedule and returns true. Never throws: a failure — the scheduler module disabled,
 * an invalid spec, the per-tenant cap of active schedules — is logged as a warning and returns false, like the
 * platform's own module registrations, so tenant setup continues.
 */
export async function registerModuleSchedule(
  container: AwilixContainer,
  registration: ModuleScheduleRegistration,
): Promise<boolean> {
  const { module, name, schedule, scope, description } = registration
  try {
    const timing = moduleScheduleTiming(schedule)
    const schedulerService = container.resolve<SchedulerServiceLike>('schedulerService')
    await schedulerService.register({
      id: stableScheduleUuid(moduleScheduleKey(module, name, scope)),
      name: moduleWorkerId(module, name),
      scopeType: 'organization',
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      ...timing,
      targetType: 'queue',
      targetQueue: moduleScheduleQueue(module, name),
      sourceType: 'module',
      sourceModule: module,
      ...(description ? { description } : {}),
    })
    return true
  } catch (error: unknown) {
    logger.warn('Module schedule registration failed', {
      module,
      name,
      organizationId: scope.organizationId,
      err: error,
    })
    return false
  }
}
