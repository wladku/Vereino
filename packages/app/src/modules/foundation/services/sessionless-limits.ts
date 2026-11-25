// The limiter of the sessionless routes (engineering standards S8.6; #738). Three callers:
//   - the API dispatcher (`src/app/api/[...slug]/route.ts`, local patch) and the server path of public pages
//     (`public-route-load.ts`) resolve the limiter here for each route's per-client `metadata.rateLimit`;
//   - route handlers count their per-subject layers (`lib/sessionless-limits.ts`: per token, per address in a club)
//     through `enforceSessionlessLimits`, or `sessionlessSubjectAllowed` where the answer must stay a uniform 202;
//   - the sign-in and password-reset routes (`src/app/api/auth/**`) count the per-account layer before the platform
//     handler.
// The platform limiter fails open; a request it could not count is logged as a warning, so the digest shows it. A
// refusal answers 429 with `Retry-After` and is logged with the limiter key prefix only — never the client address,
// the token or the e-mail address. An integration run that opts in (`testLimiterRequested`) gets a process-local
// enabled memory limiter, because `OM_INTEGRATION_TEST` switches the platform one off.
import type { RateLimiterService } from '@open-mercato/shared/lib/ratelimit/service'
import { createLogger } from '@open-mercato/shared/lib/logger'
import {
  accountEmailLimit,
  emailFromBody,
  emailFromUrlEncoded,
  forwardedEntryCount,
  retryAfterSeconds,
  testLimiterRequested,
  type PASSWORD_RESET_EMAIL_LIMIT,
  type SIGN_IN_EMAIL_LIMIT,
  type SessionlessLimit,
} from '../lib/sessionless-limits'

const logger = createLogger('foundation').child({ component: 'sessionless-limits' })

let testLimiter: RateLimiterService | null = null
const reportedForwardedCounts = new Set<number>()

type HeaderSource = { headers: Pick<Headers, 'get'> }

/** The limiter for this request: the test opt-in limiter, else the platform one (null when it is not available). */
export async function sessionlessRateLimiter(request: HeaderSource): Promise<RateLimiterService | null> {
  if (testLimiterRequested(process.env, request.headers.get('x-om-test-rate-limit'))) {
    if (!testLimiter) {
      const { RateLimiterService: Limiter } = await import('@open-mercato/shared/lib/ratelimit/service')
      testLimiter = new Limiter({ enabled: true, strategy: 'memory', keyPrefix: 'vereino-test', trustProxyDepth: 0 })
    }
    return testLimiter
  }
  const { getCachedRateLimiterService } = await import('@open-mercato/core/bootstrap')
  return getCachedRateLimiterService()
}

/**
 * Logs once per process and `X-Forwarded-For` length when the client address could not be resolved while the request
 * came through a proxy: every such client then shares one counter (`RATE_LIMIT_TRUST_PROXY_DEPTH` is 0 or too deep).
 * The entry count is the measurement `docs/ops/deploy.md` uses to set the depth; no address is logged.
 */
export function noteClientAddress(request: HeaderSource, clientIp: string | null, trustProxyDepth: number): void {
  if (clientIp !== null) return
  const forwardedEntries = forwardedEntryCount(request.headers.get('x-forwarded-for'))
  if (forwardedEntries === 0 || reportedForwardedCounts.has(forwardedEntries)) return
  reportedForwardedCounts.add(forwardedEntries)
  logger.warn('Client address unresolved behind a proxy; every client shares one rate-limit counter', {
    forwardedEntries,
    realIpHeader: request.headers.get('x-real-ip') !== null,
    trustProxyDepth,
  })
}

type LayerOutcome =
  { allowed: true } | { allowed: false; retryAfter: number; limit: SessionlessLimit; remaining: number }

async function consumeLayers(request: HeaderSource, limits: readonly SessionlessLimit[]): Promise<LayerOutcome> {
  const limiter = await sessionlessRateLimiter(request)
  if (!limiter) return { allowed: true }
  for (const limit of limits) {
    const result = await limiter.consume(limit.key, limit.config)
    if (result.degraded) {
      logger.warn('Rate limiter unavailable; the request was allowed uncounted', { keyPrefix: limit.config.keyPrefix })
      continue
    }
    if (!result.allowed) {
      logger.info('Sessionless request over its rate limit', { keyPrefix: limit.config.keyPrefix })
      return {
        allowed: false,
        retryAfter: retryAfterSeconds(result.msBeforeNext),
        limit,
        remaining: result.remainingPoints,
      }
    }
  }
  return { allowed: true }
}

/** Counts `limits` in order; a 429 with `Retry-After` for the first one spent, else null. */
export async function enforceSessionlessLimits(
  request: HeaderSource,
  limits: readonly SessionlessLimit[],
): Promise<Response | null> {
  const outcome = await consumeLayers(request, limits)
  if (outcome.allowed) return null
  const { resolveTranslations } = await import('@open-mercato/shared/lib/i18n/server')
  const { RATE_LIMIT_ERROR_KEY, RATE_LIMIT_ERROR_FALLBACK } = await import('@open-mercato/shared/lib/ratelimit/helpers')
  const { translate } = await resolveTranslations()
  return Response.json(
    { error: translate(RATE_LIMIT_ERROR_KEY, RATE_LIMIT_ERROR_FALLBACK) },
    {
      status: 429,
      headers: {
        'Retry-After': String(outcome.retryAfter),
        'X-RateLimit-Limit': String(outcome.limit.config.points),
        'X-RateLimit-Remaining': String(outcome.remaining),
        'X-RateLimit-Reset': String(outcome.retryAfter),
        'Cache-Control': 'no-store',
      },
    },
  )
}

/**
 * Counts `limit` for a request whose answer must not change (a uniform 202 that tells nobody whether an address is
 * known): false when the limit is spent, so the caller skips the work silently.
 */
export async function sessionlessSubjectAllowed(request: HeaderSource, limit: SessionlessLimit): Promise<boolean> {
  return (await consumeLayers(request, [limit])).allowed
}

async function emailFromForm(request: Request): Promise<string | null> {
  try {
    const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (type === 'application/x-www-form-urlencoded') {
      return emailFromUrlEncoded(await request.text())
    }
    if (type === 'application/json') return emailFromBody(await request.json())
    const form = await request.formData()
    return emailFromBody({ email: form.get('email') })
  } catch {
    return null
  }
}

/**
 * Runs a platform sign-in or password-reset handler behind the per-account limit (`SIGN_IN_EMAIL_LIMIT`,
 * `PASSWORD_RESET_EMAIL_LIMIT`): the address is read from a copy of the body, so the handler still reads the original.
 * With `resetOnSuccess` a successful answer clears the account's counter, as the platform does with its own.
 */
export async function withAccountEmailLimit(
  request: Request,
  config: typeof SIGN_IN_EMAIL_LIMIT | typeof PASSWORD_RESET_EMAIL_LIMIT,
  handler: (request: Request) => Promise<Response>,
  options: { resetOnSuccess?: boolean } = {},
): Promise<Response> {
  const email = await emailFromForm(request.clone())
  if (email === null) return handler(request)
  const limit = accountEmailLimit(config, email)
  const limited = await enforceSessionlessLimits(request, [limit])
  if (limited) return limited
  const response = await handler(request)
  if (options.resetOnSuccess && response.ok) {
    try {
      await (await sessionlessRateLimiter(request))?.delete(limit.key, limit.config)
    } catch (error: unknown) {
      logger.warn('Could not clear an account rate-limit counter', { keyPrefix: limit.config.keyPrefix, err: error })
    }
  }
  return response
}
