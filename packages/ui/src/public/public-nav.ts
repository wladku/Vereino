// The links of the public header (navigation spec REQ-N09, mockup `publicShell`; E09-S07 #261): Club · Sections ·
// Facilities · Events · Sign in. "Facilities" only while the club publishes its facility calendars and "Events" only
// while it publishes events (`club.nav` of every public response); "Sign in" carries the club's public slug so the
// sign-in page can show the club (DD-N10). The current page's link is marked `page`; on a section page "Sections" is
// marked `location`, because it leads to the list of sections, not to the page itself. "Sign in" leaves the public
// pages and is never current. Framework-free: the labels come in, the hrefs go out.

/** Which optional links the club publishes (`club.nav` of the public responses). */
export type PublicNavFlags = { facilities: boolean; events: boolean }

export type PublicNavLinkId = 'club' | 'sections' | 'facilities' | 'events' | 'signIn'

/** The strings of the header: the landmark's name and one label per link. */
export const PUBLIC_HEADER_LABEL_KEYS = ['nav', 'club', 'sections', 'facilities', 'events', 'signIn'] as const

export type PublicHeaderLabels = Record<(typeof PUBLIC_HEADER_LABEL_KEYS)[number], string>

/** How a link is current: `page` for the page itself, `location` for the part of the site the page belongs to. */
export type PublicNavCurrent = 'page' | 'location' | false

export type PublicNavLink = { id: PublicNavLinkId; href: string; label: string; current: PublicNavCurrent }

/** The club page of a public slug. */
export const publicClubHref = (slug: string): string => `/p/${encodeURIComponent(slug)}`

/** The sign-in page that shows the club of this public slug. */
export const publicSignInHref = (slug: string): string => `/login?club=${encodeURIComponent(slug)}`

/** The club's default privacy notice page (E19-S03, #469). */
export const publicPrivacyHref = (slug: string): string => `${publicClubHref(slug)}/privacy`

/**
 * Where the footer's privacy-policy link of every public page leads (E19-S03, #469): the club's own address when it set
 * one on B-03 (#195), else the default notice page with the club's name.
 */
export function privacyPolicyHref(slug: string, clubUrl: string | null): { href: string; source: 'club' | 'default' } {
  return clubUrl ? { href: clubUrl, source: 'club' } : { href: publicPrivacyHref(slug), source: 'default' }
}

/** `page` when `pathname` is `base` or a page below it. */
const pageAtOrBelow = (pathname: string, base: string): PublicNavCurrent =>
  pathname === base || pathname.startsWith(`${base}/`) ? 'page' : false

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
    { id: 'club', href: club, label: labels.club, current: pathname === club ? 'page' : false },
    {
      id: 'sections',
      href: `${club}#sections`,
      label: labels.sections,
      current: pathname.startsWith(`${club}/sections/`) ? 'location' : false,
    },
  ]
  if (nav.facilities) {
    links.push({
      id: 'facilities',
      href: facilities,
      label: labels.facilities,
      current: pageAtOrBelow(pathname, facilities),
    })
  }
  if (nav.events) {
    links.push({ id: 'events', href: events, label: labels.events, current: pageAtOrBelow(pathname, events) })
  }
  links.push({ id: 'signIn', href: publicSignInHref(slug), label: labels.signIn, current: false })
  return links
}
