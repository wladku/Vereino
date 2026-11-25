// Per-club limits (many-clubs spec DD-M10, Q-M04, phase 5; #633): one club's burst must not slow the others on the
// shared instance. Pure: the API dispatcher, the import commands and the e-mail dispatch apply them.
//
// - Requests: every authenticated API request of a club takes one point from the club's budget (default 600 per
//   minute, `VEREINO_CLUB_RATE_LIMIT_POINTS` / `_DURATION`; 0 points switch it off). Public routes keep their own
//   per-route limits, keyed by client address and club, so one club's visitors cannot use up another club's budget.
// - Imports: one running import per club, across import kinds (people import commit, bank statement import).
// - E-mail: see `paceClubEmails` and `createClubSendRateLimiter` in `dispatch-rules.ts` (2 per second per club inside
//   the process's 8 per second).

/** A limiter config in the shape of the platform's `RateLimitConfig` (`@open-mercato/shared/lib/ratelimit/types`). */
export type ClubRequestLimit = { points: number; duration: number; blockDuration: number; keyPrefix: string }

/** Q-M04 (2026-11-23): 600 authenticated requests per minute per club; tuned by the capacity report (#633). */
export const CLUB_REQUEST_LIMIT_DEFAULTS = { points: 600, duration: 60 } as const

function nonNegativeInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

/**
 * The club's request budget from the environment: `VEREINO_CLUB_RATE_LIMIT_POINTS` (requests per window, default 600;
 * `0` switches the budget off and answers null) and `VEREINO_CLUB_RATE_LIMIT_DURATION` (the window in seconds, default
 * 60). An unreadable value falls back to the default.
 */
export function readClubRequestLimit(env: Readonly<Record<string, string | undefined>>): ClubRequestLimit | null {
  const points = nonNegativeInt(env.VEREINO_CLUB_RATE_LIMIT_POINTS) ?? CLUB_REQUEST_LIMIT_DEFAULTS.points
  if (points === 0) return null
  const duration = nonNegativeInt(env.VEREINO_CLUB_RATE_LIMIT_DURATION) || CLUB_REQUEST_LIMIT_DEFAULTS.duration
  return { points, duration, blockDuration: 0, keyPrefix: 'vereino-club' }
}

/** The limiter key of a club's request budget: the trusted tenant id of the session (one club = one tenant, DD-M01). */
export function clubRequestLimitKey(tenantId: string): string {
  return `tenant:${tenantId}`
}

/**
 * The key of a route's own limit (`metadata.rateLimit`): the client address, plus the club slug when the route names
 * one (`/api/<module>/public/<clubSlug>/…`), so the visitors of one club count apart from another club's.
 */
export function routeLimitKey(clientKey: string, params: Readonly<Record<string, string | string[]>>): string {
  const slug = params.clubSlug
  return typeof slug === 'string' && slug !== '' ? `${clientKey}:club:${slug}` : clientKey
}

/** The advisory-lock key that keeps one import per club running (`pg_try_advisory_xact_lock(hashtextextended(…))`). */
export function clubImportLockKey(organizationId: string): string {
  return `vereino.club_import:${organizationId}`
}
