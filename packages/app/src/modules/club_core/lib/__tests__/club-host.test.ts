// Many clubs spec phase 3 (DD-M02, DD-M03, REQ-M02; #631): the club of a request from its `Host` header, and where `/`,
// the public pages, the reset pages and a session of another club go on a club's address.
import { describe, expect, it } from '@jest/globals'
import { CLUB_DOMAIN_ENV } from '@vereino/core'
import {
  clubHostHome,
  instancePageRedirect,
  publicPageRedirect,
  requestHost,
  sessionHostRedirect,
  signInTenantRedirect,
} from '../club-host'

const ENV = { [CLUB_DOMAIN_ENV]: 'vereino.pl', APP_URL: 'https://app.vereino.pl' }
const TEST_ENV = { [CLUB_DOMAIN_ENV]: 'localhost:3123', APP_URL: 'http://127.0.0.1:3123' }

describe('requestHost', () => {
  it('is a one-club instance without a club domain', () => {
    expect(requestHost('orlik.vereino.pl', { APP_URL: 'https://app.vereino.pl' })).toEqual({ kind: 'single' })
  })

  it('reads the club from its subdomain, on any port when the domain has none', () => {
    expect(requestHost('Orlik.Vereino.pl', ENV)).toEqual({ kind: 'club', slug: 'orlik' })
    expect(requestHost('orlik.vereino.pl:8443', ENV)).toEqual({ kind: 'club', slug: 'orlik' })
  })

  it('matches the port when the domain names one', () => {
    expect(requestHost('orlik.localhost:3123', TEST_ENV)).toEqual({ kind: 'club', slug: 'orlik' })
    expect(requestHost('orlik.localhost:4000', TEST_ENV)).toEqual({ kind: 'unknown' })
    expect(requestHost('localhost:3123', TEST_ENV)).toEqual({ kind: 'instance' })
  })

  it('is the instance on the bare domain, www and the host of APP_URL', () => {
    expect(requestHost('vereino.pl', ENV)).toEqual({ kind: 'instance' })
    expect(requestHost('www.vereino.pl', ENV)).toEqual({ kind: 'instance' })
    expect(requestHost('app.vereino.pl', ENV)).toEqual({ kind: 'instance' })
    expect(requestHost('127.0.0.1:3123', TEST_ENV)).toEqual({ kind: 'instance' })
  })

  it('is unknown for another host, a reserved, malformed or nested label and a missing header', () => {
    expect(requestHost('example.org', ENV)).toEqual({ kind: 'unknown' })
    expect(requestHost('evilvereino.pl', ENV)).toEqual({ kind: 'unknown' })
    expect(requestHost('api.vereino.pl', ENV)).toEqual({ kind: 'unknown' })
    expect(requestHost('a.b.vereino.pl', ENV)).toEqual({ kind: 'unknown' })
    expect(requestHost('x.vereino.pl', ENV)).toEqual({ kind: 'unknown' })
    expect(requestHost(null, ENV)).toEqual({ kind: 'unknown' })
    expect(requestHost(undefined, ENV)).toEqual({ kind: 'unknown' })
    expect(requestHost('  ', ENV)).toEqual({ kind: 'unknown' })
  })

  it('ignores an APP_URL that is not a URL', () => {
    expect(requestHost('vereino.pl', { [CLUB_DOMAIN_ENV]: 'vereino.pl', APP_URL: 'nope' })).toEqual({
      kind: 'instance',
    })
    expect(requestHost('orlik.vereino.pl', { [CLUB_DOMAIN_ENV]: 'vereino.pl' })).toEqual({
      kind: 'club',
      slug: 'orlik',
    })
  })
})

describe('publicPageRedirect', () => {
  const page = { clubSlug: 'orlik', pathAndQuery: '/p/orlik/events?section=u10', env: ENV }

  it('keeps every page on a one-club instance and on the club’s own address', () => {
    expect(publicPageRedirect({ ...page, host: { kind: 'single' } })).toBeNull()
    expect(publicPageRedirect({ ...page, host: { kind: 'club', slug: 'orlik' } })).toBeNull()
  })

  it('sends the page to the club’s address from any other host', () => {
    const target = 'https://orlik.vereino.pl/p/orlik/events?section=u10'
    expect(publicPageRedirect({ ...page, host: { kind: 'instance' } })).toBe(target)
    expect(publicPageRedirect({ ...page, host: { kind: 'club', slug: 'other' } })).toBe(target)
    expect(publicPageRedirect({ ...page, host: { kind: 'unknown' } })).toBe(target)
  })

  it('keeps the page when the club address cannot be built', () => {
    expect(publicPageRedirect({ ...page, clubSlug: '', host: { kind: 'instance' } })).toBeNull()
  })
})

