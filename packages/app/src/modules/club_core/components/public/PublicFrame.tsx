'use client'
// The frame of the public club pages (club spec UI table `/p/[clubSlug]`, DD-23; #29): the club logo and name in the
// header (a link to the club page), the language switcher for guests and the page body. Personal data never appears
// here; the club and section names are the club's own content and stay in its language.
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { LanguageSwitcher } from '@open-mercato/ui/frontend/LanguageSwitcher'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { clubHref, type PublicLogo } from './public-client'

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

export function PublicFrame({
  club,
  children,
}: {
  club: { name: string; slug: string; logo: PublicLogo } | null
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
