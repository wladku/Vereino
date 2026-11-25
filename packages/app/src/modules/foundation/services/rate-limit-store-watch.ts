// Puts an outage of the rate limiter's Redis store in the logs (#738). The platform limiter (`redis` strategy) falls
// back to per-process memory counters when Redis does not answer and says nothing, so limits silently become per
// instance and reset on deploy. This watch keeps one connection to the same store and logs a warning when it is lost
// and an info line when it is back; it never touches the counters. Started once per app process from
// `src/instrumentation.ts` (local patch).
import { createLogger } from '@open-mercato/shared/lib/logger'
import { rateLimitStoreWatched } from '../lib/sessionless-limits'

const logger = createLogger('foundation').child({ component: 'rate-limit-store-watch' })
const STARTED = '__vereinoRateLimitStoreWatch__'

export async function watchRateLimitStore(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  const holder = globalThis as Record<string, unknown>
  if (holder[STARTED] || !rateLimitStoreWatched(env)) return
  holder[STARTED] = true
  const [{ default: Redis }, { parseRedisUrl }] = await Promise.all([
    import('ioredis'),
    import('@open-mercato/shared/lib/redis/connection'),
  ])
  let down = false
  const client = new Redis({
    ...parseRedisUrl(env.REDIS_URL ?? ''),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  })
  client.on('error', (error: Error & { code?: string }) => {
    if (down) return
    down = true
    logger.warn('Rate limiter store unreachable; limits count per process and reset on restart', {
      code: error.code ?? error.name,
    })
  })
  client.on('ready', () => {
    if (!down) return
    down = false
    logger.info('Rate limiter store reachable again')
  })
}
