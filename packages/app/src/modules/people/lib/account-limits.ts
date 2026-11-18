// The re-send limits of people life-cycle spec *Security → Rate limits* (gap c5; #303): per account 3 in 5 minutes,
// per administrator 20 in an hour, through the platform `rateLimiterService` (failing open, as the platform default;
// the command still refuses an account that is not invited). Pure: the route resolves the limiter and consumes.

export type AccountLimit = {
  config: { points: number; duration: number; keyPrefix: string }
  key: string
}

export const RESEND_PER_ACCOUNT = { points: 3, duration: 300, keyPrefix: 'people_resend_invitation' } as const
export const RESEND_PER_ACTOR = { points: 20, duration: 3600, keyPrefix: 'people_resend_invitation_actor' } as const

/** The two limits of one re-send, the account's first. */
export function resendLimits(input: { tenantId: string; personId: string; actorUserId: string }): AccountLimit[] {
  return [
    { config: { ...RESEND_PER_ACCOUNT }, key: `${input.tenantId}:${input.personId}` },
    { config: { ...RESEND_PER_ACTOR }, key: `${input.tenantId}:${input.actorUserId}` },
  ]
}

/** Departure requests per member: 5 in 24 hours (people life-cycle spec *Rate limits*; #306). */
export const DEPARTURE_REQUESTS_PER_MEMBER = {
  points: 5,
  duration: 86400,
  keyPrefix: 'people_departure_request',
} as const

/** The limit of one member's departure request. */
export function departureRequestLimits(input: { tenantId: string; callerPersonId: string }): AccountLimit[] {
  return [{ config: { ...DEPARTURE_REQUESTS_PER_MEMBER }, key: `${input.tenantId}:${input.callerPersonId}` }]
}

/**
 * True when an integration run asks for real limits on this request: the platform's opt-in for auth limits
 * (`OM_TEST_MODE=1`, `OM_TEST_AUTH_RATE_LIMIT_MODE=opt-in`, header `x-om-test-rate-limit: on`). Integration runs
 * otherwise switch the platform limiter off (`OM_INTEGRATION_TEST`).
 */
export function testLimiterRequested(
  env: Readonly<Record<string, string | undefined>>,
  header: string | null | undefined,
): boolean {
  return env.OM_TEST_MODE === '1' && env.OM_TEST_AUTH_RATE_LIMIT_MODE === 'opt-in' && header === 'on'
}

/** Whole minutes to wait, at least 1, for a `Retry-After` in seconds ("try again in N minutes"). */
export function retryAfterMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 1
  return Math.max(1, Math.ceil(seconds / 60))
}
