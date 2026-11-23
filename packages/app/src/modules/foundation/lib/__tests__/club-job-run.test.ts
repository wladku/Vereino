// Sweep pass and claimed run orchestration (many-clubs spec DD-M04, BR-M2; #629): batches until a short one, one
// club's failed enqueue or failed run never stops another, a stale claim is skipped, and the stored error is a code.
import { describe, expect, it } from '@jest/globals'
import {
  CLUB_JOB_CLAIM_KEY,
  clubJobErrorCode,
  parseClubJobClaim,
  runClaimedClubJob,
  serializeClubJobClaim,
  sweepClubJobs,
} from '../club-job-run'

describe('the claim in the queue payload', () => {
  it('round-trips through JSON to the same instants', () => {
    const claim = { dueAt: new Date('2026-06-10T04:07:00.123Z'), leaseUntil: new Date('2026-06-10T04:12:00.456Z') }
    const payload: unknown = JSON.parse(JSON.stringify({ [CLUB_JOB_CLAIM_KEY]: serializeClubJobClaim(claim) }))
    expect(parseClubJobClaim(payload)).toEqual(claim)
  })

  it('is null without a claim or with a malformed one', () => {
    for (const payload of [
      null,
      'x',
      {},
      { clubJob: 'x' },
      { clubJob: { dueAt: 1, leaseUntil: '2026-06-10T00:00:00Z' } },
      { clubJob: { dueAt: '2026-06-10T00:00:00Z', leaseUntil: 'soon' } },
    ]) {
      expect(parseClubJobClaim(payload)).toBeNull()
    }
  })
})

describe('clubJobErrorCode', () => {
  it('keeps a short identifier code and never the message', () => {
    expect(
      clubJobErrorCode(Object.assign(new Error('Jan Kowalski has no e-mail'), { code: 'payments.no_payer' })),
    ).toBe('payments.no_payer')
    expect(clubJobErrorCode(new Error('Jan Kowalski'))).toBe('failed')
    expect(clubJobErrorCode({ code: 'has spaces in it' })).toBe('failed')
    expect(clubJobErrorCode({ code: 42 })).toBe('failed')
    expect(clubJobErrorCode('boom')).toBe('failed')
    expect(clubJobErrorCode(null)).toBe('failed')
  })
})

describe('sweepClubJobs', () => {
  it('claims batch after batch until a short batch and enqueues every club', async () => {
    const batches = [['a', 'b'], ['c', 'd'], ['e']]
    const enqueued: string[] = []
    const outcome = await sweepClubJobs(
      {
        claim: () => Promise.resolve(batches.shift() ?? []),
        enqueue: (row) => {
          enqueued.push(row)
          return Promise.resolve()
        },
        onEnqueueError: () => {
          throw new Error('unexpected')
        },
      },
      { batchSize: 2, maxPasses: 10 },
    )
    expect(outcome).toEqual({ passes: 3, claimed: 5, enqueued: ['a', 'b', 'c', 'd', 'e'], failed: [] })
    expect(enqueued).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('goes on with the other clubs when one enqueue fails, and stops after maxPasses', async () => {
    const reported: string[] = []
    const outcome = await sweepClubJobs(
      {
        claim: () => Promise.resolve(['a', 'b']),
        enqueue: (row) => (row === 'a' ? Promise.reject(new Error('queue down')) : Promise.resolve()),
        onEnqueueError: (row) => reported.push(row),
      },
      { batchSize: 2, maxPasses: 2 },
    )
    expect(outcome).toEqual({ passes: 2, claimed: 4, enqueued: ['b', 'b'], failed: ['a', 'a'] })
    expect(reported).toEqual(['a', 'a'])
  })
})

describe('runClaimedClubJob', () => {
  function recorder(options: { start: boolean; fails?: boolean }) {
    const calls: string[] = []
    return {
      calls,
      deps: {
        start: () => {
          calls.push('start')
          return Promise.resolve(options.start)
        },
        run: () => {
          calls.push('run')
          return options.fails ? Promise.reject(new Error('boom')) : Promise.resolve({ nextDueAt: null })
        },
        finish: () => {
          calls.push('finish')
          return Promise.resolve()
        },
        fail: () => {
          calls.push('fail')
          return Promise.resolve()
        },
      },
    }
  }

  it('skips a run whose claim no longer holds', async () => {
    const { calls, deps } = recorder({ start: false })
    expect(await runClaimedClubJob(deps)).toBe('skipped')
    expect(calls).toEqual(['start'])
  })

  it('finishes a successful run', async () => {
    const { calls, deps } = recorder({ start: true })
    expect(await runClaimedClubJob(deps)).toBe('finished')
    expect(calls).toEqual(['start', 'run', 'finish'])
  })

  it('records a failed run without throwing', async () => {
    const { calls, deps } = recorder({ start: true, fails: true })
    expect(await runClaimedClubJob(deps)).toBe('failed')
    expect(calls).toEqual(['start', 'run', 'fail'])
  })
})
