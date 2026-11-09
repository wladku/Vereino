import { describe, expect, it } from '@jest/globals'
import {
  INCIDENT_ACTIONS,
  INCIDENT_CLOCK_SKEW_MS,
  INCIDENT_DESCRIPTION_MAX_LENGTH,
  INCIDENT_DESCRIPTION_MIN_LENGTH,
  INCIDENT_INVOLVED_MAX_LENGTH,
  INCIDENT_KINDS,
  incidentDescriptionValid,
  incidentTimeAllowed,
  normalizedActions,
} from '../incidents'

describe('incidents (REQ-016, M-12)', () => {
  it('names no health category among the kinds', () => {
    expect(INCIDENT_KINDS).toContain('rules_violation')
    expect(INCIDENT_KINDS.some((kind) => /injur|health|ill/.test(kind))).toBe(false)
    expect(INCIDENT_ACTIONS[0]).toBe('none')
    expect(INCIDENT_INVOLVED_MAX_LENGTH).toBe(1000)
  })

  it('takes a description of 10–2000 characters, trimmed', () => {
    expect(INCIDENT_DESCRIPTION_MIN_LENGTH).toBe(10)
    expect(INCIDENT_DESCRIPTION_MAX_LENGTH).toBe(2000)
    expect(incidentDescriptionValid('Short')).toBe(false)
    expect(incidentDescriptionValid('   123456789   ')).toBe(false)
    expect(incidentDescriptionValid('1234567890')).toBe(true)
    expect(incidentDescriptionValid('x'.repeat(2000))).toBe(true)
    expect(incidentDescriptionValid('x'.repeat(2001))).toBe(false)
  })

  it('refuses an incident in the future beyond the clock skew', () => {
    const now = new Date('2026-11-10T18:00:00Z')
    expect(incidentTimeAllowed(new Date('2026-11-10T17:00:00Z'), now)).toBe(true)
    expect(incidentTimeAllowed(new Date(now.getTime() + INCIDENT_CLOCK_SKEW_MS), now)).toBe(true)
    expect(incidentTimeAllowed(new Date(now.getTime() + INCIDENT_CLOCK_SKEW_MS + 1), now)).toBe(false)
  })

  it('orders the actions, drops repeats and keeps `none` only alone', () => {
    expect(normalizedActions([])).toEqual([])
    expect(normalizedActions(['none'])).toEqual(['none'])
    expect(normalizedActions(['police_called', 'none', 'warning_given', 'police_called'])).toEqual([
      'warning_given',
      'police_called',
    ])
  })
})
