'use client'
// `/p/[clubSlug]/sections/[sectionSlug]` — the public section page (club spec UI table and mock-up, J-008, DD-28,
// DD-29, REQ-025; #29): the section's name and effective logo and the blocks the club publishes — description,
// conditions, materials (file links with name and format) and contact. Blocks of later modules (classes with their
// schedule, prices) arrive with their providers; until then the classes area says that no classes are published.
// Headings: h1 section, h2 blocks. States: loading, error with retry, 404 and "the club does not publish a page".
import * as React from 'react'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { LogoMark, PublicFrame, PublicNotice } from './PublicFrame'
import { formatFileSize, formatLabel, usePublicSection, type PublicSectionPage } from './public-client'

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby={`public-block-${id}`} data-testid={`public-block-${id}`}>
      <h2 id={`public-block-${id}`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

function SectionBody({ page }: { page: PublicSectionPage }) {
  const t = useT()
  const locale = useLocale()
  const { section, blocks } = page
  const contact = blocks.contact
  return (
    <>
      <section className="flex items-start gap-4" aria-labelledby="public-section-title">
        <LogoMark logo={section.logo} size="lg" />
        <div className="flex flex-col gap-2">
          <h1 id="public-section-title" className="text-2xl font-semibold" data-testid="public-section-name">
            {section.name}
          </h1>
          {blocks.description ? (
            <p className="text-muted-foreground max-w-prose whitespace-pre-line" data-testid="public-block-description">
              {blocks.description.text}
            </p>
          ) : null}
        </div>
      </section>
      <Block id="classes" title={t('club_core.public.classes.title')}>
        <p className="text-muted-foreground max-w-prose">{t('club_core.public.classes.empty')}</p>
      </Block>
      {blocks.conditions ? (
        <Block id="conditions" title={t('club_core.public.conditions.title')}>
          <p className="max-w-prose whitespace-pre-line">{blocks.conditions.text}</p>
        </Block>
      ) : null}
      {blocks.materials ? (
        <Block id="materials" title={t('club_core.public.materials.title')}>
          <ul className="flex flex-col gap-2">
            {blocks.materials.items.map((material) => (
              <li key={material.id}>
                <a
                  href={material.url}
                  className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('club_core.public.materials.link', {
                    title: material.title,
                    format: formatLabel(material.mimeType),
                    size: formatFileSize(material.fileSize, locale),
                  })}
                </a>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
      {contact ? (
        <Block id="contact" title={t('club_core.public.contact.title')}>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3">
            {contact.name ? (
              <>
                <dt className="text-muted-foreground">{t('club_core.public.contact.name')}</dt>
                <dd className="sm:col-span-2">{contact.name}</dd>
              </>
            ) : null}
            {contact.email ? (
              <>
                <dt className="text-muted-foreground">{t('club_core.public.contact.email')}</dt>
                <dd className="sm:col-span-2">
                  <a className="underline underline-offset-4" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                </dd>
              </>
            ) : null}
            {contact.phone ? (
              <>
                <dt className="text-muted-foreground">{t('club_core.public.contact.phone')}</dt>
                <dd className="sm:col-span-2">
                  <a className="underline underline-offset-4" href={`tel:${contact.phone.replace(/\s+/g, '')}`}>
                    {contact.phone}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
        </Block>
      ) : null}
    </>
  )
}

export function PublicSectionView({ clubSlug, sectionSlug }: { clubSlug: string; sectionSlug: string }) {
  const t = useT()
  const query = usePublicSection(clubSlug, sectionSlug)
  const load = query.data

  if (!load && query.isFetching) {
    return (
      <PublicFrame club={null}>
        <LoadingMessage label={t('club_core.public.loading')} />
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
  return (
    <PublicFrame club={load.page.club}>
      <SectionBody page={load.page} />
    </PublicFrame>
  )
}
