'use client'
// The life-cycle lines of the member pages (people life-cycle spec M-10, REQ-L06, REQ-L07; phase L8, #310): on a ward's
// card and page "May have an own account — ask the club" and "Turns 18 on {date}: from then {name} decides alone"
// (`GET /api/people/me` → `wards[].notices`), and on the member's own profile a card before and after their 18th
// birthday (`notice`). Text carries the meaning; the icon is decorative.
import * as React from 'react'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { Notice } from '@vereino/ui'
import { formatCalendarDate, type MemberProfile, type MemberWard, type WardNotice } from './member-client'

function noticeText(
  notice: WardNotice,
  ward: Pick<MemberWard, 'firstName'>,
  t: ReturnType<typeof useT>,
  locale: string,
): string {
  if (notice.kind === 'may_have_account') return t('people.club.wards.notices.mayHaveAccount')
  return t('people.club.wards.notices.turns18', {
    date: formatCalendarDate(notice.on, locale) ?? notice.on,
    name: ward.firstName,
  })
}

/** The ward's notice lines; nothing when there is none. */
export function WardNotices({ ward }: { ward: MemberWard }) {
  const t = useT()
  const locale = useLocale()
  const notices = ward.notices ?? []
  if (notices.length === 0) return null
  return (
    <ul className="flex flex-col gap-2" data-testid="club-ward-notices">
      {notices.map((notice) => (
        <li key={notice.kind} data-testid={`club-ward-notice-${notice.kind}`}>
          <Notice>
            <p className="max-w-prose text-sm">{noticeText(notice, ward, t, locale)}</p>
          </Notice>
        </li>
      ))}
    </ul>
  )
}

/** The member's own card before and after the 18th birthday; nothing otherwise. */
export function OwnLifeCycleNotice({ profile }: { profile: MemberProfile }) {
  const t = useT()
  const locale = useLocale()
  const notice = profile.notice
  if (!notice) return null
  const date = formatCalendarDate(notice.on, locale) ?? notice.on
  const turns18 = notice.kind === 'turns_18'
  return (
    <section aria-labelledby="club-profile-life-cycle" data-testid={`club-profile-notice-${notice.kind}`}>
      <Notice>
        <h2 id="club-profile-life-cycle" className="text-base font-semibold">
          {t(turns18 ? 'people.club.profile.notice.turns18.title' : 'people.club.profile.notice.cameOfAge.title', {
            date,
          })}
        </h2>
        <p className="mt-1 max-w-prose text-sm">
          {t(turns18 ? 'people.club.profile.notice.turns18.body' : 'people.club.profile.notice.cameOfAge.body', {
            date,
          })}
        </p>
      </Notice>
    </section>
  )
}
