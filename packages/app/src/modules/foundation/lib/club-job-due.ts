// Due times of per-club jobs (many-clubs spec DD-M04…DD-M06, BR-M3; E22-S03 #629). One sweep per job type visits the
// clubs whose `foundation_club_jobs.next_due_at` has passed; this file says when that is. A time-of-day job runs at
// the club's local `HH:MM` plus a stable offset of 0–20 minutes from a hash of the organization id, computed from the
// local date (never by adding 24 h), so it runs once per local day across a daylight-saving change: a local time in
// the spring gap moves forward by the gap, a repeated autumn time takes its first occurrence (`zonedInstant`). An
// interval job gets a stable offset within its interval. Pure: the caller passes the instant (S3.5).
import { createHash } from 'node:crypto'
import {
  addCalendarDays,
  calendarDateInZone,
  isLocalTime,
  zonedInstant,
  type ModuleScheduleSpec,
} from '@vereino/core'

const MINUTE_MS = 60_000
const DAY_MINUTES = 24 * 60

/** A daily job's start times spread over this window after its local `HH:MM` (DD-M05). */
export const DAILY_SPREAD_MS = 20 * MINUTE_MS

/** The latest a worker's own `nextDueAt` may put an interval job (DD-M06 safety net). */
export const INTERVAL_MAX_DELAY_MS = DAY_MINUTES * MINUTE_MS

/** How long a claimed row stays leased before the worker starts (BR-M2's enqueue lease). */
export const ENQUEUE_LEASE_MS = 5 * MINUTE_MS

/** A job type's run timeout when its declaration names none: the lease a started run holds. */
export const DEFAULT_JOB_TIMEOUT_MINUTES = 30

/** A failed run is retried after this long, or after its interval when that is shorter. */
export const FAILURE_RETRY_MS = 15 * MINUTE_MS

/** At most this many clubs are claimed per sweep pass; the sweep repeats passes until none is due (DD-M04). */
export const SWEEP_BATCH_SIZE = 200

/** A time-of-day job (`dailyAt`, local `HH:MM` in the club zone) or an interval job (`everyMinutes`, at least 1). */
export type ClubJobSchedule = { readonly dailyAt: string } | { readonly everyMinutes: number }

/**
 * A module's per-club job (spec *Architecture*: "each module declares its jobs (key, kind, timeout)"). `key` is the
 * worker id `<module>:<name>`; the worker consumes the queue `<module>-<name>`.
 */
export type ClubJobDeclaration = {
  readonly key: string
  readonly schedule: ClubJobSchedule
  readonly description: string
  readonly timeoutMinutes?: number
}

/** What the due time of one club depends on. */
export type ClubJobClock = { readonly now: Date; readonly timeZone: string; readonly organizationId: string }

