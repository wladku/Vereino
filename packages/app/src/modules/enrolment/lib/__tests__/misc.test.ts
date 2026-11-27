import { describe, expect, it } from '@jest/globals'
import { decidesSection, deciderSections, readerRole } from '../access'
import { ENROLMENT_CLUB_JOBS } from '../club-jobs'
import { ENROLMENT_CLUB_TABLES } from '../club-tables'
import { errorCodes } from '../error-codes'
import {
  BACKEND_APPLICATIONS_HREF,
  CLUB_APPLICATIONS_HREF,
  applicationConfirmPath,
  applicationStatusPath,
  applyPath,
  backendApplicationHref,
  clubApplicationHref,
  clubPagePath,
  groupApplyPath,
  groupSignUpCodeApi,
  linkedGroup,
  publicApplicationsApi,
  publicSectionApi,
} from '../paths'

describe('deciderSections (BR-J5)', () => {
  it('gives an administrator every section and a coordinator their own', () => {
    expect(deciderSections([{ kind: 'club_admin' }, { kind: 'coordinator', ids: ['s1'] }])).toBe('all')
    expect(
      deciderSections([
        { kind: 'coordinator', ids: ['s2', 's1'] },
        { kind: 'coordinator' },
        { kind: 'coach', ids: ['g1'] },
      ]),
    ).toEqual(['s1', 's2'])
    expect(deciderSections([])).toEqual([])
    expect(decidesSection('all', 'x')).toBe(true)
    expect(decidesSection(['s1'], 's1')).toBe(true)
    expect(decidesSection(['s1'], 's2')).toBe(false)
    expect(readerRole('all')).toBe('club_admin')
    expect(readerRole(['s1'])).toBe('coordinator')
  })
})

describe('module tables, jobs and codes', () => {
  it('declares valid, unique jobs and tables of this module', () => {
    const keys = ENROLMENT_CLUB_JOBS.map((job) => job.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const job of ENROLMENT_CLUB_JOBS) {
      expect(job.key).toMatch(/^enrolment:[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
      expect(job.description.length).toBeGreaterThan(0)
    }
    for (const table of ENROLMENT_CLUB_TABLES) expect(table.startsWith('enrolment_')).toBe(true)
    expect(new Set(ENROLMENT_CLUB_TABLES).size).toBe(ENROLMENT_CLUB_TABLES.length)
  })

  it('declares each error code once with an enrolment message key', () => {
    const codes = errorCodes.map((entry) => entry.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const entry of errorCodes) expect(entry.messageKey).toBe(`enrolment.errors.${entry.code}`)
  })
})

describe('paths', () => {
  it('builds the public and member paths', () => {
    expect(clubPagePath('ks orzel')).toBe('/p/ks%20orzel')
    expect(applyPath('ks orzel', 'pilka')).toBe('/p/ks%20orzel/sections/pilka/apply')
    expect(applicationConfirmPath('ks', 'ab')).toBe('/p/ks/applications/confirm/ab')
    expect(applicationStatusPath('ks', 'ab')).toBe('/p/ks/applications/status/ab')
    expect(publicApplicationsApi('ks')).toBe('/api/enrolment/public/ks/applications')
    expect(publicSectionApi('ks', 'pilka')).toBe('/api/enrolment/public/ks/sections/pilka')
    expect(clubApplicationHref('1')).toBe(`${CLUB_APPLICATIONS_HREF}/1`)
    expect(backendApplicationHref('1')).toBe(`${BACKEND_APPLICATIONS_HREF}/1`)
  })
})

describe('the group sign-up code (#869)', () => {
  it('builds the form address with the group and the member API', () => {
    expect(groupApplyPath('ks orzel', 'pilka', 'g 1')).toBe('/p/ks%20orzel/sections/pilka/apply?group=g%201')
    expect(groupSignUpCodeApi('g/1')).toBe('/api/enrolment/groups/g%2F1/sign-up-code')
  })

  it('chooses an offered group, closes for any other and ignores a missing parameter', () => {
    expect(linkedGroup(undefined, ['g1'])).toEqual({ status: 'none' })
    expect(linkedGroup('  ', ['g1'])).toEqual({ status: 'none' })
    expect(linkedGroup([], ['g1'])).toEqual({ status: 'none' })
    expect(linkedGroup(' g1 ', ['g1'])).toEqual({ status: 'chosen', groupId: 'g1' })
    expect(linkedGroup(['g1', 'g2'], ['g1'])).toEqual({ status: 'chosen', groupId: 'g1' })
    expect(linkedGroup('g2', ['g1'])).toEqual({ status: 'closed' })
  })
})
