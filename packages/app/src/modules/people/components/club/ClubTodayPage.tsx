'use client'
// `/club` — "Today" of the member interface (club spec `/club` UI row and wireframe; REQ-002; #27). Phase 1 shows the
// profile and calendar entry points and — only for a guardian — the wards with their consents. The calendar fills
// with the sessions of phase 2; the messages and payments tiles arrive with phases 3 and 4 and are not rendered
// before (no empty placeholders). A minor never gets a payments tile (R10, `paymentsVisible`).
import * as React from 'react'
import Link from 'next/link'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { ClubFrame } from './ClubFrame'
import {
  CLUB_PROFILE_HREF,
  WARD_CONSENT_KINDS,
  formatCalendarDate,
  fullName,
  type MemberProfile,
  type MemberWard,
} from './member-client'

const TILE_CLASS = 'bg-card flex h-full flex-col gap-2 rounded-lg border p-4'
const LINK_TILE_CLASS = `${TILE_CLASS} hover:bg-accent focus-visible:shadow-focus min-h-11 outline-none`

function WardCard({ ward, locale }: { ward: MemberWard; locale: string }) {
  const t = useT()
  const granted = WARD_CONSENT_KINDS.filter((kind) => ward.guardianship.consents[kind].granted).length
  const birthDate = formatCalendarDate(ward.birthDate, locale)
  return (
    <li>
      <Link href={`/club/wards/${ward.personId}`} className={LINK_TILE_CLASS} data-testid="club-ward">
        <span className="font-semibold">{fullName(ward)}</span>
        {birthDate ? (
          <span className="text-muted-foreground text-sm">{t('people.club.wards.birthDate', { date: birthDate })}</span>
        ) : null}
        <span className="flex flex-wrap gap-2">
          <StatusBadge variant={granted === WARD_CONSENT_KINDS.length ? 'success' : 'warning'}>
            {t('people.club.wards.consentsSummary', {
              granted: String(granted),
              total: String(WARD_CONSENT_KINDS.length),
            })}
          </StatusBadge>
          {ward.hasAccount ? <StatusBadge variant="neutral">{t('people.club.wards.hasAccount')}</StatusBadge> : null}
        </span>
      </Link>
    </li>
  )
}

function Today({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const locale = useLocale()
  return (
    <>
      <h1 className="text-2xl font-semibold">{t('people.club.today.title', { name: profile.person.firstName })}</h1>
      <section aria-labelledby="club-today-tiles" className="flex flex-col gap-3">
        <h2 id="club-today-tiles" className="sr-only">
          {t('people.club.today.tiles')}
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <li>
            <div className={TILE_CLASS} data-testid="club-tile-calendar">
              <h3 className="font-semibold">{t('people.club.tiles.calendar.title')}</h3>
              <p className="text-muted-foreground max-w-prose text-sm">{t('people.club.tiles.calendar.empty')}</p>
            </div>
          </li>
          <li>
            <Link href={CLUB_PROFILE_HREF} className={LINK_TILE_CLASS} data-testid="club-tile-profile">
              <span className="font-semibold">{t('people.club.tiles.profile.title')}</span>
              <span className="text-muted-foreground max-w-prose text-sm">
                {t('people.club.tiles.profile.description')}
              </span>
            </Link>
          </li>
        </ul>
      </section>
      {profile.wards.length > 0 ? (
        <section aria-labelledby="club-wards" className="flex flex-col gap-3" data-testid="club-wards">
          <h2 id="club-wards" className="text-lg font-semibold">
            {t('people.club.wards.title')}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {profile.wards.map((ward) => (
              <WardCard key={ward.personId} ward={ward} locale={locale} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

export function ClubTodayPage() {
  return <ClubFrame>{(profile) => <Today profile={profile} />}</ClubFrame>
}
