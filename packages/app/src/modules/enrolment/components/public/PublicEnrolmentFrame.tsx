'use client'
// The frame of the public application pages (sign-up form spec P-J2…P-J4; #799), the same frame as the public club
// pages of `club_core` (`PublicFrame`, which another module may not import at runtime, S4.3) and the facility pages:
// the public header of `@vereino/ui` with the language switcher, the page body and a footer with the club name, its
// rules link and its privacy-policy link (the club's own address, else the default notice). Also a notice for a page
// with nothing to show, and the loading and error states with retry.
import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { LanguageSwitcher } from '@open-mercato/ui/frontend/LanguageSwitcher'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ClubAccentRoot, MemberSkeleton, PublicHeader, privacyPolicyHref } from '@vereino/ui'
import type { PublicEnrolmentClub } from './public-client'

const FOOTER_LINK_CLASS = 'text-foreground inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6'

export function PublicEnrolmentFrame({
  club,
  children,
}: {
  club: PublicEnrolmentClub | null
  children: React.ReactNode
}) {
  const t = useT()
  const pathname = usePathname()
  const privacy = club ? privacyPolicyHref(club.slug, club.links.privacyPolicy) : null
  return (
    <ClubAccentRoot accent={club?.accent} className="bg-background text-foreground min-h-svh">
      <PublicHeader
        club={club}
        title={t('enrolment.public.title')}
        labels={{
          nav: t('enrolment.public.nav.label'),
          club: t('enrolment.public.nav.club'),
          sections: t('enrolment.public.nav.sections'),
          facilities: t('enrolment.public.nav.facilities'),
          events: t('enrolment.public.nav.events'),
          signIn: t('enrolment.public.nav.signIn'),
        }}
        pathname={pathname}
        Link={Link}
        headerEnd={<LanguageSwitcher />}
      />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">{children}</main>
      {club && privacy ? (
        <footer className="bg-card border-t" data-testid="public-footer">
          <div className="text-muted-foreground mx-auto flex max-w-3xl flex-col gap-1 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-foreground font-medium" data-testid="public-footer-club">
              {club.name}
            </span>
            <nav aria-label={t('enrolment.public.footer.links')} data-testid="public-footer-links">
              <ul className="flex flex-wrap gap-x-4">
                {club.links.rules ? (
                  <li>
                    <a
                      className={FOOTER_LINK_CLASS}
                      href={club.links.rules}
                      rel="noopener noreferrer"
                      data-testid="public-footer-rules"
                    >
                      {t('enrolment.public.footer.rules')}
                    </a>
                  </li>
                ) : null}
                <li>
                  <a
                    className={FOOTER_LINK_CLASS}
                    href={privacy.href}
                    rel="noopener noreferrer"
                    data-testid="public-footer-privacy"
                    data-source={privacy.source}
                  >
                    {t('enrolment.public.footer.privacyPolicy')}
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </footer>
      ) : null}
    </ClubAccentRoot>
  )
}

/** A page with nothing more to show: a heading, one sentence and an optional way on. */
export function PublicEnrolmentNotice({
  title,
  message,
  testId,
  children,
}: {
  title: string
  message: string
  testId: string
  children?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3" data-testid={testId} aria-labelledby={`${testId}-title`}>
      <h1 id={`${testId}-title`} className="text-2xl font-semibold">
        {title}
      </h1>
      <p className="text-muted-foreground max-w-prose">{message}</p>
      {children}
    </section>
  )
}

export function PublicEnrolmentLoading({ club = null, label }: { club?: PublicEnrolmentClub | null; label?: string }) {
  const t = useT()
  return (
    <PublicEnrolmentFrame club={club}>
      <MemberSkeleton shape="rows" label={label ?? t('enrolment.public.loading')} />
    </PublicEnrolmentFrame>
  )
}

export function PublicEnrolmentError({
  club = null,
  onRetry,
}: {
  club?: PublicEnrolmentClub | null
  onRetry: () => void
}) {
  const t = useT()
  return (
    <PublicEnrolmentFrame club={club}>
      <div data-testid="enrolment-public-error">
        <ErrorMessage
          label={t('enrolment.public.errors.load')}
          action={
            <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
              {t('enrolment.public.actions.retry')}
            </Button>
          }
        />
      </div>
    </PublicEnrolmentFrame>
  )
}

/** "Too many attempts" with the wait the server named, else a general "later". */
export function tooManyText(
  t: (key: string, params?: Record<string, string | number>) => string,
  retryAfter: number | null,
) {
  return retryAfter === null
    ? t('enrolment.public.errors.tooMany')
    : t('enrolment.public.errors.tooManyWait', { seconds: retryAfter })
}
