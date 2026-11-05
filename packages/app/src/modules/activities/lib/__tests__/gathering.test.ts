import { describe, expect, it } from '@jest/globals'
import { MAX_GATHERING_MINUTES, gatheringAt, gatheringIso, gatheringOffset } from '../gathering'

const START = new Date('2026-11-07T09:00:00Z')

describe('gathering instant (club spec DD-43)', () => {
  it('is the start minus the offset', () => {
    expect(gatheringAt(START, 45)).toEqual(new Date('2026-11-07T08:15:00Z'))
    expect(gatheringIso(START, 30)).toBe('2026-11-07T08:30:00.000Z')
  })

  it('is absent without a positive offset', () => {
    expect(gatheringAt(START, null)).toBeNull()
    expect(gatheringAt(START, undefined)).toBeNull()
    expect(gatheringAt(START, 0)).toBeNull()
    expect(gatheringIso(START, null)).toBeNull()
  })

  it('moves with the start: the same offset after a two-hour move', () => {
    const moved = new Date(START.getTime() + 2 * 3_600_000)
    expect(gatheringAt(moved, 30)).toEqual(new Date('2026-11-07T10:30:00Z'))
  })
})

describe('gathering offset of a submitted instant', () => {
  it('stores whole minutes before the start', () => {
    expect(gatheringOffset(START, new Date('2026-11-07T08:15:00Z'))).toEqual({ ok: true, minutes: 45 })
    expect(gatheringOffset(START, new Date('2026-11-07T08:58:30Z'))).toEqual({ ok: true, minutes: 1 })
  })

  it('refuses a gathering at, after or less than a minute before the start', () => {
    const refused = { ok: false, code: 'occurrence_gathering_after_start' }
    expect(gatheringOffset(START, START)).toEqual(refused)
    expect(gatheringOffset(START, new Date('2026-11-07T09:30:00Z'))).toEqual(refused)
    expect(gatheringOffset(START, new Date('2026-11-07T08:59:30Z'))).toEqual(refused)
  })

  it('refuses a gathering more than twelve hours before the start', () => {
    const limit = new Date(START.getTime() - MAX_GATHERING_MINUTES * 60_000)
    expect(gatheringOffset(START, limit)).toEqual({ ok: true, minutes: MAX_GATHERING_MINUTES })
    expect(gatheringOffset(START, new Date(limit.getTime() - 60_000))).toEqual({
      ok: false,
      code: 'occurrence_gathering_too_early',
    })
  })
})
