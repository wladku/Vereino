// Due times of per-club jobs (many-clubs spec DD-M05, DD-M06, BR-M3; #629): local `HH:MM` plus a stable 0–20 minute
// offset, once per local day across both daylight-saving changes, stable offsets for interval jobs, the DD-M06 cap
// on a worker's own next due time, the failure retry and the per-club scheduler spec of the rollback.
import { describe, expect, it } from '@jest/globals'
import {
  DAILY_SPREAD_MS,
  DEFAULT_JOB_TIMEOUT_MINUTES,
  FAILURE_RETRY_MS,
  INTERVAL_MAX_DELAY_MS,
  assertClubJobDeclaration,
  clubJobOffsetMs,
  clubJobQueue,
  dueAfterFailure,
  dueAfterRun,
  latestClubJobDue,
  nextClubJobDue,
  parseClubJobKey,
  perClubScheduleSpec,
  runLeaseMs,
} from '../club-job-due'

const ORG_A = '6f1c2d3e-0000-4000-8000-00000000000a'
const ORG_B = '6f1c2d3e-0000-4000-8000-00000000000b'
const WARSAW = 'Europe/Warsaw'
const NEW_YORK = 'America/New_York'
const MINUTE = 60_000

const at = (iso: string) => new Date(iso)
const offsetOf = (organizationId: string) => clubJobOffsetMs(organizationId, DAILY_SPREAD_MS)

describe('parseClubJobKey and clubJobQueue', () => {
  it('splits a worker id into module and name and derives the queue', () => {
    expect(parseClubJobKey('payments:generate-charges')).toEqual({ module: 'payments', name: 'generate-charges' })
    expect(clubJobQueue('club_core:x1-y')).toBe('club_core-x1-y')
  })

  it('rejects anything that is not <module>:<name>', () => {
    for (const key of ['payments', 'Payments:x', 'payments:Generate', 'payments:a--b', ':x', 'a:b:c']) {
      expect(() => parseClubJobKey(key)).toThrow(RangeError)
    }
  })
})

describe('assertClubJobDeclaration', () => {
  it('accepts daily and interval declarations with or without a timeout', () => {
    expect(() =>
      assertClubJobDeclaration({ key: 'a:b', schedule: { dailyAt: '06:00' }, description: 'x' }),
    ).not.toThrow()
    expect(() =>
      assertClubJobDeclaration({ key: 'a:b', schedule: { everyMinutes: 15 }, description: 'x', timeoutMinutes: 5 }),
    ).not.toThrow()
  })

  it('rejects a bad key, time, interval or timeout', () => {
    const cases = [
      { key: 'bad', schedule: { dailyAt: '06:00' } },
      { key: 'a:b', schedule: { dailyAt: '6:00' } },
      { key: 'a:b', schedule: { everyMinutes: 0 } },
      { key: 'a:b', schedule: { everyMinutes: 1.5 } },
      { key: 'a:b', schedule: { everyMinutes: 15 }, timeoutMinutes: 0 },
      { key: 'a:b', schedule: { everyMinutes: 15 }, timeoutMinutes: 2.5 },
    ]
    for (const declaration of cases) {
      expect(() => assertClubJobDeclaration({ description: 'x', ...declaration })).toThrow(RangeError)
    }
  })
})

describe('clubJobOffsetMs', () => {
  it('is stable per organization and inside the window', () => {
    expect(offsetOf(ORG_A)).toBe(offsetOf(ORG_A))
    for (const org of [ORG_A, ORG_B]) {
      expect(offsetOf(org)).toBeGreaterThanOrEqual(0)
      expect(offsetOf(org)).toBeLessThan(DAILY_SPREAD_MS)
    }
    expect(offsetOf(ORG_A)).not.toBe(offsetOf(ORG_B))
  })
})

describe('nextClubJobDue: time-of-day jobs', () => {
  const daily = { dailyAt: '06:00' }

  it('runs at the local time plus the offset, in each club zone', () => {
    const now = at('2026-06-10T00:00:00Z')
    expect(nextClubJobDue(daily, { now, timeZone: WARSAW, organizationId: ORG_A }).getTime()).toBe(
      at('2026-06-10T04:00:00Z').getTime() + offsetOf(ORG_A),
    )
    expect(nextClubJobDue(daily, { now, timeZone: NEW_YORK, organizationId: ORG_B }).getTime()).toBe(
      at('2026-06-10T10:00:00Z').getTime() + offsetOf(ORG_B),
    )
  })

  it("moves to the next local day once today's run has passed, and never returns now itself", () => {
    const due = nextClubJobDue(daily, { now: at('2026-06-10T00:00:00Z'), timeZone: WARSAW, organizationId: ORG_A })
    const next = nextClubJobDue(daily, { now: due, timeZone: WARSAW, organizationId: ORG_A })
    expect(next.getTime() - due.getTime()).toBe(24 * 60 * MINUTE)
  })

  it("takes yesterday's run when its offset carries it past local midnight", () => {
    const late = { dailyAt: '23:59' }
    const offset = offsetOf(ORG_A)
    expect(offset).toBeGreaterThan(MINUTE)
    // 23:59 local on 9 June + offset lies on 10 June local; a sweep just after local midnight still finds it.
    const due = at('2026-06-09T21:59:00Z').getTime() + offset
    const now = at('2026-06-09T22:00:30Z')
    expect(nextClubJobDue(late, { now, timeZone: WARSAW, organizationId: ORG_A }).getTime()).toBe(due)
  })

  it('runs once on the spring-forward day: a time in the gap moves after the gap', () => {
    // Europe/Warsaw, 29 March 2026: 02:00 → 03:00. The 02:00 job runs at 03:00 local (01:00 UTC) plus the offset.
    const twoAm = { dailyAt: '02:00' }
    const before = nextClubJobDue(twoAm, { now: at('2026-03-28T23:00:00Z'), timeZone: WARSAW, organizationId: ORG_A })
    expect(before.getTime()).toBe(at('2026-03-29T01:00:00Z').getTime() + offsetOf(ORG_A))
    const after = nextClubJobDue(twoAm, { now: before, timeZone: WARSAW, organizationId: ORG_A })
    expect(after.getTime()).toBe(at('2026-03-30T00:00:00Z').getTime() + offsetOf(ORG_A))
  })

  it('runs once on the fall-back day: a repeated time takes its first occurrence', () => {
    // Europe/Warsaw, 25 October 2026: 03:00 → 02:00, so 02:00–02:59 happens twice; 02:00 CEST is 00:00 UTC.
    const twoAm = { dailyAt: '02:00' }
    const first = nextClubJobDue(twoAm, { now: at('2026-10-24T23:00:00Z'), timeZone: WARSAW, organizationId: ORG_B })
    expect(first.getTime()).toBe(at('2026-10-25T00:00:00Z').getTime() + offsetOf(ORG_B))
    const next = nextClubJobDue(twoAm, { now: first, timeZone: WARSAW, organizationId: ORG_B })
    expect(next.getTime()).toBe(at('2026-10-26T01:00:00Z').getTime() + offsetOf(ORG_B))
  })
})

