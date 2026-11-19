import { describe, expect, it } from '@jest/globals'
import {
  closingAfter,
  defaultSlotEnd,
  overlappingRequests,
  rentalSlotEnd,
  selectedSlotKind,
  slotKinds,
  zoneAtMinute,
} from '../slot'

describe('slotKinds', () => {
  it('offers every kind in the DD-R04 order', () => {
    expect(slotKinds({ rentals: true, groupEvents: true, ownGroups: 2, bookings: true })).toEqual([
      'rental',
      'group',
      'general',
    ])
  })

  it('offers the group kind only with own groups', () => {
    expect(slotKinds({ rentals: false, groupEvents: true, ownGroups: 0, bookings: true })).toEqual(['general'])
    expect(slotKinds({ rentals: false, groupEvents: true, ownGroups: 1, bookings: false })).toEqual(['group'])
    expect(slotKinds({ rentals: false, groupEvents: false, ownGroups: 3, bookings: false })).toEqual([])
  })

  it('offers the rental alone to an attendant', () => {
    expect(slotKinds({ rentals: true, groupEvents: false, ownGroups: 0, bookings: false })).toEqual(['rental'])
  })
})

describe('selectedSlotKind', () => {
  it('preselects the first offered kind until the user picks one', () => {
    expect(selectedSlotKind(['general'], null)).toBe('general')
    // A coach's groups loaded after the dialog opened: the preselection follows the offered kinds (#366).
    expect(selectedSlotKind(['group', 'general'], null)).toBe('group')
  })

  it("keeps the user's pick while it is offered", () => {
    expect(selectedSlotKind(['group', 'general'], 'general')).toBe('general')
    expect(selectedSlotKind(['general'], 'group')).toBe('general')
  })

  it('falls back to the rental kind when nothing is offered', () => {
    expect(selectedSlotKind([], null)).toBe('rental')
  })
})

describe('closingAfter', () => {
  const opening = [
    { from: 480, to: 720 },
    { from: 900, to: 1320 },
  ]

  it('names the end of the window holding the start', () => {
    expect(closingAfter(opening, 480)).toBe(720)
    expect(closingAfter(opening, 1260)).toBe(1320)
  })

  it('is null without a limit or outside every window', () => {
    expect(closingAfter(null, 600)).toBeNull()
    expect(closingAfter(opening, 720)).toBeNull()
    expect(closingAfter([], 600)).toBeNull()
  })
})

describe('defaultSlotEnd', () => {
  it('lasts 90 minutes, clipped to the closing time', () => {
    expect(defaultSlotEnd(600, null)).toBe(690)
    expect(defaultSlotEnd(600, 1320)).toBe(690)
    expect(defaultSlotEnd(1260, 1320)).toBe(1320)
  })

  it('ignores a closing time not after the start', () => {
    expect(defaultSlotEnd(600, 600)).toBe(690)
  })
})

describe('rentalSlotEnd', () => {
  it('adds the units of 90 minutes', () => {
    expect(rentalSlotEnd(1200, 1)).toBe(1290)
    expect(rentalSlotEnd(600, 3)).toBe(870)
  })
})

describe('zoneAtMinute', () => {
  const zones = [
    { from: 480, to: 960, zone: 'reservable_paid' as const },
    { from: 960, to: 1170, zone: 'club_training' as const },
  ]

  it('finds the zone holding the minute', () => {
    expect(zoneAtMinute(zones, 480)).toBe('reservable_paid')
    expect(zoneAtMinute(zones, 960)).toBe('club_training')
  })

  it('is null between zones', () => {
    expect(zoneAtMinute(zones, 1170)).toBeNull()
    expect(zoneAtMinute([], 600)).toBeNull()
  })
})

describe('overlappingRequests', () => {
  it('counts the requests overlapping the slot, touching ends excluded', () => {
    const requests = [
      { start: 100, end: 200 },
      { start: 200, end: 300 },
      { start: 50, end: 100 },
    ]
    expect(overlappingRequests(requests, 100, 200)).toBe(1)
    expect(overlappingRequests(requests, 150, 250)).toBe(2)
    expect(overlappingRequests([], 0, 1)).toBe(0)
  })
})
