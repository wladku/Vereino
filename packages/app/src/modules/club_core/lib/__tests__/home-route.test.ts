import { describe, expect, it } from '@jest/globals'
import { HOME_CLUB_SLUG_ENV, homeClubSlug, homeRedirect } from '../home-route'

describe('homeClubSlug', () => {
  it('reads the configured slug, trimmed and lower-cased', () => {
    expect(homeClubSlug({ [HOME_CLUB_SLUG_ENV]: '  KS-Orzel ' })).toBe('ks-orzel')
  })

  it('is null when the variable is unset or empty', () => {
    expect(homeClubSlug({})).toBeNull()
    expect(homeClubSlug({ [HOME_CLUB_SLUG_ENV]: '   ' })).toBeNull()
  })

  it('is null for a value that is not a public slug', () => {
    expect(homeClubSlug({ [HOME_CLUB_SLUG_ENV]: 'ks orzeł/../x' })).toBeNull()
  })
})

describe('homeRedirect', () => {
  it('sends a signed-in visitor into the app', () => {
    expect(homeRedirect({ authenticated: true, publishedClubSlug: 'ks-orzel' })).toBe('/backend')
    expect(homeRedirect({ authenticated: true, publishedClubSlug: null })).toBe('/backend')
  })

  it('sends a guest to the published club page', () => {
    expect(homeRedirect({ authenticated: false, publishedClubSlug: 'ks-orzel' })).toBe('/p/ks-orzel')
  })

  it('sends a guest to the sign-in page when no club page is published', () => {
    expect(homeRedirect({ authenticated: false, publishedClubSlug: null })).toBe('/login')
  })
})
