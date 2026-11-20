// Worker heartbeat (engineering standards S15.4/S15.5, E18-S04 #465): the worker has no HTTP endpoint the uptime
// monitor could probe, so after a successful `foundation:dispatch-sweep` — which the scheduler starts every 2 minutes
// for every club, through the queue and the worker, and which reads PostgreSQL — the worker pings the heartbeat check
// named by `VEREINO_OPS_WORKER_HEARTBEAT_URL` (`docs/ops/monitoring.md`). A missing ping is the alert: scheduler, queue,
// worker or database stopped. The ping is throttled per process, so many clubs do not multiply the requests, carries
// no payload and never throws; without the variable nothing is sent.

/** The variable naming the heartbeat check URL (a push or "cron job" monitor of the uptime vendor). */
export const WORKER_HEARTBEAT_URL_VARIABLE = 'VEREINO_OPS_WORKER_HEARTBEAT_URL'
/** At most one ping per this interval and process; the monitor's period is longer (`docs/ops/monitoring.md`). */
export const WORKER_HEARTBEAT_MIN_INTERVAL_MS = 60_000
export const WORKER_HEARTBEAT_TIMEOUT_MS = 5_000

export type HeartbeatFetch = (url: string, init: { method: 'GET'; signal: AbortSignal }) => Promise<{ ok: boolean }>

export type WorkerHeartbeatOptions = {
  url: string | undefined
  fetchImpl?: HeartbeatFetch
  now?: () => number
  minIntervalMs?: number
  timeoutMs?: number
}

/** `skipped`: no URL or throttled; `sent`: the monitor accepted it; `failed`: refused or unreachable. */
export type HeartbeatOutcome = 'skipped' | 'sent' | 'failed'

export type WorkerHeartbeat = { beat(): Promise<HeartbeatOutcome> }

/** Whether a ping is due: never sent, or the last attempt is at least `minIntervalMs` old. */
export function heartbeatDue(lastAttemptAt: number | null, now: number, minIntervalMs: number): boolean {
  return lastAttemptAt === null || now - lastAttemptAt >= minIntervalMs
}

export function createWorkerHeartbeat({
  url,
  fetchImpl = fetch,
  now = Date.now,
  minIntervalMs = WORKER_HEARTBEAT_MIN_INTERVAL_MS,
  timeoutMs = WORKER_HEARTBEAT_TIMEOUT_MS,
}: WorkerHeartbeatOptions): WorkerHeartbeat {
  const target = url?.trim() ?? ''
  let lastAttemptAt: number | null = null
  return {
    async beat() {
      const at = now()
      if (!target || !heartbeatDue(lastAttemptAt, at, minIntervalMs)) return 'skipped'
      lastAttemptAt = at
      try {
        const response = await fetchImpl(target, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) })
        return response.ok ? 'sent' : 'failed'
      } catch {
        return 'failed'
      }
    },
  }
}