describe('nextClubJobDue: interval jobs', () => {
  it('is the next slot of a stable phase inside the interval', () => {
    const every = { everyMinutes: 15 }
    const offset = clubJobOffsetMs(ORG_A, 15 * MINUTE)
    const now = at('2026-06-10T10:07:00Z')
    const due = nextClubJobDue(every, { now, timeZone: WARSAW, organizationId: ORG_A })
    expect(due.getTime()).toBeGreaterThan(now.getTime())
    expect(due.getTime() - now.getTime()).toBeLessThanOrEqual(15 * MINUTE)
    expect((due.getTime() - offset) % (15 * MINUTE)).toBe(0)
    expect(nextClubJobDue(every, { now: due, timeZone: WARSAW, organizationId: ORG_A }).getTime()).toBe(
      due.getTime() + 15 * MINUTE,
    )
  })
})

describe('latestClubJobDue and dueAfterRun (DD-M06)', () => {
  const clock = { now: at('2026-06-10T00:00:00Z'), timeZone: WARSAW, organizationId: ORG_A }

  it('caps a daily job at its next local run and an interval job at 24 hours', () => {
    expect(latestClubJobDue({ dailyAt: '06:00' }, clock)).toEqual(nextClubJobDue({ dailyAt: '06:00' }, clock))
    expect(latestClubJobDue({ everyMinutes: 15 }, clock).getTime()).toBe(clock.now.getTime() + INTERVAL_MAX_DELAY_MS)
  })

  it("takes the worker's earlier time, caps a later one and ignores a missing or invalid one", () => {
    const every = { everyMinutes: 15 }
    const soon = at('2026-06-10T03:00:00Z')
    expect(dueAfterRun(every, clock, soon)).toBe(soon)
    expect(dueAfterRun(every, clock, at('2026-06-20T00:00:00Z')).getTime()).toBe(
      clock.now.getTime() + INTERVAL_MAX_DELAY_MS,
    )
    expect(dueAfterRun(every, clock)).toEqual(nextClubJobDue(every, clock))
    expect(dueAfterRun(every, clock, null)).toEqual(nextClubJobDue(every, clock))
    expect(dueAfterRun(every, clock, new Date(Number.NaN))).toEqual(nextClubJobDue(every, clock))
  })
})

describe('dueAfterFailure and runLeaseMs', () => {
  it('retries after 15 minutes, or after a shorter interval', () => {
    const now = at('2026-06-10T00:00:00Z')
    expect(dueAfterFailure({ dailyAt: '06:00' }, now).getTime()).toBe(now.getTime() + FAILURE_RETRY_MS)
    expect(dueAfterFailure({ everyMinutes: 60 }, now).getTime()).toBe(now.getTime() + FAILURE_RETRY_MS)
    expect(dueAfterFailure({ everyMinutes: 2 }, now).getTime()).toBe(now.getTime() + 2 * MINUTE)
  })

  it('leases a started run for its timeout, 30 minutes by default', () => {
    expect(runLeaseMs({ key: 'a:b', schedule: { everyMinutes: 1 }, description: 'x' })).toBe(
      DEFAULT_JOB_TIMEOUT_MINUTES * MINUTE,
    )
    expect(runLeaseMs({ key: 'a:b', schedule: { everyMinutes: 1 }, description: 'x', timeoutMinutes: 90 })).toBe(
      90 * MINUTE,
    )
  })
})

describe('perClubScheduleSpec', () => {
  it('turns a local time into a cron in the club zone and minutes into the shortest interval unit', () => {
    expect(perClubScheduleSpec({ dailyAt: '01:30' }, WARSAW)).toEqual({ cron: '30 1 * * *', timezone: WARSAW })
    expect(perClubScheduleSpec({ everyMinutes: 1440 }, WARSAW)).toEqual({ interval: '1d' })
    expect(perClubScheduleSpec({ everyMinutes: 120 }, WARSAW)).toEqual({ interval: '2h' })
    expect(perClubScheduleSpec({ everyMinutes: 15 }, WARSAW)).toEqual({ interval: '15m' })
  })
})
