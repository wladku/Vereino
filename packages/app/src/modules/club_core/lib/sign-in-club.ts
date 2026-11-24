// The club the sign-in page shows (navigation spec REQ-N10, DD-N10, Q-N01; M-01; E09-S07 #261): the public slug of
// `?club=` — the public header's "Sign in" link carries it — or, without one, the `vereino_club` cookie the sign-in
// page wrote once such a slug resolved to a club that publishes its page. A malformed slug shows the neutral page,
// like an unknown one. The cookie holds only the public slug (`Path=/`, one year, `SameSite=Lax`, `Secure` over
// HTTPS); the page's client part writes it and deletes one whose slug no longer resolves — also when the link names
// that slug — so it is not `HttpOnly`.
import { isPublicSlug } from './publication'

export const SIGN_IN_CLUB_COOKIE = 'vereino_club'

/** One year, in seconds. */
export const SIGN_IN_CLUB_COOKIE_MAX_AGE = 31_536_000

/**
 * Where the slug came from: only a slug from the link is remembered, only a remembered one is forgotten; `host` is the
 * club of the address the page is on (many clubs spec phase 3, #631), never written to the cookie.
 */
export type SignInClub = { slug: string; source: 'query' | 'cookie' | 'host' }

/** The club to show: `?club=` when the link has one (even a malformed one, which shows none), else the cookie. */
export function signInClub(query: string | string[] | undefined, cookie: string | undefined): SignInClub | null {
  if (query !== undefined) {
    return typeof query === 'string' && isPublicSlug(query) ? { slug: query, source: 'query' } : null
  }
  return cookie !== undefined && isPublicSlug(cookie) ? { slug: cookie, source: 'cookie' } : null
}

/** The slug the cookie holds in a `Cookie` header or `document.cookie` string, if any. */
export function rememberedClub(cookies: string): string | undefined {
  for (const entry of cookies.split(';')) {
    const [name, ...value] = entry.trim().split('=')
    if (name === SIGN_IN_CLUB_COOKIE) return decodeURIComponent(value.join('='))
  }
  return undefined
}

const cookieAttributes = (maxAge: number, secure: boolean): string =>
  `Path=/; Max-Age=${String(maxAge)}; SameSite=Lax${secure ? '; Secure' : ''}`

/** The `document.cookie` assignment that remembers the club for a year. */
export function rememberClubCookie(slug: string, secure: boolean): string {
  return `${SIGN_IN_CLUB_COOKIE}=${encodeURIComponent(slug)}; ${cookieAttributes(SIGN_IN_CLUB_COOKIE_MAX_AGE, secure)}`
}

/** The `document.cookie` assignment that forgets the club (the same attributes, `Max-Age=0`). */
export function forgetClubCookie(secure: boolean): string {
  return `${SIGN_IN_CLUB_COOKIE}=; ${cookieAttributes(0, secure)}`
}
