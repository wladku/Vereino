'use client'
// The frame of the public club pages (club spec UI table `/p/[clubSlug]`, DD-23; #29): the public header of
// `@vereino/ui` (the club logo and name linking to the club page, Club · Sections · Facilities · Events · Sign in and the
// language switcher; navigation spec REQ-N09, #261), the page body and the footer with the club name, its published
// phone (E06-S07, #89) and the club's rules and privacy-policy links (#195). Personal data never appears here; the club
// and section names are the club's own content and stay in its language.
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LanguageSwitcher } from '@open-mercato/ui/frontend/LanguageSwitcher'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PublicHeader, ClubAccentRoot, type PublicHeaderLabels } from '@vereino/ui'
import { phoneHref } from '../../lib/public-page'
import type { PublicClubAccent, PublicClubContact, PublicClubLinks, PublicClubNav, PublicLogo } from './public-client'

/**
 * A logo, or the initial of the name in its place (glossary *Logo*: never an empty image). Decorative: the name is next
 * to it. The initial sits on the club's colour (#486); `onAccent` inverts it for a logo inside the club-coloured hero.
 */
export function LogoMark({
  logo,
  size = 'md',
  onAccent = false,
}: {
  logo: PublicLogo
  size?: 'md' | 'lg'
  onAccent?: boolean
}) {
  const dimension = size === 'lg' ? 64 : 40
  const box = size === 'lg' ? 'size-16 text-2xl' : 'size-10 text-lg'
  if (logo.url) {
    return (
      <Image
        src={logo.url}
        alt=""
        width={dimension}
        height={dimension}
        unoptimized
        className={`${box} bg-muted shrink-0 rounded-md object-contain`}
        data-testid="public-logo"
        data-logo-source={logo.source}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} ${onAccent ? 'bg-club-accent-foreground text-club-accent' : 'bg-club-accent text-club-accent-foreground'} flex shrink-0 items-center justify-center rounded-md font-semibold`}
      data-testid="public-logo-initial"
      data-logo-source="initial"
    >
      {logo.initial}
    </span>
  )
}

/**
 * The footer of every public club page (README 3.1, E06-S07 #89): the club name and its published phone, which the
 * API sends only with the `contact` block, and the club's rules and privacy-policy links, each only when the club set
 * it on B-03 (#195).
 */
export function PublicFooter({ club }: { club: { name: string; contact: PublicClubContact; links: PublicClubLinks } }) {
  const t = useT()
  return (
    <footer className="bg-card border-t" data-testid="public-footer">
      <div className="text-muted-foreground mx-auto flex max-w-3xl flex-col gap-1 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-foreground font-medium" data-testid="public-footer-club">
          {club.name}
        </span>
        {club.contact ? (
          <span data-testid="public-footer-phone">
            {t('club_core.public.footer.phone')}{' '}
            <a
              className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6"
              href={phoneHref(club.contact.phone)}
            >
              {club.contact.phone}
            </a>
          </span>
        ) : null}
        {club.links.rules || club.links.privacyPolicy ? (
          <nav aria-label={t('club_core.public.footer.links')} data-testid="public-footer-links">
            <ul className="flex flex-wrap gap-x-4">
              {club.links.rules ? (
                <li>
                  <a
                    className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6"
                    href={club.links.rules}
                    rel="noopener noreferrer"
                    data-testid="public-footer-rules"
                  >
                    {t('club_core.public.footer.rules')}
                  </a>
                </li>
              ) : null}
              {club.links.privacyPolicy ? (
                <li>
                  <a
                    className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6"
                    href={club.links.privacyPolicy}
                    rel="noopener noreferrer"
                    data-testid="public-footer-privacy"
                  >
                    {t('club_core.public.footer.privacyPolicy')}
                  </a>
                </li>
              ) : null}
            </ul>
          </nav>
        ) : null}
      </div>
    </footer>
  )
}

/** The strings of the public header (`club_core.public.nav.*`). */
export function usePublicHeaderLabels(): PublicHeaderLabels {
  const t = useT()
  return {
    nav: t('club_core.public.nav.label'),
    club: t('club_core.public.nav.club'),
    sections: t('club_core.public.nav.sections'),
    facilities: t('club_core.public.nav.facilities'),
    events: t('club_core.public.nav.events'),
    signIn: t('club_core.public.nav.signIn'),
  }
}

export function PublicFrame({
  club,
  children,
}: {
  club: {
    name: string
    slug: string
    logo: PublicLogo
    contact: PublicClubContact
    links: PublicClubLinks
    accent: PublicClubAccent
    nav: PublicClubNav
  } | null
  children: React.ReactNode
}) {
  const t = useT()
  const labels = usePublicHeaderLabels()
  const pathname = usePathname()
  return (
    <ClubAccentRoot accent={club?.accent} className="bg-background text-foreground min-h-svh">
      <PublicHeader
        club={club}
        title={t('club_core.public.title')}
        labels={labels}
        pathname={pathname}
        Link={Link}
        headerEnd={<LanguageSwitcher />}
      />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">{children}</main>
      {club ? <PublicFooter club={club} /> : null}
    </ClubAccentRoot>
  )
}

/**
 * The page body of a missing page or a club that does not publish one: no club data; `action` is a way back (the club
 * page from a missing section or from P-06 with the events off, #263).
 */
export function PublicNotice({
  title,
  message,
  testId,
  action,
}: {
  title: string
  message: string
  testId: string
  action?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground max-w-prose">{message}</p>
      {action}
    </section>
  )
}
