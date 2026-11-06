import { describe, expect, it } from '@jest/globals'
import {
  AVAILABILITY_PRIORITY,
  MIN_AVAILABILITY_MINUTES,
  ZONES,
  ZONE_SOURCES,
  availabilityRules,
  availabilityWindowProblem,
  conflictingZoneRule,
  dayZoneSegments,
  localSessionOf,
  replaceAvailabilityPlan,
  ruleAppliesOn,
  sessionsInWindows,
  wallTimeOf,
  weekDates,
  zoneRuleShapeProblem,
  zoneRulesOverlap,
  type ZoneRuleShape,
} from '../zones'

const rule = (patch: Partial<ZoneRuleShape>): ZoneRuleShape => ({
  id: 'r',
  placeId: 'pitch',
  weekdays: [1, 2, 3, 4, 5],
  timeFrom: '16:00:00',
  timeTo: '22:00:00',
  zone: 'public_free',
  priority: 1,
  source: 'regulations',
  validFrom: '2026-01-01',
  validTo: null,
  ...patch,
})

/** Orlik 2024 (§2): Mon–Fri 8:00–22:00, Sat–Sun 9:00–20:30. */
const ORLIK_HOURS = {
  seasons: [
    {
      from: '01-01',
      to: '12-31',
      windows: [
        ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, from: '08:00', to: '22:00' })),
        ...[6, 7].map((weekday) => ({ weekday, from: '09:00', to: '20:30' })),
      ],
    },
  ],
}

describe('zone rules (glossary *Zone*)', () => {
  it('lists zones, sources and the availability constants', () => {
    expect(ZONES).toEqual(['public_free', 'club_training', 'reservable_paid', 'closed'])
    expect(ZONE_SOURCES).toEqual(['regulations', 'availability'])
    expect(AVAILABILITY_PRIORITY).toBe(3)
    expect(MIN_AVAILABILITY_MINUTES).toBe(90)
    expect(wallTimeOf('16:00:00')).toBe('16:00')
  })

  it('finds an overlap only with the same place, weekday, minutes and validity', () => {
    const base = rule({})
    expect(zoneRulesOverlap(base, rule({ id: 'b', timeFrom: '21:00', timeTo: '23:00' }))).toBe(true)
    expect(zoneRulesOverlap(base, rule({ id: 'b', placeId: 'hall' }))).toBe(false)
    expect(zoneRulesOverlap(base, rule({ id: 'b', weekdays: [6, 7] }))).toBe(false)
    expect(zoneRulesOverlap(base, rule({ id: 'b', timeFrom: '22:00', timeTo: '23:00' }))).toBe(false)
    expect(zoneRulesOverlap(base, rule({ id: 'b', timeFrom: '08:00', timeTo: '16:00' }))).toBe(false)
    expect(zoneRulesOverlap(rule({ validTo: '2026-06-30' }), rule({ id: 'b', validFrom: '2026-07-01' }))).toBe(false)
  })

  it('refuses a second rule of equal priority that overlaps (#121 acceptance), not itself or another priority', () => {
    const existing = [rule({ id: 'first' })]
    expect(conflictingZoneRule(rule({ id: 'second', timeFrom: '18:00', timeTo: '20:00' }), existing)?.id).toBe('first')
    expect(conflictingZoneRule(rule({ id: 'second', priority: 2 }), existing)).toBeNull()
    expect(conflictingZoneRule(rule({ id: 'first' }), existing)).toBeNull()
  })

  it('checks the weekdays and times of a rule', () => {
    expect(zoneRuleShapeProblem({ weekdays: [1], timeFrom: '08:00', timeTo: '09:00' })).toBeNull()
    expect(zoneRuleShapeProblem({ weekdays: [], timeFrom: '08:00', timeTo: '09:00' })).toBe('weekdays_empty')
    expect(zoneRuleShapeProblem({ weekdays: [1], timeFrom: '8', timeTo: '09:00' })).toBe('time_malformed')
    expect(zoneRuleShapeProblem({ weekdays: [1], timeFrom: '08:00', timeTo: '25:00' })).toBe('time_malformed')
    expect(zoneRuleShapeProblem({ weekdays: [1], timeFrom: '09:00', timeTo: '09:00' })).toBe('time_inverted')
  })

  it('applies a rule on its weekdays within its validity', () => {
    const limited = rule({ validFrom: '2026-11-02', validTo: '2026-11-30' })
    expect(ruleAppliesOn(limited, '2026-11-02')).toBe(true)
    expect(ruleAppliesOn(limited, '2026-11-07')).toBe(false)
    expect(ruleAppliesOn(limited, '2026-11-01')).toBe(false)
    expect(ruleAppliesOn(limited, '2026-12-01')).toBe(false)
  })
})

