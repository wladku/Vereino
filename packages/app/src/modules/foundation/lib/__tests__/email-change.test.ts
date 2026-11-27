import { describe, expect, it } from '@jest/globals'
import { isEmailChangeConfirmed, markEmailChangeConfirmed } from '../email-change'

describe('the e-mail change confirmation mark (ENG-Q-12, #737)', () => {
  it('marks a copy of the auth context for one e-mail, compared trimmed and lower-case', () => {
    const auth = { sub: 'u-1', roles: ['vereino_member'] }
    const marked = markEmailChangeConfirmed(auth, ' New@Example.com ')
    expect(marked).toMatchObject(auth)
    expect(isEmailChangeConfirmed(marked, 'new@example.com')).toBe(true)
    expect(isEmailChangeConfirmed(marked, 'other@example.com')).toBe(false)
    expect(isEmailChangeConfirmed(auth, 'new@example.com')).toBe(false)
  })

  it('survives a spread of the auth context and is invisible to JSON', () => {
    const marked = markEmailChangeConfirmed({ sub: 'u-1' }, 'new@example.com')
    expect(isEmailChangeConfirmed({ ...marked }, 'new@example.com')).toBe(true)
    expect(JSON.parse(JSON.stringify(marked))).toEqual({ sub: 'u-1' })
  })

  it('refuses a missing or non-object auth context', () => {
    expect(isEmailChangeConfirmed(null, 'new@example.com')).toBe(false)
    expect(isEmailChangeConfirmed('token', 'new@example.com')).toBe(false)
  })
})
