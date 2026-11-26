// The round of one sweep run (many-clubs spec *Observability*; #852): the payload round-trips, a malformed one is
// refused, and the round waits while a run of this sweep is unfinished, then counts the failing clubs once.
import { describe, expect, it } from '@jest/globals'
import {
  ROUND_MAX_CLUBS,
  clubJobRoundDeadline,
  judgeClubJobRound,
  parseClubJobRound,
  serializeClubJobRound,
  type ClubJobRound,
  type ClubJobRunState,
} from '../club-job-round'

const A = { tenantId: '11111111-1111-4111-8111-111111111111', organizationId: '22222222-2222-4222-8222-222222222222' }
const B = { tenantId: '33333333-3333-4333-8333-333333333333', organizationId: '44444444-4444-4444-8444-444444444444' }
const ENQUEUED = new Date('2026-11-27T02:05:00.000Z')
const DEADLINE = new Date('2026-11-27T02:40:00.000Z')

function round(overrides: Partial<ClubJobRound> = {}): ClubJobRound {
  return { jobKey: 'payments:verify-invariants', enqueuedAt: ENQUEUED, deadline: DEADLINE, clubs: [A, B], enqueueFailed: 0, ...overrides }
}

function finishedAt(at: string, lastError: string | null = null): ClubJobRunState {
  return { leaseUntil: null, lastFinishedAt: new Date(at), lastError }
}

describe('clubJobRoundDeadline', () => {
  it('adds the enqueue lease and the run lease to the enqueue time', () => {
    expect(clubJobRoundDeadline(ENQUEUED, 5 * 60_000, 30 * 60_000)).toEqual(DEADLINE)
  })
})

describe('the round in the queue payload', () => {
  it('round-trips through JSON', () => {
    const payload: unknown = JSON.parse(JSON.stringify(serializeClubJobRound(round({ enqueueFailed: 2 }))))
    expect(parseClubJobRound(payload)).toEqual(round({ enqueueFailed: 2 }))
  })

  it('is null for anything malformed', () => {
    const good = serializeClubJobRound(round())
    for (const payload of [
      null,
      'x',
      { ...good, jobKey: 7 },
      { ...good, jobKey: '' },
      { ...good, jobKey: 'x'.repeat(201) },
      { ...good, enqueuedAt: 'soon' },
      { ...good, deadline: undefined },
      { ...good, enqueueFailed: -1 },
      { ...good, enqueueFailed: 1.5 },
      { ...good, clubs: 'all' },
      { ...good, clubs: Array.from({ length: ROUND_MAX_CLUBS + 1 }, () => [A.tenantId, A.organizationId]) },
      { ...good, clubs: [[A.tenantId]] },
      { ...good, clubs: [{ tenantId: A.tenantId, organizationId: A.organizationId }] },
      { ...good, clubs: [[A.tenantId, 7]] },
      { ...good, clubs: [[A.tenantId, 'not-a-uuid']] },
    ]) {
      expect(parseClubJobRound(payload)).toBeNull()
    }
  })
})

describe('judgeClubJobRound', () => {
  const now = new Date('2026-11-27T02:10:00.000Z')

  it('counts once every run finished: clean runs pass, an error or problem code fails', () => {
    expect(
      judgeClubJobRound(round(), [finishedAt('2026-11-27T02:06:00Z'), finishedAt('2026-11-27T02:07:00Z')], now),
    ).toEqual({ done: true, outcome: { jobKey: 'payments:verify-invariants', clubs: 2, failing: 0, unfinished: 0 } })
    expect(
      judgeClubJobRound(
        round({ enqueueFailed: 1 }),
        [finishedAt('2026-11-27T02:06:00Z', 'payments.invariants.drift'), finishedAt('2026-11-27T02:07:00Z')],
        now,
      ),
    ).toEqual({ done: true, outcome: { jobKey: 'payments:verify-invariants', clubs: 3, failing: 2, unfinished: 0 } })
  })

  it('waits for a run not finished since the enqueue, never finished, or still leased', () => {
    const lastNight = finishedAt('2026-11-26T02:06:00Z', 'payments.invariants.drift')
    const leased: ClubJobRunState = {
      leaseUntil: new Date('2026-11-27T02:35:00Z'),
      lastFinishedAt: new Date('2026-11-27T02:06:00Z'),
      lastError: null,
    }
    const never: ClubJobRunState = { leaseUntil: null, lastFinishedAt: null, lastError: null }
    for (const state of [lastNight, leased, never]) {
      expect(judgeClubJobRound(round(), [finishedAt('2026-11-27T02:06:00Z'), state], now)).toEqual({ done: false })
    }
  })

  it('treats an expired lease after a finish as finished', () => {
    const expired: ClubJobRunState = {
      leaseUntil: new Date('2026-11-27T02:09:00Z'),
      lastFinishedAt: new Date('2026-11-27T02:06:00Z'),
      lastError: null,
    }
    expect(judgeClubJobRound(round({ clubs: [A] }), [expired], now)).toMatchObject({ done: true })
  })

  it('stops waiting at the deadline and counts the unfinished runs as failing', () => {
    const never: ClubJobRunState = { leaseUntil: null, lastFinishedAt: null, lastError: null }
    expect(judgeClubJobRound(round(), [finishedAt('2026-11-27T02:06:00Z'), never], DEADLINE)).toEqual({
      done: true,
      outcome: { jobKey: 'payments:verify-invariants', clubs: 2, failing: 1, unfinished: 1 },
    })
  })

  it('leaves out a club whose row is gone', () => {
    expect(judgeClubJobRound(round(), [null, finishedAt('2026-11-27T02:07:00Z')], now)).toEqual({
      done: true,
      outcome: { jobKey: 'payments:verify-invariants', clubs: 1, failing: 0, unfinished: 0 },
    })
  })
})