describe('week preview', () => {
  it('lets the higher priority win and merges stretches of one rule', () => {
    const rules = [
      rule({ id: 'public', timeFrom: '08:00', timeTo: '22:00' }),
      rule({ id: 'club', zone: 'club_training', priority: 2, timeFrom: '17:00', timeTo: '19:00' }),
      rule({
        id: 'avail',
        zone: 'reservable_paid',
        priority: 3,
        source: 'availability',
        timeFrom: '19:00',
        timeTo: '21:00',
      }),
      rule({ id: 'saturday', weekdays: [6], timeFrom: '09:00', timeTo: '12:00' }),
    ]
    expect(dayZoneSegments(rules, '2026-11-02')).toEqual([
      { from: '08:00', to: '17:00', zone: 'public_free', ruleId: 'public' },
      { from: '17:00', to: '19:00', zone: 'club_training', ruleId: 'club' },
      { from: '19:00', to: '21:00', zone: 'reservable_paid', ruleId: 'avail' },
      { from: '21:00', to: '22:00', zone: 'public_free', ruleId: 'public' },
    ])
    expect(dayZoneSegments(rules, '2026-11-08')).toEqual([])
  })

  it('merges the stretches a lower-priority rule splits but never wins', () => {
    const rules = [
      rule({ id: 'club', zone: 'club_training', priority: 2, timeFrom: '08:00', timeTo: '22:00' }),
      rule({ id: 'public', priority: 1, timeFrom: '12:00', timeTo: '14:00' }),
    ]
    expect(dayZoneSegments(rules, '2026-11-02')).toEqual([
      { from: '08:00', to: '22:00', zone: 'club_training', ruleId: 'club' },
    ])
    const unsaved = [{ ...rules[0], id: undefined }, rules[1]] as ZoneRuleShape[]
    expect(dayZoneSegments(unsaved, '2026-11-02')).toEqual([
      { from: '08:00', to: '22:00', zone: 'club_training', ruleId: null },
    ])
  })

  it('leaves gaps no rule covers and keeps rule-less ids as null', () => {
    const rules = [
      rule({ id: undefined, timeFrom: '08:00', timeTo: '10:00' }),
      rule({ id: undefined, timeFrom: '12:00', timeTo: '14:00', priority: 2 }),
    ]
    expect(dayZoneSegments(rules, '2026-11-02')).toEqual([
      { from: '08:00', to: '10:00', zone: 'public_free', ruleId: null },
      { from: '12:00', to: '14:00', zone: 'public_free', ruleId: null },
    ])
  })

  it('lists the ISO week of a date', () => {
    expect(weekDates('2026-11-05')).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ])
  })
})

