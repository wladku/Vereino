// Naming and schedule rules of module jobs (foundation II DD-G07, engineering standards S4.7): one scheduled
// job per organization for `<module>:<name>`, consumed by the worker file `workers/<name>.ts` whose metadata is
// `{ queue: '<module>-<name>', id: '<module>:<name>', concurrency: 1 }`.

/** Cron with the club's IANA time zone, or an interval of at least one minute (`s` units are not accepted). */
export type ModuleScheduleSpec =
  { readonly cron: string; readonly timezone: string } | { readonly interval: `${number}${'m' | 'h' | 'd'}` }

export type ModuleScheduleScope = {
  readonly tenantId: string
  readonly organizationId: string
}

export type ModuleScheduleTiming = {
  readonly scheduleType: 'cron' | 'interval'
  readonly scheduleValue: string
  readonly timezone: string
}

const MODULE_ID_PATTERN = /^[a-z][a-z0-9_]*$/
const JOB_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const INTERVAL_PATTERN = /^(\d+)(m|h|d)$/
const MINUTES_PER_UNIT: Readonly<Record<string, number>> = { m: 1, h: 60, d: 24 * 60 }

function assertJobName(module: string, name: string): void {
  if (!MODULE_ID_PATTERN.test(module)) throw new RangeError(`[internal] invalid module id ${JSON.stringify(module)}`)
  if (!JOB_NAME_PATTERN.test(name)) throw new RangeError(`[internal] invalid job name ${JSON.stringify(name)}`)
}

/** The worker id `<module>:<name>` (S3.4); the scheduler dispatches only to workers its source module owns. */
export function moduleWorkerId(module: string, name: string): string {
  assertJobName(module, name)
  return `${module}:${name}`
}

/** The queue `<module>-<name>` the schedule targets and the worker consumes. */
export function moduleScheduleQueue(module: string, name: string): string {
  assertJobName(module, name)
  return `${module}-${name}`
}

/** The stable key the schedule id is derived from: one key per job and organization. */
export function moduleScheduleKey(module: string, name: string, scope: ModuleScheduleScope): string {
  if (!scope.tenantId || !scope.organizationId) throw new RangeError('[internal] a module schedule needs a scope')
  return `${moduleWorkerId(module, name)}:${scope.tenantId}:${scope.organizationId}`
}

/** The scheduler's `scheduleType`, `scheduleValue` and `timezone` for a spec; rejects intervals below 60 s. */
export function moduleScheduleTiming(spec: ModuleScheduleSpec): ModuleScheduleTiming {
  if ('cron' in spec) {
    if (!spec.cron.trim() || !spec.timezone.trim()) throw new RangeError('[internal] cron and timezone are required')
    return { scheduleType: 'cron', scheduleValue: spec.cron.trim(), timezone: spec.timezone.trim() }
  }
  const match = INTERVAL_PATTERN.exec(spec.interval)
  const minutes = match ? Number(match[1]) * (MINUTES_PER_UNIT[match[2] as string] as number) : 0
  if (minutes < 1) throw new RangeError(`[internal] interval ${spec.interval} is shorter than one minute`)
  return { scheduleType: 'interval', scheduleValue: spec.interval, timezone: 'UTC' }
}
