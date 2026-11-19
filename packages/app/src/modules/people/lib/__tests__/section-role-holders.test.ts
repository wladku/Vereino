import { describe, expect, it } from '@jest/globals'
import { holdersBySectionDay, sectionDayKey, sectionDaysSpan, type SectionAssignment } from '../section-role-holders'

const A = 'section-a'
const B = 'section-b'

describe('sectionDayKey', () => {
  it('joins the section and the day', () => {
    expect(sectionDayKey({ sectionId: A, date: '2026-11-20' })).toBe('section-a:2026-11-20')
  })
})

describe('sectionDaysSpan', () => {
  it('is null without pairs', () => {
    expect(sectionDaysSpan([])).toBeNull()
  })

  it('spans the earliest and the latest day in any order', () => {
    expect(
      sectionDaysSpan([
        { sectionId: A, date: '2026-11-20' },
        { sectionId: B, date: '2026-11-18' },
        { sectionId: A, date: '2026-11-25' },
        { sectionId: B, date: '2026-11-21' },
      ]),
    ).toEqual({ from: '2026-11-18', to: '2026-11-25' })
  })
})

describe('holdersBySectionDay', () => {
  const assignments: SectionAssignment[] = [
    { personId: 'p1', sectionId: A, validFrom: '2026-01-01', validTo: null },
    { personId: 'p1', sectionId: A, validFrom: '2026-11-01', validTo: '2026-12-31' },
    { personId: 'p2', sectionId: A, validFrom: '2026-11-21', validTo: null },
    { personId: 'p3', sectionId: A, validFrom: '2026-01-01', validTo: '2026-11-19' },
    { personId: 'p4', sectionId: B, validFrom: '2026-01-01', validTo: null },
    { personId: 'p5', sectionId: null, validFrom: '2026-01-01', validTo: null },
  ]

  it('picks the distinct holders of the section active on each day', () => {
    const result = holdersBySectionDay(
      [
        { sectionId: A, date: '2026-11-19' },
        { sectionId: A, date: '2026-11-20' },
        { sectionId: A, date: '2026-11-21' },
        { sectionId: B, date: '2026-11-20' },
      ],
      assignments,
    )
    expect(result.get('section-a:2026-11-19')).toEqual(['p1', 'p3'])
    expect(result.get('section-a:2026-11-20')).toEqual(['p1'])
    expect(result.get('section-a:2026-11-21')).toEqual(['p1', 'p2'])
    expect(result.get('section-b:2026-11-20')).toEqual(['p4'])
  })

  it('gives a pair nobody holds an empty list', () => {
    expect(holdersBySectionDay([{ sectionId: 'section-c', date: '2026-11-20' }], assignments)).toEqual(
      new Map([['section-c:2026-11-20', []]]),
    )
  })
})
