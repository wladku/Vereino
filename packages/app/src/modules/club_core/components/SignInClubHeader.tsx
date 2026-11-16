'use client'
// The club above the sign-in form (navigation spec REQ-N10, DD-N10; M-01, mockup `screenLogin`; E09-S07 #261): the
// club's logo, its name and the tagline, read through the public club page `GET /api/club_core/public/{clubSlug}` —
// name and logo only. A slug from the link that resolves is remembered in the `vereino_club` cookie; a remembered slug
// that no longer resolves is forgotten. While the club loads a placeholder keeps the place; an unknown club, one that
// does not publish its page and a failed read all show nothing here, so the page reads the same as without a club
// (the platform card below carries Vereino's name).
import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { forgetClubCookie, rememberClubCookie, type SignInClub } from '../lib/sign-in-club'
import { LogoMark } from './public/PublicFrame'
import { usePublicClub } from './public/public-client'

/** Writes a `document.cookie` assignment; `Secure` whenever the page is served over HTTPS. */
function writeCookie(assignment: (secure: boolean) => string): void {
  document.cookie = assignment(window.location.protocol === 'https:')
}

function SignInClubBrand({ club }: { club: SignInClub }) {
  const t = useT()
  const query = usePublicClub(club.slug)
  const load = query.data
  const resolved = load?.status === 'ok' ? load.page.club : null
  const settled = load !== undefined && load.status !== 'ok'

  React.useEffect(() => {
    if (resolved && club.source === 'query') writeCookie((secure) => rememberClubCookie(club.slug, secure))
    if (settled && club.source === 'cookie') writeCookie(forgetClubCookie)
  }, [resolved, settled, club])

  if (query.isPending) {
    return (
      <div className="flex flex-col items-center gap-2" aria-busy="true" data-testid="sign-in-club-loading">
        <span className="bg-muted size-16 animate-pulse rounded-md" />
        <span className="bg-muted h-6 w-40 animate-pulse rounded" />
      </div>
    )
  }
  if (!resolved) return null
  return (
    <div className="flex flex-col items-center gap-2 text-center" data-testid="sign-in-club">
      <LogoMark logo={resolved.logo} size="lg" />
      <p className="text-xl font-semibold" data-testid="sign-in-club-name">
        {resolved.name}
      </p>
      <p className="text-muted-foreground text-sm" data-testid="sign-in-club-tagline">
        {t('vereino.login.tagline')}
      </p>
    </div>
  )
}

export function SignInClubHeader({ club }: { club: SignInClub | null }) {
  if (!club) return null
  return (
    <header className="flex justify-center px-4 pt-8">
      <SignInClubBrand club={club} />
    </header>
  )
}
