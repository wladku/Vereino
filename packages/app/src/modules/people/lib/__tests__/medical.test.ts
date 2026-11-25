import { describe, expect, it } from '@jest/globals'
import {
  MEDICAL_COME_OF_AGE_GRACE_DAYS,
  MEDICAL_REMINDER_LOOKBACK_DAYS,
  MEDICAL_WARNING_DAYS,
  addMonths,
  decideMedical,
  medicalConsentInForce,
  medicalDate,
  medicalReminderDay,
  medicalReminderKey,
  medicalRemindersDue,
  medicalRetentionPassed,
  medicalStatus,
} from '../medical'

const TODAY = '2026-11-25'
const granted = (at = '2026-01-01T00:00:00.000Z') => ({ granted: true, at, by_person_id: null })
const withdrawn = (at = '2026-01-02T00:00:00.000Z') => ({ granted: false, at, by_person_id: null })

describe('medicalDate', () => {
  it('reads a calendar date and refuses anything else', () => {
    expect(medicalDate('2026-12-01')).toBe('2026-12-01')
    expect(medicalDate(' 2026-12-01T00:00:00Z')).toBe('2026-12-01')
    expect(medicalDate('2026-02-30')).toBeNull()
    expect(medicalDate('garbage')).toBeNull()
    expect(medicalDate(null)).toBeNull()
    expect(medicalDate(undefined)).toBeNull()
  })
})

describe('medicalStatus (DD-O02)', () => {
  it('is red for a missing, unreadable or passed date', () => {
    expect(medicalStatus(null, TODAY)).toEqual({ status: 'red', state: 'missing', validUntil: null })
    expect(medicalStatus(undefined, TODAY)).toEqual({ status: 'red', state: 'missing', validUntil: null })
    expect(medicalStatus('', TODAY)).toEqual({ status: 'red', state: 'missing', validUntil: null })
    expect(medicalStatus('not-a-date', TODAY)).toEqual({ status: 'red', state: 'unknown', validUntil: null })
    expect(medicalStatus('2026-11-24', TODAY)).toEqual({ status: 'red', state: 'expired', validUntil: '2026-11-24' })
  })
  it('is orange from today through 30 days, green after', () => {
    expect(MEDICAL_WARNING_DAYS).toBe(30)
    expect(medicalStatus(TODAY, TODAY).status).toBe('orange')
    expect(medicalStatus('2026-12-25', TODAY)).toEqual({
      status: 'orange',
      state: 'expiring',
      validUntil: '2026-12-25',
    })
    expect(medicalStatus('2026-12-26', TODAY)).toEqual({ status: 'green', state: 'valid', validUntil: '2026-12-26' })
  })
})

describe('medical reminders (REQ-O03, DD-O04)', () => {
  it('names the day of each reminder', () => {
    expect(medicalReminderDay('2026-12-25', 'expiring')).toBe('2026-11-25')
    expect(medicalReminderDay('2026-12-25', 'expired')).toBe('2026-12-25')
  })
  it('is due from its day through the look-back window', () => {
    expect(MEDICAL_REMINDER_LOOKBACK_DAYS).toBe(3)
    expect(medicalRemindersDue('2026-12-25', '2026-11-24')).toEqual([])
    expect(medicalRemindersDue('2026-12-25', TODAY)).toEqual(['expiring'])
    expect(medicalRemindersDue('2026-12-25', '2026-11-28')).toEqual(['expiring'])
    expect(medicalRemindersDue('2026-12-25', '2026-11-29')).toEqual([])
    expect(medicalRemindersDue(TODAY, TODAY)).toEqual(['expired'])
    expect(medicalRemindersDue('2026-11-22', TODAY)).toEqual(['expired'])
    expect(medicalRemindersDue('2026-11-21', TODAY)).toEqual([])
  })
  it('sends no late month-before reminder for a date entered close to it', () => {
    // A date entered two days ahead: its month-before day is long past, its own day has not come.
    expect(medicalRemindersDue('2026-11-27', TODAY)).toEqual([])
  })
  it('keys each reminder by person, date and kind', () => {
    expect(medicalReminderKey('p1', '2026-12-25', 'expiring')).toBe('medical:p1:2026-12-25:expiring')
  })
})

describe('addMonths and medicalRetentionPassed (R20)', () => {
  it('moves by months, keeping the last day of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28')
    expect(addMonths('2026-11-25', 12)).toBe('2027-11-25')
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15')
  })
  it('passes 12 months after the date, not on the anniversary', () => {
    expect(medicalRetentionPassed('2025-11-25', TODAY)).toBe(false)
    expect(medicalRetentionPassed('2025-11-24', TODAY)).toBe(true)
  })
})

