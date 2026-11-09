'use client'
// The frame of the public club pages (club spec UI table `/p/[clubSlug]`, DD-23; #29): the club logo and name in the
// header (a link to the club page), the language switcher for guests, the page body and the footer with the club name,
// its published phone (E06-S07, #89) and the club's rules and privacy-policy links (#195). Personal data never appears
// here; the club and section names are the club's own content and stay in its language.
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LanguageSwitcher } from '@open-mercato/ui/frontend/LanguageSwitcher'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { phoneHref } from '../../lib/public-page'
import { clubHref, type PublicClubContact, type PublicClubLinks, type PublicLogo } from './public-client'

/** A logo, or the initial of the name in its place (glossary *Logo*: never an empty image). Decorative: the name is next to it. */
export function LogoMark({ logo, size = 'md' }: { logo: PublicLogo; size?: 'md' | 'lg' }) {
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
      className={`${box} bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-md font-semibold`}
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

export function PublicFrame({
  club,
  children,
}: {
  club: { name: string; slug: string; logo: PublicLogo; contact: PublicClubContact; links: PublicClubLinks } | null
  children: React.ReactNode
}) {
  const t = useT()
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          {club ? (
            <Link
              href={clubHref(club.slug)}
              className="text-foreground flex min-h-11 items-center gap-3 rounded-md font-semibold"
              data-testid="public-club-link"
            >
              <LogoMark logo={club.logo} />
              <span>{club.name}</span>
            </Link>
          ) : (
            <span className="text-muted-foreground text-sm">{t('club_core.public.title')}</span>
          )}
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">{children}</main>
      {club ? <PublicFooter club={club} /> : null}
    </div>
  )
}

/** The page body of a missing page or a club that does not publish one: no club data, a way back to nothing but home. */
export function PublicNotice({ title, message, testId }: { title: string; message: string; testId: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground max-w-prose">{message}</p>
    </section>
  )
}
