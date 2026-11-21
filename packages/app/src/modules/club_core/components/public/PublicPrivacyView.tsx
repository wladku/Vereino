'use client'
// `/p/[clubSlug]/privacy` — the club's default privacy notice (E19-S03, #469; engineering standards S9.2, S9.3, S9.7):
// what the club processes, why and on what basis, who receives it, how long it is kept, the reader's rights and the
// cookies, with the club's name filled in, in the page language, and at the end a short version for children and
// teenagers (GDPR art. 12(1)). The footer of every public page links here while the club has set no address of its own
// privacy policy on B-03 (#195); a club that did set one keeps its text: this page then only points to it. The words
// are the `club_core.privacy.*` catalog keys; `lib/privacy-notice` says which keys form each section. The club data come
// from the public club API (same rate limit, nothing personal). States: loading, error with retry, 404, "the club does
// not publish a page".
import * as React from 'react'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import {
  PRIVACY_NOTICE_CHILDREN,
  PRIVACY_NOTICE_PAGE_KEYS as KEYS,
  PRIVACY_NOTICE_SECTIONS,
  privacySectionKeys,
  type PrivacyNoticeSection,
} from '../../lib/privacy-notice'
import { PublicFrame, PublicNotice } from './PublicFrame'
import { usePublicClub, type PublicClubPage, type PublicLoad } from './public-client'

const LINK_CLASS = 'inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6'
const CHILDREN_ID = 'privacy-for-children'

function NoticeSection({
  section,
  club,
  id,
  className,
}: {
  section: PrivacyNoticeSection
  club: string
  id: string
  className?: string
}) {
  const t = useT()
  const keys = privacySectionKeys(section)
  const headingId = `${id}-title`
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`flex flex-col gap-2 ${className ?? ''}`}
      data-testid={`privacy-section-${section.id}`}
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {t(keys.title, { club })}
      </h2>
      {keys.lead.map((key) => (
        <p key={key} className="max-w-prose">
          {t(key, { club })}
        </p>
      ))}
      {keys.items.length ? (
        <ul className="flex max-w-prose list-disc flex-col gap-1 ps-5">
          {keys.items.map((key) => (
            <li key={key}>{t(key, { club })}</li>
          ))}
        </ul>
      ) : null}
      {keys.notes.map((key) => (
        <p key={key} className="max-w-prose">
          {t(key, { club })}
        </p>
      ))}
    </section>
  )
}

/** `initial`: the state the server already read (#487), so the page's HTML holds the notice without JavaScript. */
export function PublicPrivacyView({ clubSlug, initial }: { clubSlug: string; initial?: PublicLoad<PublicClubPage> }) {
  const t = useT()
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

  const { club } = load.page
  const own = club.links.privacyPolicy
  return (
    <PublicFrame club={club}>
      <article className="flex flex-col gap-6" aria-labelledby="privacy-title" data-testid="privacy-notice">
        <header className="flex flex-col gap-2">
          <h1 id="privacy-title" className="text-2xl font-semibold">
            {t(KEYS.title)}
          </h1>
          {own ? (
            <>
              <p className="max-w-prose" data-testid="privacy-own">
                {t(KEYS.ownMessage, { club: club.name })}
              </p>
              <p>
                <a className={LINK_CLASS} href={own} rel="noopener noreferrer" data-testid="privacy-own-link">
                  {t(KEYS.ownLink)}
                </a>
              </p>
            </>
          ) : (
            <>
              <p className="max-w-prose" data-testid="privacy-intro">
                {t(KEYS.intro, { club: club.name })}
              </p>
              <p>
                <a className={LINK_CLASS} href={`#${CHILDREN_ID}`} data-testid="privacy-children-link">
                  {t(KEYS.childrenLink)}
                </a>
              </p>
            </>
          )}
        </header>
        {own ? null : (
          <>
            {PRIVACY_NOTICE_SECTIONS.map((section) => (
              <NoticeSection key={section.id} section={section} club={club.name} id={`privacy-${section.id}`} />
            ))}
            <NoticeSection
              section={PRIVACY_NOTICE_CHILDREN}
              club={club.name}
              id={CHILDREN_ID}
              className="bg-card scroll-mt-4 rounded-lg border p-4"
            />
          </>
        )}
      </article>
    </PublicFrame>
  )
}
