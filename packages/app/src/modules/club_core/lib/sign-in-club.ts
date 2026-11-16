// The club the sign-in page shows (navigation spec REQ-N10, DD-N10, Q-N01; M-01; E09-S07 #261): the public slug of
// `?club=` — the public header's "Sign in" link carries it — or, without one, the `vereino_club` cookie the sign-in
// page wrote once such a slug resolved to a club that publishes its page. A malformed slug shows the neutral page,
// like an unknown one. The cookie holds only the public slug (`Path=/`, one year, `SameSite=Lax`, `Secure` over
// HTTPS); the page's client part writes it and deletes one that no longer resolves, so it is not `HttpOnly`.
import { isPublicSlug } from './publication'

export const SIGN_IN_CLUB_COOKIE = 'vereino_club'

/** One year, in seconds. */
export const SIGN_IN_CLUB_COOKIE_MAX_AGE = 31_536_000

/** Where the slug came from: only a slug from the link is remembered, only a remembered one is forgotten. */
export type SignInClub = { slug: string; source: 'query' | 'cookie' }

/** The club to show: `?club=` when the link has one (even a malformed one, which shows none), else the cookie. */
export function signInClub(query: string | string[] | undefined, cookie: string | undefined): SignInClub | null {
  if (query !== undefined) {
    return typeof query === 'string' && isPublicSlug(query) ? { slug: query, source: 'query' } : null
  }
  return cookie !== undefined && isPublicSlug(cookie) ? { slug: cookie, source: 'cookie' } : null
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