describe('medicalConsentInForce (BR-O1)', () => {
  const minor = '2015-05-01'
  const active = { validFrom: '2020-01-01', validTo: null }
  it('for a minor, any one active guardian', () => {
    const rows = [
      { ...active, consents: { medical: withdrawn() } },
      { ...active, consents: { medical: granted() } },
    ]
    expect(medicalConsentInForce({ birthDate: minor, own: {}, guardianships: rows, today: TODAY })).toBe(true)
    expect(
      medicalConsentInForce({
        birthDate: minor,
        own: {},
        guardianships: [{ validFrom: '2020-01-01', validTo: '2026-01-01', consents: { medical: granted() } }],
        today: TODAY,
      }),
    ).toBe(false)
    expect(medicalConsentInForce({ birthDate: null, own: {}, guardianships: [], today: TODAY })).toBe(false)
  })
  it("for an adult, the adult's own decision", () => {
    const rows = [{ ...active, consents: { medical: granted() } }]
    expect(
      medicalConsentInForce({ birthDate: '1990-01-01', own: { medical: granted() }, guardianships: [], today: TODAY }),
    ).toBe(true)
    expect(
      medicalConsentInForce({
        birthDate: '1990-01-01',
        own: { medical: withdrawn() },
        guardianships: rows,
        today: TODAY,
      }),
    ).toBe(false)
    expect(medicalConsentInForce({ birthDate: '1990-01-01', own: {}, guardianships: rows, today: TODAY })).toBe(false)
  })
  it("keeps a former guardian's consent 30 days after the 18th birthday", () => {
    expect(MEDICAL_COME_OF_AGE_GRACE_DAYS).toBe(30)
    const birthDate = '2008-11-10'
    const ended = [{ validFrom: '2015-01-01', validTo: '2026-11-09', consents: { medical: granted() } }]
    expect(medicalConsentInForce({ birthDate, own: {}, guardianships: ended, today: TODAY })).toBe(true)
    expect(medicalConsentInForce({ birthDate, own: {}, guardianships: ended, today: '2026-12-09' })).toBe(true)
    expect(medicalConsentInForce({ birthDate, own: {}, guardianships: ended, today: '2026-12-10' })).toBe(false)
    const startedLater = [{ validFrom: '2026-11-20', validTo: null, consents: { medical: granted() } }]
    expect(medicalConsentInForce({ birthDate, own: {}, guardianships: startedLater, today: TODAY })).toBe(false)
  })
})

describe('decideMedical (the daily job)', () => {
  const active = { validFrom: '2020-01-01', validTo: null }
  const consented = { consents: { medical: granted() }, birthDate: '1990-01-01' }
  it('clears without a consent in force, after the person left, and 12 months after the date', () => {
    expect(
      decideMedical({ consents: {}, birthDate: '1990-01-01', medicalValidUntil: '2026-12-01' }, [], TODAY),
    ).toEqual({
      action: 'clear',
      reason: 'no_consent',
    })
    expect(decideMedical({ ...consented, medicalValidUntil: '2026-12-01', leftOn: '2026-11-24' }, [], TODAY)).toEqual({
      action: 'clear',
      reason: 'departed',
    })
    expect(decideMedical({ ...consented, medicalValidUntil: '2025-11-01' }, [], TODAY)).toEqual({
      action: 'clear',
      reason: 'retention',
    })
  })
  it('reminds when due and otherwise does nothing', () => {
    expect(decideMedical({ ...consented, medicalValidUntil: '2026-12-25', leftOn: TODAY }, [], TODAY)).toEqual({
      action: 'remind',
      kinds: ['expiring'],
      validUntil: '2026-12-25',
    })
    expect(decideMedical({ ...consented, medicalValidUntil: '2027-06-01' }, [], TODAY)).toEqual({ action: 'none' })
    expect(decideMedical({ ...consented, medicalValidUntil: 'garbage' }, [], TODAY)).toEqual({ action: 'none' })
    const ward = { consents: {}, birthDate: '2015-01-01', medicalValidUntil: TODAY }
    expect(decideMedical(ward, [{ ...active, consents: { medical: granted() } }], TODAY)).toEqual({
      action: 'remind',
      kinds: ['expired'],
      validUntil: TODAY,
    })
  })
})
