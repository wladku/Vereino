// The header of every public club page (navigation spec REQ-N09, mockup `publicShell`; E09-S07 #261): the club's logo
// and name linking to its page, then Club · Sections · Facilities · Events · Sign in and the header's end (the language
// switcher). One labelled `nav` landmark with `aria-current` on the current link (`publicNavLinks`). From 768 px (`md`)
// everything sits in one row and a long club name truncates before any link loses room (#488); below that the links
// sit on a second row that scrolls sideways. A page that does not know its club yet (loading, an error, a missing page)
// shows only its title. Framework-free and without state: the router's link component, the current path, the links'
// flags (`publicNavLinks`) and every string come in through props. The club's colour (#486) draws a strip along the top
// of the header and the fallback logo's box; the frame sets the colour (`clubAccentStyle`) on its root element.
import * as React from 'react'
import type { MemberLinkProps } from '#tsx/member/member-shell'
import { publicClubHref, publicNavLinks, type PublicHeaderLabels, type PublicNavFlags } from '#src/public/public-nav'

/** A club logo, or the initial of its name in its place (glossary *Logo*: never an empty image). */
export type PublicHeaderLogo = { url: string | null; source: string; initial: string }

/** The router's link component; it forwards `aria-current` and `data-testid` to the anchor. */
export type PublicLinkProps = Omit<MemberLinkProps, 'aria-current'> & {
  'aria-current'?: 'page' | 'location'
  'data-testid'?: string
}

export type PublicHeaderClub = { name: string; slug: string; logo: PublicHeaderLogo; nav: PublicNavFlags }

export type PublicHeaderProps = {
  /** `null` while the page does not know its club: the header shows `title` and no links. */
  club: PublicHeaderClub | null
  /** The page family's name, shown in place of the club. */
  title: string
  labels: PublicHeaderLabels
  /** The current path, which marks the current link. */
  pathname: string
  Link: React.ComponentType<PublicLinkProps>
  /** The month grid of a facility needs a wider page than text. */
  wide?: boolean
  headerEnd?: React.ReactNode
}

const NAV_LINK_CLASS =
  'focus-visible:focus-indicator inline-flex min-h-11 items-center rounded-md px-2 text-sm whitespace-nowrap outline-none'
const NAV_CURRENT_CLASS = `${NAV_LINK_CLASS} text-foreground font-semibold underline underline-offset-4`
const NAV_IDLE_CLASS = `${NAV_LINK_CLASS} text-muted-foreground hover:text-foreground`

/** Decorative: the club's name stands next to it. The initial sits on the club's colour (#486). */
function LogoMark({ logo }: { logo: PublicHeaderLogo }) {
  if (logo.url) {
    return (
      <img
        src={logo.url}
        alt=""
        width={40}
        height={40}
        className="bg-muted size-10 shrink-0 rounded-md object-contain"
        data-testid="public-logo"
        data-logo-source={logo.source}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="bg-club-accent text-club-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-md text-lg font-semibold"
      data-testid="public-logo-initial"
      data-logo-source="initial"
    >
      {logo.initial}
    </span>
  )
}

export function PublicHeader({ club, title, labels, pathname, Link, wide = false, headerEnd }: PublicHeaderProps) {
  const width = wide ? 'max-w-5xl' : 'max-w-3xl'
  const end = headerEnd ? (
    <div className="order-2 shrink-0 md:order-3" data-testid="public-header-end">
      {headerEnd}
    </div>
  ) : null
  if (!club) {
    return (
      <header className="bg-card border-b" data-testid="public-header">
        <div className={`mx-auto flex ${width} flex-wrap items-center justify-between gap-3 px-4 py-3`}>
          <span className="text-muted-foreground text-sm" data-testid="public-header-title">
            {title}
          </span>
          {end}
        </div>
      </header>
    )
  }
  const links = publicNavLinks({ slug: club.slug, nav: club.nav, pathname, labels })
  return (
    <header className="bg-card border-b" data-testid="public-header">
      <div aria-hidden="true" className="bg-club-accent h-1" data-testid="public-header-accent" />
      <div
        className={`mx-auto flex ${width} flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 md:flex-nowrap`}
      >
        {/* The name takes the room the links leave and truncates (its full text in `title`, #488); the links keep
            their own width and scroll only once the name is down to its minimum, so a long name never covers them. */}
        <div className="order-1 flex min-w-0 flex-1 basis-0 md:min-w-24" data-testid="public-header-club">
          <Link
            href={publicClubHref(club.slug)}
            className="text-foreground flex min-h-11 min-w-0 items-center gap-3 rounded-md font-semibold"
            data-testid="public-club-link"
          >
            <LogoMark logo={club.logo} />
            <span className="truncate" title={club.name} data-testid="public-header-club-name">
              {club.name}
            </span>
          </Link>
        </div>
        <nav
          aria-label={labels.nav}
          className="order-3 -mx-2 w-full overflow-x-auto md:order-2 md:mx-0 md:w-auto md:min-w-0"
          data-testid="public-nav"
        >
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.id} className="shrink-0">
                <Link
                  href={link.href}
                  className={link.current ? NAV_CURRENT_CLASS : NAV_IDLE_CLASS}
                  aria-current={link.current || undefined}
                  data-testid={`public-nav-${link.id}`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {end}
      </div>
    </header>
  )
}
