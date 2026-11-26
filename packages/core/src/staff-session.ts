// Staff session lifetime and the e-mail change confirmation (engineering standards S8.5, ENG-Q-12 answered by the
// owner on 2026-11-26, #737). Pure: the `foundation` module applies the policy to the platform's session rows, and the
// app shell's activity tracker reads the idle rule.
//
// - A staff account (any role outside the member-session roles of the catalogue, platform roles included) gets an
//   idle timeout of 30 minutes inside the platform's absolute lifetime of 8 hours; "remember me" does not lengthen it.
// - A member account keeps the platform lifetime (8 hours, or `REMEMBER_ME_DAYS` with "remember me").
// - Changing one's own login e-mail needs the current password.
import { VEREINO_ROLES, roleCatalogue } from '#src/roles'

/** The `auth` role names that alone keep the member session lifetime (`memberSession` in the catalogue). */
export const MEMBER_SESSION_AUTH_ROLES: readonly string[] = VEREINO_ROLES.filter(
  (role) => roleCatalogue[role].memberSession === true,
).map((role) => roleCatalogue[role].authRole)

/**
 * Whether an account with these `auth` roles is a staff account. Fails closed: every role outside the member-session
 * roles — a staff role of the catalogue, a platform role (`superadmin`, `admin`, `employee`) or an unknown one — makes
 * it staff. An account without roles is a member account (it can reach nothing a staff role guards).
 */
export function isStaffAccount(roles: readonly string[] | null | undefined): boolean {
  return (roles ?? []).some((role) => !MEMBER_SESSION_AUTH_ROLES.includes(role))
}

/** ENG-Q-12: 30 minutes idle (S8.5 target), inside the platform's absolute 8 hours (its JWT and session lifetime). */
export const STAFF_SESSION_DEFAULTS = { idleMinutes: 30, absoluteHours: 8 } as const

/** The longest idle timeout the environment may set: the absolute lifetime itself. */
export const STAFF_IDLE_MINUTES_MAX = STAFF_SESSION_DEFAULTS.absoluteHours * 60

/**
 * The staff idle timeout in minutes from `VEREINO_STAFF_IDLE_MINUTES`: a whole number from 1 to 480; unset or
 * unreadable falls back to 30. Production keeps 30 (`docs/ops/deploy.md`).
 */
export function readStaffIdleMinutes(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env.VEREINO_STAFF_IDLE_MINUTES
  if (raw === undefined || raw.trim() === '') return STAFF_SESSION_DEFAULTS.idleMinutes
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= STAFF_IDLE_MINUTES_MAX
    ? parsed
    : STAFF_SESSION_DEFAULTS.idleMinutes
}

const MINUTE_MS = 60_000

/**
 * When a staff session expires after activity at `now`: `now` plus the idle timeout, never past `createdAt` plus the
 * absolute lifetime.
 */
export function staffSessionExpiry(input: { createdAt: Date; now: Date; idleMinutes: number }): Date {
  const idleEnd = input.now.getTime() + input.idleMinutes * MINUTE_MS
  const absoluteEnd = input.createdAt.getTime() + STAFF_SESSION_DEFAULTS.absoluteHours * 60 * MINUTE_MS
  return new Date(Math.min(idleEnd, absoluteEnd))
}

/** The browser tells the server about activity at most once a minute. */
export const ACTIVITY_REPORT_INTERVAL_MS = MINUTE_MS

/**
 * Whether the browser reports activity now: there was activity after the last report and the last report is at least
 * `ACTIVITY_REPORT_INTERVAL_MS` old (or there was none).
 */
export function activityReportDue(input: {
  lastActivityAt: number
  lastReportAt: number | null
  now: number
}): boolean {
  if (input.lastReportAt === null) return true
  if (input.lastActivityAt <= input.lastReportAt) return false
  return input.now - input.lastReportAt >= ACTIVITY_REPORT_INTERVAL_MS
}

/** Whether the signed-in staff user has been idle for the whole timeout (the browser then signs out). */
export function staffSessionIdle(input: { lastActivityAt: number; now: number; idleMinutes: number }): boolean {
  return input.now - input.lastActivityAt >= input.idleMinutes * MINUTE_MS
}

/** A login e-mail as the comparison sees it: trimmed and lower-case. */
export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Whether an `auth.users.update` input changes the actor's own login e-mail: the input names the actor and carries an
 * e-mail that differs from the stored one. An update of another user, or without an e-mail, is no own change.
 */
export function isOwnEmailChange(input: {
  actorId: string | null | undefined
  targetId: unknown
  email: unknown
  storedEmail: string | null
}): boolean {
  if (!input.actorId || input.targetId !== input.actorId) return false
  if (typeof input.email !== 'string') return false
  return normalizeLoginEmail(input.email) !== normalizeLoginEmail(input.storedEmail ?? '')
}