const JOB_KEY = /^([a-z][a-z0-9_]*):([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/

/** `payments:generate-charges` → `{ module: 'payments', name: 'generate-charges' }`; throws on anything else. */
export function parseClubJobKey(key: string): { module: string; name: string } {
  const match = JOB_KEY.exec(key)
  if (!match) throw new RangeError(`[internal] invalid club job key ${JSON.stringify(key)}`)
  return { module: String(match[1]), name: String(match[2]) }
}

/** Throws a `RangeError` unless the declaration has a valid key, schedule and timeout. */
export function assertClubJobDeclaration(declaration: ClubJobDeclaration): void {
  parseClubJobKey(declaration.key)
  const { schedule } = declaration
  if ('dailyAt' in schedule) {
    if (!isLocalTime(schedule.dailyAt)) throw new RangeError(`[internal] ${declaration.key}: dailyAt must be HH:mm`)
  } else if (!Number.isInteger(schedule.everyMinutes) || schedule.everyMinutes < 1) {
    throw new RangeError(`[internal] ${declaration.key}: everyMinutes must be a whole number of at least 1`)
  }
  const timeout = declaration.timeoutMinutes
  if (timeout !== undefined && (!Number.isInteger(timeout) || timeout < 1)) {
    throw new RangeError(`[internal] ${declaration.key}: timeoutMinutes must be a whole number of at least 1`)
  }
}

/** The stable offset of a club inside `windowMs`: the first 48 bits of sha256(organization id), modulo the window. */
export function clubJobOffsetMs(organizationId: string, windowMs: number): number {
  const hash = Number.parseInt(createHash('sha256').update(organizationId).digest('hex').slice(0, 12), 16)
  return hash % windowMs
}

/** The next instant strictly after `clock.now` at which the club's job is due. */
export function nextClubJobDue(schedule: ClubJobSchedule, clock: ClubJobClock): Date {
  const now = clock.now.getTime()
  if ('dailyAt' in schedule) {
    const offset = clubJobOffsetMs(clock.organizationId, DAILY_SPREAD_MS)
    const today = calendarDateInZone(clock.now, clock.timeZone)
    // Yesterday's run may still lie ahead (an offset past local midnight); tomorrow's always does.
    const candidates = [-1, 0, 1]
      .map((days) => zonedInstant(addCalendarDays(today, days), schedule.dailyAt, clock.timeZone).getTime() + offset)
      .filter((due) => due > now)
    return new Date(Math.min(...candidates))
  }
  const interval = schedule.everyMinutes * MINUTE_MS
  const offset = clubJobOffsetMs(clock.organizationId, interval)
  return new Date(Math.floor((now - offset) / interval) * interval + offset + interval)
}

/** The latest due time a worker's own `nextDueAt` may set (DD-M06): the next local run, or 24 h for interval jobs. */
export function latestClubJobDue(schedule: ClubJobSchedule, clock: ClubJobClock): Date {
  if ('dailyAt' in schedule) return nextClubJobDue(schedule, clock)
  return new Date(clock.now.getTime() + INTERVAL_MAX_DELAY_MS)
}

/**
 * The next due time after a finished run: the worker's `nextDueAt` when it gave a valid one, never later than
 * `latestClubJobDue`; otherwise the declared schedule's next due time.
 */
export function dueAfterRun(schedule: ClubJobSchedule, clock: ClubJobClock, requested?: Date | null): Date {
  if (!(requested instanceof Date) || Number.isNaN(requested.getTime())) return nextClubJobDue(schedule, clock)
  const latest = latestClubJobDue(schedule, clock)
  return requested.getTime() < latest.getTime() ? requested : latest
}

/** When a failed run is retried: after `FAILURE_RETRY_MS`, or after the interval when that is shorter. */
export function dueAfterFailure(schedule: ClubJobSchedule, now: Date): Date {
  const interval = 'dailyAt' in schedule ? FAILURE_RETRY_MS : schedule.everyMinutes * MINUTE_MS
  return new Date(now.getTime() + Math.min(interval, FAILURE_RETRY_MS))
}

/** The lease a started run holds: its declared timeout, 30 minutes by default. */
export function runLeaseMs(declaration: ClubJobDeclaration): number {
  return (declaration.timeoutMinutes ?? DEFAULT_JOB_TIMEOUT_MINUTES) * MINUTE_MS
}

/**
 * The per-club scheduler spec of the old setup for a declaration (`restore-club-schedules`, the rollback of DD-M04):
 * `HH:MM` → the cron `M H * * *` in the club zone; minutes → `Nd`, `Nh` or `Nm`.
 */
export function perClubScheduleSpec(schedule: ClubJobSchedule, timeZone: string): ModuleScheduleSpec {
  if ('dailyAt' in schedule) {
    const [hours, minutes] = schedule.dailyAt.split(':').map(Number)
    return { cron: `${String(minutes)} ${String(hours)} * * *`, timezone: timeZone }
  }
  const minutes = schedule.everyMinutes
  if (minutes % DAY_MINUTES === 0) return { interval: `${minutes / DAY_MINUTES}d` }
  if (minutes % 60 === 0) return { interval: `${minutes / 60}h` }
  return { interval: `${minutes}m` }
}

/** The queue a job type's worker consumes, `<module>-<name>`. */
export function clubJobQueue(key: string): string {
  const { module, name } = parseClubJobKey(key)
  return `${module}-${name}`
}
