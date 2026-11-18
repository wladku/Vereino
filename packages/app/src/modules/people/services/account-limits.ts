// Consumes the re-send limits (`lib/account-limits.ts`) before `people.persons.resend_invitation` runs and the member's
// departure-request limit before `people.departure_requests.file` (people life-cycle spec *Security → Rate limits*;
// #303, #306). The platform `rateLimiterService` counts them; it fails open when
// absent or degraded. An integration run that opts in (`testLimiterRequested`) gets a process-local enabled memory
// limiter, because `OM_INTEGRATION_TEST` switches the platform one off. A refusal is 429 with `Retry-After` and
// `retryAfterSeconds`, which the Account tab turns into "try again in N minutes".
import type { AwilixContainer } from 'awilix'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { RateLimiterService } from '@open-mercato/shared/lib/ratelimit/service'
import { departureRequestLimits, resendLimits, testLimiterRequested, type AccountLimit } from '../lib/account-limits'

let testLimiter: RateLimiterService | null = null

function limiterFor(container: AwilixContainer, request: Request): RateLimiterService | null {
  if (testLimiterRequested(process.env, request.headers.get('x-om-test-rate-limit'))) {
    testLimiter ??= new RateLimiterService({
      enabled: true,
      strategy: 'memory',
      keyPrefix: 'vereino-test',
      trustProxyDepth: 0,
    })
    return testLimiter
  }
  return container.hasRegistration('rateLimiterService')
    ? container.resolve<RateLimiterService>('rateLimiterService')
    : null
}

/** Consumes `limits` in order; null when all allow, otherwise the 429 response with `message`. */
async function consumeLimits(
  container: AwilixContainer,
  request: Request,
  limits: readonly AccountLimit[],
  message: { key: string; fallback: string },
): Promise<Response | null> {
  const limiter = limiterFor(container, request)
  if (!limiter) return null
  for (const limit of limits) {
    const result = await limiter.consume(limit.key, limit.config)
    if (result.allowed) continue
    const retryAfterSeconds = Math.max(1, Math.ceil(result.msBeforeNext / 1000))
    const { translate } = await resolveTranslations()
    return Response.json(
      { error: translate(message.key, message.fallback), code: 'rate_limited', retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    )
  }
  return null
}

/** Null when the re-send may go on; otherwise the 429 response. */
export function limitResend(
  container: AwilixContainer,
  request: Request,
  input: { tenantId: string; personId: string; actorUserId: string },
): Promise<Response | null> {
  return consumeLimits(container, request, resendLimits(input), {
    key: 'people.errors.invitation_rate_limited',
    fallback: 'Too many invitations sent. Try again later.',
  })
}

/** Null when the member may file a departure request (5 in 24 hours, #306); otherwise the 429 response. */
export function limitDepartureRequest(
  container: AwilixContainer,
  request: Request,
  input: { tenantId: string; callerPersonId: string },
): Promise<Response | null> {
  return consumeLimits(container, request, departureRequestLimits(input), {
    key: 'people.errors.departure_request_rate_limited',
    fallback: 'Too many requests to leave the club. Try again later.',
  })
}
