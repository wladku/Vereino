import { describe, expect, it } from '@jest/globals'
import {
  SIGN_IN_CLUB_COOKIE,
  SIGN_IN_CLUB_COOKIE_MAX_AGE,
  forgetClubCookie,
  rememberClubCookie,
  signInClub,
} from '../sign-in-club'

describe('sign-in club (navigation spec REQ-N10, DD-N10; #261)', () => {
  it('takes the slug of the link before the cookie', () => {
    expect(signInClub('ks-avocado', 'other-club')).toEqual({ slug: 'ks-avocado', source: 'query' })
  })

  it('shows no club for a malformed or repeated link slug, even with a cookie', () => {
    expect(signInClub('KS Avocado', 'other-club')).toBeNull()
    expect(signInClub(['ks-avocado', 'other-club'], 'other-club')).toBeNull()
    expect(signInClub('', 'other-club')).toBeNull()
  })

  it('falls back to a well-formed cookie, else no club', () => {
    expect(signInClub(undefined, 'ks-avocado')).toEqual({ slug: 'ks-avocado', source: 'cookie' })
    expect(signInClub(undefined, '<script>')).toBeNull()
    expect(signInClub(undefined, undefined)).toBeNull()
  })

  it('remembers the slug for a year, Lax, Secure over HTTPS only', () => {
    expect(SIGN_IN_CLUB_COOKIE).toBe('vereino_club')
    expect(SIGN_IN_CLUB_COOKIE_MAX_AGE).toBe(365 * 24 * 60 * 60)
    expect(rememberClubCookie('ks-avocado', true)).toBe(
      'vereino_club=ks-avocado; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
    )
    expect(rememberClubCookie('ks-avocado', false)).toBe(
      'vereino_club=ks-avocado; Path=/; Max-Age=31536000; SameSite=Lax',
    )
  })

  it('forgets the club with the same attributes and Max-Age=0', () => {
    expect(forgetClubCookie(true)).toBe('vereino_club=; Path=/; Max-Age=0; SameSite=Lax; Secure')
    expect(forgetClubCookie(false)).toBe('vereino_club=; Path=/; Max-Age=0; SameSite=Lax')
  })
})
