import { describe, expect, it } from '@jest/globals'
import {
  MAX_GENERATION_DAY,
  MAX_REMINDERS,
  MIN_GENERATION_DAY,
  REMINDER_INTERVAL_DAYS,
  firstAutomaticPeriod,
  generationDue,
  reminderBatches,
  reminderDue,
  type ReminderCandidate,
} from '../payments-rules'

// TEST-C16 (payments parity spec, #301): the due rules of the scheduled generation (DD-C08, first automatic month of
// Q-C07) and of the overdue reminders (DD-C09).

describe('the generation day and reminder bounds', () => {
  it('keeps the generation day within every month and caps the reminders at four a week apart', () => {
    expect([MIN_GENERATION_DAY, MAX_GENERATION_DAY]).toEqual([1, 28])
    expect([REMINDER_INTERVAL_DAYS, MAX_REMINDERS]).toEqual([7, 4])
  })
})

describe('firstAutomaticPeriod', () => {
  it('is the month after the one migration B was applied in, across a year end', () => {
    expect(firstAutomaticPeriod('2026-11-18')).toBe('2026-12')
    expect(firstAutomaticPeriod('2026-12-31')).toBe('2027-01')
  })
})

describe('generationDue', () => {
  const base = {
    today: '2026-12-01',
    autoGenerate: true,
    generationDay: 1,
    migrationAppliedOn: '2026-11-18',
    monthGenerated: false,
  }

  it('generates the current month on its generation day after migration B’s month', () => {
    expect(generationDue(base)).toEqual({ due: true, period: '2026-12' })
    expect(generationDue({ ...base, today: '2026-12-20', generationDay: 5 })).toEqual({ due: true, period: '2026-12' })
  })

  it('never generates in migration B’s month, even after the generation day', () => {
    expect(generationDue({ ...base, today: '2026-11-28' })).toEqual({
      due: false,
      period: '2026-11',
      reason: 'before_first_month',
    })
  })

  it('waits for the generation day', () => {
    expect(generationDue({ ...base, today: '2026-12-04', generationDay: 5 })).toMatchObject({
      due: false,
      reason: 'before_day',
    })
  })

  it('generates a month once: a generation of the month, undone or not, stops it', () => {
    expect(generationDue({ ...base, monthGenerated: true })).toMatchObject({ due: false, reason: 'generated' })
  })

  it('does nothing when switched off or when migration B’s day is unknown', () => {
    expect(generationDue({ ...base, autoGenerate: false })).toMatchObject({ due: false, reason: 'switched_off' })
    expect(generationDue({ ...base, migrationAppliedOn: null })).toMatchObject({
      due: false,
      reason: 'boundary_unknown',
    })
  })
})

describe('reminderDue', () => {
  const charge = { dueDate: '2026-12-10', reminderCount: 0, lastRemindedOn: null }

  it('reminds first on the day after the due date, never on it', () => {
    expect(reminderDue(charge, '2026-12-10')).toBe(false)
    expect(reminderDue(charge, '2026-12-11')).toBe(true)
  })

  it('reminds again seven days after the last reminder', () => {
    const reminded = { ...charge, reminderCount: 1, lastRemindedOn: '2026-12-11' }
    expect(reminderDue(reminded, '2026-12-17')).toBe(false)
    expect(reminderDue(reminded, '2026-12-18')).toBe(true)
  })

  it('treats a count without a date as not reminded yet, and stops after four', () => {
    expect(reminderDue({ ...charge, reminderCount: 2 }, '2026-12-11')).toBe(true)
    expect(reminderDue({ ...charge, reminderCount: 4, lastRemindedOn: '2026-12-01' }, '2027-01-30')).toBe(false)
  })
})

describe('reminderBatches', () => {
  const candidate = (over: Partial<ReminderCandidate>): ReminderCandidate => ({
    id: 'c1',
    sourceType: 'fee',
    status: 'open',
    payerPersonId: 'p1',
    dueDate: '2026-12-10',
    remaining: 10_000,
    reminderCount: 0,
    lastRemindedOn: null,
    ...over,
  })

  it('sends one reminder per payer listing every overdue charge, in due-date order', () => {
    const batches = reminderBatches(
      [
        candidate({ id: 'c3', dueDate: '2026-12-10' }),
        candidate({ id: 'c1', dueDate: '2026-11-02', reminderCount: 1, lastRemindedOn: '2026-12-08' }),
        candidate({ id: 'c2', dueDate: '2026-12-10', status: 'partially_paid' }),
        candidate({ id: 'c9', payerPersonId: 'p0' }),
      ],
      '2026-12-11',
    )
    expect([...batches.keys()]).toEqual(['p0', 'p1'])
    expect(batches.get('p1')?.map((charge) => charge.id)).toEqual(['c1', 'c2', 'c3'])
  })

  it('skips a payer none of whose charges is due a reminder today', () => {
    const batches = reminderBatches(
      [candidate({ id: 'c1', reminderCount: 1, lastRemindedOn: '2026-12-11' })],
      '2026-12-12',
    )
    expect(batches.size).toBe(0)
  })

  it('never reminds rental charges, charges without a payer, settled or capped charges, or charges not yet due', () => {
    const batches = reminderBatches(
      [
        candidate({ id: 'rental', sourceType: 'rental' }),
        candidate({ id: 'no-payer', payerPersonId: null }),
        candidate({ id: 'paid', status: 'paid' }),
        candidate({ id: 'nothing-left', remaining: 0 }),
        candidate({ id: 'capped', reminderCount: 4, lastRemindedOn: '2026-11-01' }),
        candidate({ id: 'due-today', dueDate: '2026-12-11' }),
      ],
      '2026-12-11',
    )
    expect(batches.size).toBe(0)
  })
})
