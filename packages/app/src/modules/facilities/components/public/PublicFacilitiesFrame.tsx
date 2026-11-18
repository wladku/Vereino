'use client'
// The frame of the public facility pages (P-03, P-04, P-05; #124), the same frame as the public club pages of
// `club_core` (`PublicFrame`, which another module may not import at runtime, S4.3): the public header of `@vereino/ui`
// (the club logo and name linking to the club page, Club · Sections · Facilities · Events · Sign in and the language
// switcher; navigation spec REQ-N09, #261), the page body and a footer with the club name, its published phone and the
// club's rules and privacy-policy links (#195).
// Also the notices of a page with nothing to show and the loading and error states with retry.
import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { LanguageSwitcher } from '@open-mercato/ui/frontend/LanguageSwitcher'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton, PublicHeader } from '@vereino/ui'
import { phoneHref, type PublicPlacesView } from './public-client'

type FrameClub = PublicPlacesView['club']

export function PublicFacilitiesFrame({
  club,
  wide = false,
  children,
}: {
  club: FrameClub | null
  /** The month grid needs more room than a text page. */
  wide?: boolean
  children: React.ReactNode
}) {
  const t = useT()
  const pathname = usePathname()
  const width = wide ? 'max-w-5xl' : 'max-w-3xl'
  return (
    <div className="bg-background text-foreground min-h-svh">
      <PublicHeader
        club={club}
        title={t('facilities.public.title')}
        labels={{
          nav: t('facilities.public.nav.label'),
          club: t('facilities.public.nav.club'),
          sections: t('facilities.public.nav.sections'),
          facilities: t('facilities.public.nav.facilities'),
          events: t('facilities.public.nav.events'),
          signIn: t('facilities.public.nav.signIn'),
        }}
        pathname={pathname}
        Link={Link}
        wide={wide}
        headerEnd={<LanguageSwitcher />}
      />
      <main className={`mx-auto flex ${width} flex-col gap-6 px-4 py-6`}>{children}</main>
      {club ? (
        <footer className="bg-card border-t" data-testid="public-footer">
          <div
            className={`text-muted-foreground mx-auto flex ${width} flex-col gap-1 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between`}
          >
            <span className="text-foreground font-medium" data-testid="public-footer-club">
              {club.name}
            </span>
            {club.contact ? (
              <span data-testid="public-footer-phone">
                {t('facilities.public.footer.phone')}{' '}
                <a
                  className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6"
                  href={phoneHref(club.contact.phone)}
                >
                  {club.contact.phone}
                </a>
              </span>
            ) : null}
            {club.links.rules || club.links.privacyPolicy ? (
              <nav aria-label={t('facilities.public.footer.links')} data-testid="public-footer-links">
                <ul className="flex flex-wrap gap-x-4">
                  {club.links.rules ? (
                    <li>
                      <a
                        className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6"
                        href={club.links.rules}
                        rel="noopener noreferrer"
                        data-testid="public-footer-rules"
                      >
                        {t('facilities.public.footer.rules')}
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
                        {t('facilities.public.footer.privacyPolicy')}
                      </a>
                    </li>
                  ) : null}
                </ul>
              </nav>
            ) : null}
          </div>
        </footer>
      ) : null}
    </div>
  )
}

/** A page with nothing to show: a heading and one sentence, no club data. */
export function PublicFacilitiesNotice({
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
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground max-w-prose">{message}</p>
      {children}
    </section>
  )
}

export function PublicFacilitiesLoading() {
  const t = useT()
  return (
    <PublicFacilitiesFrame club={null}>
      <MemberSkeleton shape="rows" label={t('facilities.public.loading')} />
    </PublicFacilitiesFrame>
  )
}

export function PublicFacilitiesError({ onRetry }: { onRetry: () => void }) {
  const t = useT()
  return (
    <PublicFacilitiesFrame club={null}>
      <div data-testid="public-facilities-error">
        <ErrorMessage
          label={t('facilities.public.errors.load')}
          action={
            <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
              {t('facilities.public.actions.retry')}
            </Button>
          }
        />
      </div>
    </PublicFacilitiesFrame>
  )
}

/**
 * "The club does not share facility calendars": a club that does not publish them, or one without a public place —
 * inside the club's frame, with its phone to ask about free slots while the club publishes one (P-03, #289).
 */
export function PublicFacilitiesDisabled({ club }: { club: FrameClub | null }) {
  const t = useT()
  const phone = club?.contact?.phone ?? null
  return (
    <PublicFacilitiesFrame club={club}>
      <PublicFacilitiesNotice
        title={t('facilities.public.disabled.title')}
        message={phone ? t('facilities.public.disabled.call') : t('facilities.public.disabled.message')}
        testId="public-places-disabled"
      >
        {phone ? (
          <p>
            <a
              className="inline-flex min-h-11 items-center text-lg font-medium underline underline-offset-4"
              href={phoneHref(phone)}
              data-testid="public-places-disabled-phone"
            >
              {phone}
            </a>
          </p>
        ) : null}
      </PublicFacilitiesNotice>
    </PublicFacilitiesFrame>
  )
}
