// The per-club job declarations of `payments` (many-clubs spec DD-M04; #629): every one is valid for the foundation's
// sweep, belongs to this module and has a worker file of its name.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from '@jest/globals'
import { assertClubJobDeclaration, parseClubJobKey } from '../../../foundation/lib/club-job-due'
import { PAYMENTS_CLUB_JOBS } from '../club-jobs'

describe('PAYMENTS_CLUB_JOBS', () => {
  it('declares valid, unique jobs of this module, each with its worker', () => {
    const keys = PAYMENTS_CLUB_JOBS.map((job) => job.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const job of PAYMENTS_CLUB_JOBS) {
      expect(() => assertClubJobDeclaration(job)).not.toThrow()
      const { module, name } = parseClubJobKey(job.key)
      expect(module).toBe('payments')
      expect(existsSync(path.join(__dirname, '..', '..', 'workers', `${name}.ts`))).toBe(true)
    }
  })
})
