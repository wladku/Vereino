// The per-club job declarations of `payments` (many-clubs spec DD-M04; #629): unique keys `payments:<name>`, a local
// `HH:MM` or a whole number of minutes, and a description.
import { describe, expect, it } from '@jest/globals'
import { PAYMENTS_CLUB_JOBS } from '../club-jobs'

describe('PAYMENTS_CLUB_JOBS', () => {
  it('declares valid, unique jobs of this module', () => {
    const keys = PAYMENTS_CLUB_JOBS.map((job) => job.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const job of PAYMENTS_CLUB_JOBS) {
      expect(job.key).toMatch(/^payments:[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
      expect(job.description.length).toBeGreaterThan(0)
      if ('dailyAt' in job.schedule) expect(job.schedule.dailyAt).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/)
      else expect(Number.isInteger(job.schedule.everyMinutes) && job.schedule.everyMinutes > 0).toBe(true)
    }
  })
})
