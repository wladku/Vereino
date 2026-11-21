'use client'
// `/p/[clubSlug]` — the public club page (club spec UI table, J-008, REQ-025; #29): the club's name, logo and
// description, its contact with the `contact` block, a tile for each public section with the section's effective
// logo, short description and number of public groups (`groups.publicCatalog`, #89), and a "Facilities" link to the
// club's public facility calendars when the club publishes them (`facilities.publicPlaces`, P-01 → P-03, #124). The
// one-off events moved to their own page P-06 (#263). States: loading, error with retry, 404 (nothing about any club)
// and "the club does not publish a page".
import * as React from 'react'
import Link from 'next/link'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import { phoneHref, pluralForm } from '../../lib/public-page'
import { LogoMark, PublicFrame, PublicNotice } from './PublicFrame'
import { sectionHref, usePublicClub, type PublicClubPage, type PublicLoad } from './public-client'

/** `initial`: the state the server already read (#487), so the page's HTML holds its content without JavaScript. */
export function PublicClubView({ clubSlug, initial }: { clubSlug: string; initial?: PublicLoad<PublicClubPage> }) {
  const t = useT()
  const locale = useLocale()
  const query = usePublicClub(clubSlug, !initial)
  const load = initial ?? query.data

  if (!load && query.isFetching) {
    return (
      <PublicFrame club={null}>
        <MemberSkeleton shape="rows" label={t('club_core.public.loading')} />
      </PublicFrame>
    )
  }
  if (!load) {
    return (
      <PublicFrame club={null}>
        <ErrorMessage
          label={t('club_core.public.errors.load')}
          action={
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
              {t('club_core.public.actions.retry')}
            </Button>
          }
        />
      </PublicFrame>
    )
  }
  if (load.status === 'not_found') {
    return (
      <PublicFrame club={null}>
        <PublicNotice
          title={t('club_core.public.notFound.title')}
          message={t('club_core.public.notFound.message')}
          testId="public-not-found"
        />
      </PublicFrame>
    )
  }
  if (load.status === 'disabled') {
    return (
      <PublicFrame club={null}>
        <PublicNotice
          title={t('club_core.public.disabled.title')}
          message={t('club_core.public.disabled.message')}
          testId="public-disabled"
        />
      </PublicFrame>
    )
  }

  const { club, sections, blocks } = load.page
  const groupCounts = blocks.groups?.counts ?? {}
  const places = blocks.places
  return (
    <PublicFrame club={club}>
      <section className="flex items-start gap-4" aria-labelledby="public-club-title">
        <LogoMark logo={club.logo} size="lg" />
        <div className="flex flex-col gap-2">
          <h1 id="public-club-title" className="text-2xl font-semibold" data-testid="public-club-name">
            {club.name}
          </h1>
          {club.description ? (
            <p className="text-muted-foreground max-w-prose whitespace-pre-line" data-testid="public-club-description">
              {club.description}
            </p>
          ) : null}
        </div>
      </section>
      <section id="sections" className="flex scroll-mt-4 flex-col gap-3" aria-labelledby="public-sections-title">
        <h2 id="public-sections-title" className="text-lg font-semibold">
          {t('club_core.public.sections.title')}
        </h2>
        {sections.length === 0 ? (
          <div className="flex flex-col items-start gap-1" data-testid="public-sections-empty">
            <p className="text-muted-foreground max-w-prose">{t('club_core.public.sections.empty')}</p>
            {club.contact ? (
              <a href="#contact" className="inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6">
                {t('club_core.public.askClub')}
              </a>
            ) : null}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="public-sections">
            {sections.map((section) => (
              <li key={section.slug}>
                <Link
                  href={sectionHref(club.slug, section.slug)}
                  className="bg-card hover:bg-muted flex min-h-16 items-center gap-3 rounded-lg border p-3 font-medium"
                  data-testid={`public-section-${section.slug}`}
                >
                  <LogoMark logo={section.logo} />
                  <span className="flex min-w-0 flex-col">
                    <span>{section.name}</span>
                    {section.shortDescription ? (
                      <span
                        className="text-muted-foreground text-sm font-normal"
                        data-testid={`public-section-${section.slug}-short`}
                      >
                        {section.shortDescription}
                      </span>
                    ) : null}
                    {groupCounts[section.slug] ? (
                      <span
                        className="text-primary text-sm font-normal"
                        data-testid={`public-section-${section.slug}-groups`}
                      >
                        {t(`club_core.public.sections.groups.${pluralForm(locale, groupCounts[section.slug])}`, {
                          count: groupCounts[section.slug],
                        })}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {places ? (
        <section className="flex flex-col gap-3" aria-labelledby="public-places-title">
          <h2 id="public-places-title" className="text-lg font-semibold">
            {t('club_core.public.places.title')}
          </h2>
          <Link
            href={places.path}
            className="bg-card hover:bg-muted flex min-h-16 flex-col justify-center rounded-lg border p-3 font-medium sm:max-w-sm"
            data-testid="public-club-places-link"
          >
            <span>{t('club_core.public.places.title')}</span>
            <span className="text-muted-foreground text-sm font-normal">{t('club_core.public.places.hint')}</span>
          </Link>
        </section>
      ) : null}
      {club.contact ? (
        <section id="contact" className="flex scroll-mt-4 flex-col gap-2" aria-labelledby="public-club-contact-title">
          <h2 id="public-club-contact-title" className="text-lg font-semibold">
            {t('club_core.public.contact.title')}
          </h2>
          <p data-testid="public-club-contact">
            <a className="underline underline-offset-4" href={phoneHref(club.contact.phone)}>
              {club.contact.phone}
            </a>
          </p>
        </section>
      ) : null}
    </PublicFrame>
  )
}