describe('instancePageRedirect', () => {
  it('sends the reset pages on a club’s address to APP_URL', () => {
    const host = { kind: 'club', slug: 'orlik' } as const
    expect(instancePageRedirect({ host, pathAndQuery: '/reset', env: ENV })).toBe('https://app.vereino.pl/reset')
    expect(instancePageRedirect({ host, pathAndQuery: '/reset/abc?tenant=t1', env: ENV })).toBe(
      'https://app.vereino.pl/reset/abc?tenant=t1',
    )
  })

  it('keeps other pages, other hosts and an instance without APP_URL', () => {
    const host = { kind: 'club', slug: 'orlik' } as const
    expect(instancePageRedirect({ host, pathAndQuery: '/resets', env: ENV })).toBeNull()
    expect(instancePageRedirect({ host, pathAndQuery: '/club', env: ENV })).toBeNull()
    expect(instancePageRedirect({ host: { kind: 'instance' }, pathAndQuery: '/reset', env: ENV })).toBeNull()
    expect(instancePageRedirect({ host, pathAndQuery: '/reset', env: { [CLUB_DOMAIN_ENV]: 'vereino.pl' } })).toBeNull()
  })
})

describe('sessionHostRedirect', () => {
  const base = { sessionTenantId: 't-a', ownClubOrigin: 'https://a.vereino.pl', path: '/backend', env: ENV }

  it('keeps a session on its own club’s address and on any host that is not a club’s', () => {
    expect(
      sessionHostRedirect({ ...base, host: { kind: 'club', slug: 'a' }, hostClub: { tenantId: 't-a' } }),
    ).toBeNull()
    expect(sessionHostRedirect({ ...base, host: { kind: 'instance' }, hostClub: null })).toBeNull()
    expect(sessionHostRedirect({ ...base, host: { kind: 'single' }, hostClub: null })).toBeNull()
  })

  it('sends a session of another club to its own club’s address', () => {
    const host = { kind: 'club', slug: 'b' } as const
    expect(sessionHostRedirect({ ...base, host, hostClub: { tenantId: 't-b' } })).toBe('https://a.vereino.pl/backend')
    expect(sessionHostRedirect({ ...base, host, hostClub: null })).toBe('https://a.vereino.pl/backend')
    expect(sessionHostRedirect({ ...base, sessionTenantId: null, host, hostClub: { tenantId: 't-b' } })).toBe(
      'https://a.vereino.pl/backend',
    )
  })

  it('falls back to APP_URL, or a relative path, when the own club has no address', () => {
    const host = { kind: 'club', slug: 'b' } as const
    expect(sessionHostRedirect({ ...base, ownClubOrigin: null, host, hostClub: { tenantId: 't-b' } })).toBe(
      'https://app.vereino.pl/backend',
    )
    expect(sessionHostRedirect({ ...base, ownClubOrigin: null, env: {}, host, hostClub: { tenantId: 't-b' } })).toBe(
      '/backend',
    )
  })
})

describe('clubHostHome', () => {
  it('is not found on an unknown host and for a label that names no club', () => {
    expect(clubHostHome({ host: { kind: 'unknown' }, authenticated: false, hostClub: null })).toEqual({
      kind: 'not_found',
    })
    expect(clubHostHome({ host: { kind: 'club', slug: 'nope' }, authenticated: false, hostClub: null })).toEqual({
      kind: 'not_found',
    })
  })

  it('shows the landing page to a guest of the instance and sends a signed-in visitor into the app', () => {
    expect(clubHostHome({ host: { kind: 'instance' }, authenticated: false, hostClub: null })).toEqual({
      kind: 'landing',
    })
    expect(clubHostHome({ host: { kind: 'instance' }, authenticated: true, hostClub: null })).toEqual({
      kind: 'redirect',
      to: '/backend',
    })
  })

  it('routes a club’s address like the one-club home route', () => {
    const host = { kind: 'club', slug: 'orlik' } as const
    expect(clubHostHome({ host, authenticated: true, hostClub: { published: true } })).toEqual({
      kind: 'redirect',
      to: '/backend',
    })
    expect(clubHostHome({ host, authenticated: false, hostClub: { published: true } })).toEqual({
      kind: 'redirect',
      to: '/p/orlik',
    })
    expect(clubHostHome({ host, authenticated: false, hostClub: { published: false } })).toEqual({
      kind: 'redirect',
      to: '/login',
    })
  })
})

describe('signInTenantRedirect', () => {
  const host = { kind: 'club', slug: 'orlik' } as const

  it('adds the club’s tenant to the sign-in page, keeping the other parameters', () => {
    expect(
      signInTenantRedirect({ host, hostClub: { tenantId: 't-1' }, query: { redirect: '/club', tag: ['a', 'b'] } }),
    ).toBe('/login?redirect=%2Fclub&tag=a&tag=b&tenant=t-1')
    expect(
      signInTenantRedirect({ host, hostClub: { tenantId: 't-1' }, query: { tenant: 't-2', club: undefined } }),
    ).toBe('/login?tenant=t-1')
  })

  it('changes nothing with the club’s tenant, without a club or off a club’s address', () => {
    expect(signInTenantRedirect({ host, hostClub: { tenantId: 't-1' }, query: { tenant: 't-1' } })).toBeNull()
    expect(signInTenantRedirect({ host, hostClub: null, query: {} })).toBeNull()
    expect(signInTenantRedirect({ host: { kind: 'instance' }, hostClub: { tenantId: 't-1' }, query: {} })).toBeNull()
  })
})
