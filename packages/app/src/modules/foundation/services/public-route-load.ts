// The server side of a sessionless public page (#487): the page reads its data through the module's own public API
// handler, in process, so the HTML a guest (or a link preview, or a search engine) receives already holds the page's
// content without JavaScript, and the public API stays the single data source. The handler's rate limit applies to
// the page as it does to the API (same configuration, same key prefix, same client IP), so the server path is no way
// around it. Anything unexpected — the limit spent, a failed read — answers null, and the page falls back to the
// client fetch it always had.
import type { RateLimitConfig } from '@open-mercato/shared/lib/ratelimit/types'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { noteClientAddress, sessionlessRateLimiter } from './sessionless-limits'

const logger = createLogger('foundation').child({ component: 'public-route-load' })

/** A public API handler: `GET(request, { params })` as the API dispatcher calls it. */
export type PublicRouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) => Promise<Response>

export type PublicRouteLoadInput = {
  handler: PublicRouteHandler
  /** The API path with its query (`/api/club_core/public/{clubSlug}/events?section=…`), as the browser would call it. */
  path: string
  /** The route parameters the dispatcher would pass. */
  params: Record<string, string>
  /** The handler's `metadata.GET.rateLimit`. */
  rateLimit?: RateLimitConfig
}

/** The handler's answer: the HTTP status and the parsed JSON body (null when the body is not JSON). */
export type PublicRouteAnswer = { ok: boolean; status: number; body: unknown }

async function rateLimited(rateLimit: RateLimitConfig | undefined): Promise<boolean> {
  if (!rateLimit) return false
  const { headers } = await import('next/headers')
  const request = { headers: await headers() } as unknown as Request
  const service = await sessionlessRateLimiter(request)
  if (!service) return false
  const { getClientIp, RATE_LIMIT_FALLBACK_KEY } = await import('@open-mercato/shared/lib/ratelimit/helpers')
  const clientIp = getClientIp(request, service.trustProxyDepth)
  noteClientAddress(request, clientIp, service.trustProxyDepth)
  const result = await service.consume(clientIp ?? RATE_LIMIT_FALLBACK_KEY, rateLimit)
  return !result.allowed
}

/** Runs a public API handler for a server-rendered page; null when the page should fetch on the client instead. */
export async function loadPublicRoute(input: PublicRouteLoadInput): Promise<PublicRouteAnswer | null> {
  try {
    if (await rateLimited(input.rateLimit)) return null
    const response = await input.handler(new Request(new URL(input.path, 'http://localhost')), {
      params: Promise.resolve(input.params),
    })
    const body: unknown = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, body }
  } catch (error: unknown) {
    logger.warn('Server read of a public page failed; the page loads on the client', { path: input.path, err: error })
    return null
  }
}
