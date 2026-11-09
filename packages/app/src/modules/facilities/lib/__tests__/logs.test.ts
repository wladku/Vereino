import { describe, expect, it } from '@jest/globals'
import {
  HEADCOUNT_MAX,
  LOG_TEXT_MAX_LENGTH,
  groupKey,
  groupReferences,
  groupsPresentValid,
  logDateAllowed,
  logEditable,
  logStateProblem,
} from '../logs'

const at = (iso: string) => new Date(iso)
const closedState = {
  openedAt: at('2026-11-10T15:58:00Z'),
  closedAt: at('2026-11-10T21:05:00Z'),
  conditionBefore: 'Dry pitch, nets in place',
  conditionAfter: 'One net torn',
}

describe('facility log (REQ-016, M-12, B-27)', () => {
  it('bounds the texts and the head count', () => {
    expect(LOG_TEXT_MAX_LENGTH).toBe(2000)
    expect(HEADCOUNT_MAX).toBe(500)
  })

  it('accepts a log for today or an earlier day, never for a later one', () => {
    expect(logDateAllowed('2026-11-10', '2026-11-10')).toBe(true)
    expect(logDateAllowed('2026-11-09', '2026-11-10')).toBe(true)
    expect(logDateAllowed('2026-11-11', '2026-11-10')).toBe(false)
  })

  it('is editable until the end of the next day, then by the administrator only', () => {
    expect(logEditable('2026-11-10', '2026-11-10', false)).toBe(true)
    expect(logEditable('2026-11-10', '2026-11-11', false)).toBe(true)
    expect(logEditable('2026-11-10', '2026-11-12', false)).toBe(false)
    expect(logEditable('2026-11-10', '2026-11-12', true)).toBe(true)
    expect(logEditable('2026-10-31', '2026-11-01', false)).toBe(true)
  })

  it('needs the condition before to open and the condition after to close', () => {
    expect(logStateProblem({ openedAt: null, closedAt: null, conditionBefore: null, conditionAfter: null })).toBeNull()
    expect(logStateProblem({ ...closedState, closedAt: null, conditionAfter: null })).toBeNull()
    expect(logStateProblem(closedState)).toBeNull()
    expect(logStateProblem({ ...closedState, conditionBefore: '  ' })).toEqual({
      code: 'log_condition_required',
      field: 'conditionBefore',
    })
    expect(logStateProblem({ ...closedState, conditionAfter: null })).toEqual({
      code: 'log_condition_required',
      field: 'conditionAfter',
    })
  })

  it('closes only an opened log, after its opening', () => {
    expect(logStateProblem({ ...closedState, openedAt: null })).toEqual({ code: 'log_not_opened', field: 'closedAt' })
    expect(logStateProblem({ ...closedState, closedAt: at('2026-11-10T15:00:00Z') })).toEqual({
      code: 'log_period_invalid',
      field: 'closedAt',
    })
  })

  it('keys a group by its session or its rental, never both or neither', () => {
    expect(groupKey({ occurrenceId: 'o1', headcount: 12, adultSupervisorPresent: true })).toBe('occurrence:o1')
    expect(groupKey({ rentalId: 'r1', occurrenceId: null, headcount: 12, adultSupervisorPresent: true })).toBe(
      'rental:r1',
    )
    expect(groupKey({ headcount: 1, adultSupervisorPresent: false })).toBeNull()
    expect(groupKey({ occurrenceId: 'o1', rentalId: 'r1', headcount: 1, adultSupervisorPresent: false })).toBeNull()
  })

  it('accepts each session or rental once with a head count of 0–500', () => {
    const session = { occurrenceId: 'o1', headcount: 14, adultSupervisorPresent: true }
    const rental = { rentalId: 'r1', headcount: 0, adultSupervisorPresent: false }
    expect(groupsPresentValid([])).toBe(true)
    expect(groupsPresentValid([session, rental])).toBe(true)
    expect(groupsPresentValid([session, { ...session, headcount: 3 }])).toBe(false)
    expect(groupsPresentValid([{ headcount: 1, adultSupervisorPresent: true }])).toBe(false)
    expect(groupsPresentValid([{ ...rental, headcount: -1 }])).toBe(false)
    expect(groupsPresentValid([{ ...rental, headcount: HEADCOUNT_MAX + 1 }])).toBe(false)
    expect(groupsPresentValid([{ ...rental, headcount: 2.5 }])).toBe(false)
  })

  it('lists the sessions and the rentals the groups name', () => {
    expect(
      groupReferences([
        { occurrenceId: 'o1', headcount: 1, adultSupervisorPresent: true },
        { rentalId: 'r1', headcount: 1, adultSupervisorPresent: true },
      ]),
    ).toEqual({ occurrenceIds: ['o1'], rentalIds: ['r1'] })
  })
})
