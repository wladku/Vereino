// The links of the public header (navigation spec REQ-N09, mockup `publicShell`; E09-S07 #261): Club · Sections ·
// Facilities · Events · Sign in. "Facilities" only while the club publishes its facility calendars and "Events" only
// while it publishes events (`club.nav` of every public response); "Sign in" carries the club's public slug so the
// sign-in page can show the club (DD-N10). The current page's link is marked; "Sign in" leaves the public pages and is
// never current. Framework-free: the labels come in, the hrefs go out.

/** Which optional links the club publishes (`club.nav` of the public responses). */
export type PublicNavFlags = { facilities: boolean; events: boolean }

export type PublicNavLinkId = 'club' | 'sections' | 'facilities' | 'events' | 'signIn'

/** The strings of the header: the landmark's name and one label per link. */
export const PUBLIC_HEADER_LABEL_KEYS = ['nav', 'club', 'sections', 'facilities', 'events', 'signIn'] as const

export type PublicHeaderLabels = Record<(typeof PUBLIC_HEADER_LABEL_KEYS)[number], string>

export type PublicNavLink = { id: PublicNavLinkId; href: string; label: string; current: boolean }

/** The club page of a public slug. */
export const publicClubHref = (slug: string): string => `/p/${encodeURIComponent(slug)}`

/** The sign-in page that shows the club of this public slug. */
export const publicSignInHref = (slug: string): string => `/login?club=${encodeURIComponent(slug)}`

/** True when `pathname` is `base` or a page below it. */
const isAtOrBelow = (pathname: string, base: string): boolean => pathname === base || pathname.startsWith(`${base}/`)

/** The header links in their order, each with its href and whether it is the current page's link. */
export function publicNavLinks(input: {
  slug: string
  nav: PublicNavFlags
  pathname: string
  labels: PublicHeaderLabels
}): PublicNavLink[] {
  const { slug, nav, labels } = input
  const pathname = input.pathname.replace(/\/+$/, '')
  const club = publicClubHref(slug)
  const facilities = `${club}/places`
  const events = `${club}/events`
  const links: PublicNavLink[] = [
    { id: 'club', href: club, label: labels.club, current: pathname === club },
    {
      id: 'sections',
      href: `${club}#sections`,
      label: labels.sections,
      current: isAtOrBelow(pathname, `${club}/sections`),
    },
  ]
  if (nav.facilities) {
    links.push({
      id: 'facilities',
      href: facilities,
      label: labels.facilities,
      current: isAtOrBelow(pathname, facilities),
    })
  }
  if (nav.events) {
    links.push({ id: 'events', href: events, label: labels.events, current: isAtOrBelow(pathname, events) })
  }
  links.push({ id: 'signIn', href: publicSignInHref(slug), label: labels.signIn, current: false })
  return links
}
