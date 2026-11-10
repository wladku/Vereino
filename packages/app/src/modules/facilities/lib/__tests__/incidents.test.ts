import { describe, expect, it } from '@jest/globals'
import {
  INCIDENT_ACTIONS,
  INCIDENT_CLOCK_SKEW_MS,
  INCIDENT_DESCRIPTION_MAX_LENGTH,
  INCIDENT_DESCRIPTION_MIN_LENGTH,
  INCIDENT_INVOLVED_MAX_LENGTH,
  INCIDENT_KINDS,
  INCIDENT_PHOTOS_MAX,
  INCIDENT_PHOTO_MAX_BYTES,
  checkIncidentPhoto,
  incidentDescriptionValid,
  nextIncidentPhotoPosition,
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

describe('incident photos (#126, M-12 "photo")', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  const pdf = new Uint8Array(Array.from('%PDF-1.7', (char) => char.charCodeAt(0)))

  it('accepts a raster photo up to 5 MB and refuses a PDF, an empty or a too large file', () => {
    expect(checkIncidentPhoto(png)).toEqual({ ok: true, file: { format: 'png', mimeType: 'image/png', size: 9 } })
    expect(checkIncidentPhoto(pdf)).toEqual({ ok: false, problem: 'format_unsupported' })
    expect(checkIncidentPhoto(new Uint8Array())).toEqual({ ok: false, problem: 'empty' })
    const large = new Uint8Array(INCIDENT_PHOTO_MAX_BYTES + 1)
    large.set(png)
    expect(checkIncidentPhoto(large)).toEqual({ ok: false, problem: 'too_large' })
  })

  it('places the next photo after the highest one and refuses a sixth', () => {
    expect(nextIncidentPhotoPosition([])).toBe(0)
    expect(nextIncidentPhotoPosition([0, 3, 1])).toBe(4)
    expect(nextIncidentPhotoPosition(Array.from({ length: INCIDENT_PHOTOS_MAX }, (_, index) => index))).toBeNull()
  })
})