describe('bulk booking availability (REQ-029)', () => {
  const period = { validFrom: '2026-11-02', validTo: null }

  it('refuses inverted, short and out-of-hours windows per day (#121 acceptance)', () => {
    expect(availabilityWindowProblem({ weekday: 1, from: '16:00', to: '22:00' }, ORLIK_HOURS, period)).toBeNull()
    expect(availabilityWindowProblem({ weekday: 1, from: '18:00', to: '16:00' }, ORLIK_HOURS, period)).toBe(
      'time_order',
    )
    expect(availabilityWindowProblem({ weekday: 1, from: '15:00', to: '16:00' }, ORLIK_HOURS, period)).toBe('too_short')
    expect(availabilityWindowProblem({ weekday: 1, from: '07:00', to: '10:00' }, ORLIK_HOURS, period)).toBe(
      'outside_opening_hours',
    )
    expect(availabilityWindowProblem({ weekday: 6, from: '09:00', to: '20:30' }, ORLIK_HOURS, period)).toBeNull()
    expect(availabilityWindowProblem({ weekday: 1, from: '07:00', to: '10:00' }, null, period)).toBeNull()
  })

  it('groups the windows of one place into rules by their hours', () => {
    const rules = availabilityRules(
      'pitch',
      [
        { weekday: 2, from: '16:00', to: '22:00' },
        { weekday: 1, from: '16:00', to: '22:00' },
        { weekday: 1, from: '16:00', to: '22:00' },
        { weekday: 6, from: '09:00', to: '20:30' },
      ],
      { validFrom: '2026-11-02', validTo: '2027-03-31' },
    )
    expect(rules).toEqual([
      {
        placeId: 'pitch',
        weekdays: [1, 2],
        timeFrom: '16:00',
        timeTo: '22:00',
        zone: 'reservable_paid',
        priority: 3,
        source: 'availability',
        validFrom: '2026-11-02',
        validTo: '2027-03-31',
      },
      expect.objectContaining({ weekdays: [6], timeFrom: '09:00', timeTo: '20:30' }),
    ])
  })

  it('keeps rules "replace" does not touch', () => {
    const availability = rule({ source: 'availability', priority: 3, zone: 'reservable_paid' })
    expect(replaceAvailabilityPlan(rule({}), [1], period)).toEqual({ replaced: false })
    expect(replaceAvailabilityPlan(availability, [6], period)).toEqual({ replaced: false })
    expect(replaceAvailabilityPlan({ ...availability, validTo: '2026-10-31' }, [1], period)).toEqual({
      replaced: false,
    })
  })

  it('removes the selected weekdays from the period and keeps the rest of the rule', () => {
    const availability = rule({ id: 'old', source: 'availability', priority: 3, zone: 'reservable_paid' })
    const plan = replaceAvailabilityPlan(availability, [5], { validFrom: '2026-11-02', validTo: '2026-12-31' })
    expect(plan).toEqual({
      replaced: true,
      fragments: [
        expect.objectContaining({
          id: undefined,
          weekdays: [1, 2, 3, 4, 5],
          validFrom: '2026-01-01',
          validTo: '2026-11-01',
        }),
        expect.objectContaining({
          id: undefined,
          weekdays: [1, 2, 3, 4],
          validFrom: '2026-11-02',
          validTo: '2026-12-31',
        }),
        expect.objectContaining({ id: undefined, weekdays: [1, 2, 3, 4, 5], validFrom: '2027-01-01', validTo: null }),
      ],
    })
  })

  it('drops a rule whose every weekday is replaced inside the period', () => {
    const availability = rule({
      source: 'availability',
      priority: 3,
      weekdays: [5],
      validFrom: '2026-11-02',
      validTo: '2026-11-30',
    })
    expect(replaceAvailabilityPlan(availability, [5], period)).toEqual({ replaced: true, fragments: [] })
  })

  it('keeps the earlier end of a closed rule inside an open period, and the open end inside a closed one', () => {
    const closed = rule({ source: 'availability', priority: 3, validFrom: '2026-11-02', validTo: '2026-12-31' })
    expect(replaceAvailabilityPlan(closed, [5], period)).toEqual({
      replaced: true,
      fragments: [expect.objectContaining({ weekdays: [1, 2, 3, 4], validFrom: '2026-11-02', validTo: '2026-12-31' })],
    })
    const open = rule({ source: 'availability', priority: 3, validFrom: '2026-11-10' })
    expect(replaceAvailabilityPlan(open, [5], period)).toEqual({
      replaced: true,
      fragments: [expect.objectContaining({ weekdays: [1, 2, 3, 4], validFrom: '2026-11-10', validTo: null })],
    })
    const longer = rule({ source: 'availability', priority: 3, validFrom: '2026-11-10', validTo: '2027-06-30' })
    expect(replaceAvailabilityPlan(longer, [5], { validFrom: '2026-11-02', validTo: '2026-12-31' })).toEqual({
      replaced: true,
      fragments: [
        expect.objectContaining({ weekdays: [1, 2, 3, 4], validFrom: '2026-11-10', validTo: '2026-12-31' }),
        expect.objectContaining({ weekdays: [1, 2, 3, 4, 5], validFrom: '2027-01-01', validTo: '2027-06-30' }),
      ],
    })
    expect(
      replaceAvailabilityPlan(longer, [1, 2, 3, 4, 5], { validFrom: '2026-11-02', validTo: '2026-12-31' }),
    ).toEqual({
      replaced: true,
      fragments: [
        expect.objectContaining({ weekdays: [1, 2, 3, 4, 5], validFrom: '2027-01-01', validTo: '2027-06-30' }),
      ],
    })
  })

  it('counts the club sessions inside the new windows within the period', () => {
    const windows = [{ weekday: 1, from: '16:00', to: '22:00' }]
    const sessions = [
      { date: '2026-11-02', from: '18:00:00', to: '19:30:00' },
      { date: '2026-11-02', from: '22:00:00', to: '23:00:00' },
      { date: '2026-11-03', from: '18:00:00', to: '19:30:00' },
      { date: '2026-10-26', from: '18:00:00', to: '19:30:00' },
      { date: '2027-01-04', from: '18:00:00', to: '19:30:00' },
    ]
    expect(sessionsInWindows(sessions, windows, { validFrom: '2026-11-02', validTo: '2026-12-31' })).toBe(1)
    expect(sessionsInWindows(sessions, windows, { validFrom: '2026-11-02', validTo: null })).toBe(2)
  })
})

describe('localSessionOf', () => {
  it('reads a session in the club time zone, cutting one past midnight at the end of its day', () => {
    expect(localSessionOf(new Date('2026-11-02T17:00:00Z'), new Date('2026-11-02T18:30:00Z'), 'Europe/Warsaw')).toEqual(
      { date: '2026-11-02', from: '18:00', to: '19:30' },
    )
    expect(localSessionOf(new Date('2026-11-02T22:00:00Z'), new Date('2026-11-03T00:30:00Z'), 'Europe/Warsaw')).toEqual(
      { date: '2026-11-02', from: '23:00', to: '24:00' },
    )
  })
})
