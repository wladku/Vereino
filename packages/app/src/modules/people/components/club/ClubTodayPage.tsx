'use client'
// `/club` — "Today" of the member interface (club spec `/club` UI row and wireframe; REQ-002; #27; README M-02). E20-S14
// (#493, R01.5, R06.1): the club header — the logo and the club's name as text — then at most three tiles in the
// mockup's order, Calendar (today and tomorrow) → Attendance → Messages, mounted by `activities` and `communication`
// on the spot `vereino:club:today:sections`, so `people` never imports them. Everything else that used to be a tile is
// a row of the "Shortcuts" list under the tiles: Payments (its body — what is owed and by when — from `payments` on the
// spot `vereino:club:today:payments`, #111; never for a minor, R10 `paymentsVisible`), the rows `payments` adds on the
// spot `vereino:club:today:more` (the kit order of a campaign, the coach's group payments) and the profile; then, for a
// guardian, the wards as rows with their consents.
import * as React from 'react'
import Link from 'next/link'
import { InjectionSpot } from '@open-mercato/ui/backend/injection/InjectionSpot'
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
import { StatusTag } from '@vereino/ui'

/** One row of the lists under the tiles: a full-width link separated by a line, at least 44 px tall. */
const ROW_LINK_CLASS =
  'hover:bg-accent focus-visible:focus-indicator flex min-h-11 flex-col gap-1 rounded-md px-2 py-3 outline-none'
const ROW_CLASS = 'border-b last:border-b-0'

function WardRow({ ward, locale }: { ward: MemberWard; locale: string }) {
  const t = useT()
  const granted = WARD_CONSENT_KINDS.filter((kind) => ward.guardianship.consents[kind].granted).length
  const birthDate = formatCalendarDate(ward.birthDate, locale)
  return (
    <li className={ROW_CLASS}>
      <Link href={`/club/wards/${ward.personId}`} className={ROW_LINK_CLASS} data-testid="club-ward">
        <span className="font-semibold">{fullName(ward)}</span>
        {birthDate ? (
          <span className="text-muted-foreground text-sm">{t('people.club.wards.birthDate', { date: birthDate })}</span>
        ) : null}
        <span className="flex flex-wrap gap-2">
          <StatusTag status={granted === WARD_CONSENT_KINDS.length ? 'success' : 'warning'}>
            {t('people.club.wards.consentsSummary', {
              granted: String(granted),
              total: String(WARD_CONSENT_KINDS.length),
            })}
          </StatusTag>
          {ward.hasAccount ? <StatusTag status="neutral">{t('people.club.wards.hasAccount')}</StatusTag> : null}
        </span>
      </Link>
    </li>
  )
}

/** R06.1: the club's logo and, always next to it, its name as text (the logo is never the only identification). */
function ClubHeader({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const name = profile.club.name ?? profile.club.shortName ?? t('people.club.title')
  return (
    <div className="flex items-center justify-end gap-2 text-sm" data-testid="club-today-header">
      {profile.club.logoUrl ? (
        // The name stands next to the logo, so the image is decorative.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.club.logoUrl}
          alt=""
          width={24}
          height={24}
          className="size-6 shrink-0 rounded-full object-contain"
          data-testid="club-today-logo"
        />
      ) : null}
      <p className="text-muted-foreground" data-testid="club-today-club-name">
        {name}
      </p>
    </div>
  )
}

function Today({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const locale = useLocale()
  return (
    <>
      <ClubHeader profile={profile} />
      <h1 className="text-2xl font-semibold">{t('people.club.today.title', { name: profile.person.firstName })}</h1>
      {/* At most three tiles (R01.5): each widget of the spot renders its tiles straight into this grid. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="club-today-tiles">
        <InjectionSpot spotId="vereino:club:today:sections" context={{ profile }} />
      </div>
      <section aria-labelledby="club-today-shortcuts" className="flex flex-col gap-1">
        <h2 id="club-today-shortcuts" className="text-lg font-semibold">
          {t('people.club.today.shortcuts')}
        </h2>
        <ul className="flex flex-col" data-testid="club-today-shortcuts">
          {profile.paymentsVisible ? (
            <li className={ROW_CLASS}>
              <Link href="/club/payments" className={ROW_LINK_CLASS} data-testid="club-tile-payments">
                <span className="font-semibold">{t('people.club.tiles.payments.title')}</span>
                {/* `payments` fills the body: the open total and nearest due date, or "Everything is paid" (#111). */}
                <InjectionSpot spotId="vereino:club:today:payments" context={{ profile }} />
              </Link>
            </li>
          ) : null}
          {/* `payments` adds its rows (`<li>`): the kit order of a campaign, the coach's group payments. */}
          <InjectionSpot spotId="vereino:club:today:more" context={{ profile }} />
          <li className={ROW_CLASS}>
            <Link href={CLUB_PROFILE_HREF} className={ROW_LINK_CLASS} data-testid="club-tile-profile">
              <span className="font-semibold">{t('people.club.tiles.profile.title')}</span>
              <span className="text-muted-foreground max-w-prose text-sm">
                {t('people.club.tiles.profile.description')}
              </span>
            </Link>
          </li>
        </ul>
      </section>
      {profile.wards.length > 0 ? (
        <section aria-labelledby="club-wards" className="flex flex-col gap-1" data-testid="club-wards">
          <h2 id="club-wards" className="text-lg font-semibold">
            {t('people.club.wards.title')}
          </h2>
          <ul className="flex flex-col">
            {profile.wards.map((ward) => (
              <WardRow key={ward.personId} ward={ward} locale={locale} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

export function ClubTodayPage() {
  return <ClubFrame skeleton="tiles">{(profile) => <Today profile={profile} />}</ClubFrame>
}
