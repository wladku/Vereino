// #76: an account with no linked club person is refused with 403 `scope_unlinked`; a linked user outside the record's
// grants keeps 403 `scope_denied`.
import { describe, expect, it } from '@jest/globals'
import type { Scope } from '@vereino/core'
import { isUnlinkedScope, refusesUnlinked, scopeDenialCode } from '../scope-denial'

const USER = '00000000-0000-4000-8000-000000000001'
const PERSON = '00000000-0000-4000-8000-000000000002'
const SECTION = '00000000-0000-4000-8000-000000000003'

const unlinked: Scope = [{ kind: 'self_user', ids: [USER] }]
const member: Scope = [
  { kind: 'self', ids: [PERSON] },
  { kind: 'self_user', ids: [USER] },
]
const coordinator: Scope = [
  { kind: 'coordinator', ids: [SECTION] },
  { kind: 'self', ids: [PERSON] },
  { kind: 'self_user', ids: [USER] },
]
const job: Scope = [{ kind: 'system_job' }]

describe('isUnlinkedScope', () => {
  it('is true for a scope holding only self_user (no linked person)', () => {
    expect(isUnlinkedScope(unlinked)).toBe(true)
  })

  it('is false once any other grant is present: a linked person always carries self', () => {
    expect(isUnlinkedScope(member)).toBe(false)
    expect(isUnlinkedScope(coordinator)).toBe(false)
    expect(isUnlinkedScope(job)).toBe(false)
  })

  it('is false for an empty scope (no session user)', () => {
    expect(isUnlinkedScope([])).toBe(false)
  })
})

describe('scopeDenialCode', () => {
  it('answers scope_unlinked for an unlinked user', () => {
    expect(scopeDenialCode(unlinked)).toBe('scope_unlinked')
  })

  it('keeps scope_denied for a linked user outside the grants, a job and an empty scope', () => {
    expect(scopeDenialCode(coordinator)).toBe('scope_denied')
    expect(scopeDenialCode(member)).toBe('scope_denied')
    expect(scopeDenialCode(job)).toBe('scope_denied')
    expect(scopeDenialCode([])).toBe('scope_denied')
  })
})

describe('refusesUnlinked', () => {
  it('refuses an unlinked user up front when the kinds do not accept self_user', () => {
    expect(refusesUnlinked(unlinked, ['club_admin'])).toBe(true)
    expect(refusesUnlinked(unlinked, ['coach', 'coordinator', 'club_admin'])).toBe(true)
  })

  it('leaves the check to the target when the kinds accept self_user', () => {
    expect(refusesUnlinked(unlinked, ['self_user', 'club_admin'])).toBe(false)
  })

  it('never refuses a linked user up front', () => {
    expect(refusesUnlinked(coordinator, ['club_admin'])).toBe(false)
    expect(refusesUnlinked(member, ['club_admin'])).toBe(false)
  })
})
