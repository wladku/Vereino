// Worker heartbeat (E18-S04 #465, S15.5): the ping is sent only with a URL, at most once per interval, and a refused
// or unreachable monitor never throws into the worker.
import { describe, expect, it } from '@jest/globals'
import {
  WORKER_HEARTBEAT_MIN_INTERVAL_MS,
  createWorkerHeartbeat,
  heartbeatDue,
  type HeartbeatFetch,
} from '../worker-heartbeat'

function recordingFetch(result: { ok: boolean } | Error = { ok: true }) {
  const calls: Array<{ url: string; method: string; signal: AbortSignal }> = []
  const fetchImpl: HeartbeatFetch = (url, init) => {
    calls.push({ url, method: init.method, signal: init.signal })
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
  }
  return { calls, fetchImpl }
}

describe('heartbeatDue', () => {
  it('is due before the first attempt and once the interval has passed', () => {
    expect(heartbeatDue(null, 0, 60_000)).toBe(true)
    expect(heartbeatDue(1_000, 60_999, 60_000)).toBe(false)
    expect(heartbeatDue(1_000, 61_000, 60_000)).toBe(true)
  })
})

describe('createWorkerHeartbeat', () => {
  it('pings the trimmed URL with a GET and a timeout signal', async () => {
    const { calls, fetchImpl } = recordingFetch()
    const heartbeat = createWorkerHeartbeat({ url: ' https://hc.example/ping/w ', fetchImpl, now: () => 5 })
    await expect(heartbeat.beat()).resolves.toBe('sent')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://hc.example/ping/w')
    expect(calls[0].method).toBe('GET')
    expect(calls[0].signal).toBeInstanceOf(AbortSignal)
  })

  it('throttles to one attempt per interval, failed attempts included', async () => {
    let clock = 0
    const { calls, fetchImpl } = recordingFetch({ ok: false })
    const heartbeat = createWorkerHeartbeat({ url: 'https://hc.example/w', fetchImpl, now: () => clock })
    await expect(heartbeat.beat()).resolves.toBe('failed')
    clock = WORKER_HEARTBEAT_MIN_INTERVAL_MS - 1
    await expect(heartbeat.beat()).resolves.toBe('skipped')
    clock = WORKER_HEARTBEAT_MIN_INTERVAL_MS
    await expect(heartbeat.beat()).resolves.toBe('failed')
    expect(calls).toHaveLength(2)
  })

  it('reports an unreachable monitor as failed instead of throwing', async () => {
    const { fetchImpl } = recordingFetch(new Error('ECONNREFUSED'))
    const heartbeat = createWorkerHeartbeat({ url: 'https://hc.example/w', fetchImpl, minIntervalMs: 0, timeoutMs: 10 })
    await expect(heartbeat.beat()).resolves.toBe('failed')
  })

  it('sends nothing without a URL', async () => {
    const { calls, fetchImpl } = recordingFetch()
    await expect(createWorkerHeartbeat({ url: undefined, fetchImpl }).beat()).resolves.toBe('skipped')
    await expect(createWorkerHeartbeat({ url: '  ', fetchImpl }).beat()).resolves.toBe('skipped')
    expect(calls).toHaveLength(0)
  })

  it('defaults to the global fetch and clock', async () => {
    const original = globalThis.fetch
    const seen: string[] = []
    globalThis.fetch = ((input: string) => {
      seen.push(input)
      return Promise.resolve({ ok: true })
    }) as unknown as typeof fetch
    try {
      await expect(createWorkerHeartbeat({ url: 'https://hc.example/default' }).beat()).resolves.toBe('sent')
    } finally {
      globalThis.fetch = original
    }
    expect(seen).toEqual(['https://hc.example/default'])
  })
})
