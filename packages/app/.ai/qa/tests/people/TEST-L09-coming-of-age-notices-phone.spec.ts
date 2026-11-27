import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { addDays } from '../_fixtures/activities'
import { memberAccount, type Member } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { getMe, putMe, updateClubSettings } from '../_fixtures/members'
import { createGuardianship } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// People life-cycle spec AC-L07 (#600; REQ-L06, M-10, J-L05): the phone half of TEST-L09. TEST-L09 proves the domain;
// this test shows the lines `GET /api/people/me` derives from the birth date (no job run needed) at 375 px, in Polish
// and English, light and dark (axe): the guardian's ward card on `/club/profile` and the ward page `/club/wards/{id}`
// read "Turns 18 on {date}: from then {name} decides alone" for a ward who turns 18 in ten days; the ward's own
// profile reads "You turn 18 on {date}" with its body; an adult who turned 18 five days ago reads "Since {date} you
// decide alone". The date is the reader's locale's medium date, as `formatCalendarDate` writes it.
test.describe.configure({ timeout: 420_000 })

const PHONE = { width: 375, height: 812 }
const LOCALES = ['pl', 'en'] as const
type Locale = (typeof LOCALES)[number]

/** The calendar date as the member pages write it (`formatCalendarDate` in `people/components/club/member-client`). */
function mediumDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00.000Z`),
  )
}

type Notices = {
  wards?: Array<{ personId: string; notices?: Array<{ kind: string; on?: string }> }>
  notice?: { kind: string; on: string } | null
}

/** The life-cycle lines of `GET /api/people/me` (the fixture's `MemberProfile` does not type them). */
async function noticesOf(request: APIRequestContext, token: string): Promise<Notices> {
  const me = await getMe(request, token)
  expect(me.status).toBe(200)
  return me.body as unknown as Notices
}

async function setLocale(request: APIRequestContext, token: string, locale: Locale): Promise<void> {
  const me = await getMe(request, token)
  const saved = await putMe(request, token, { preferredLocale: locale }, String(me.body?.person?.updatedAt))
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
}

/** Switch the browser to `member`, at 375 px, and return a fresh API token (signing in ends the old one). */
async function asMember(
  page: Page,
  request: APIRequestContext,
  club: Parameters<typeof switchBrowserUser>[2],
  member: Member,
) {
  const password = await switchBrowserUser(page, request, club, member.userId, member.email)
  await page.setViewportSize(PHONE)
  return getAuthToken(request, member.email, password)
}

test('TEST-L09 the 18th-birthday lines on the ward card, the ward page and the own card at 375 px', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-l09-notices-phone')
  try {
    const admin = club.adminToken
    expect((await updateClubSettings(request, admin, { ownAccountMinAge: 16 })).status).toBe(200)
    const guardianId = await createPerson(request, admin, {
      firstName: 'Kasia',
      lastName: 'Lis',
      birthDate: birthDateTurning(41),
    })
    const birthday = calendarDate(10)
    const wardId = await createPerson(request, admin, {
      firstName: 'Jan',
      lastName: 'Lis',
      birthDate: birthDateTurning(18, 10),
    })
    const cameOfAgeOn = calendarDate(-5)
    const adultId = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Lis',
      birthDate: birthDateTurning(18, -5),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: guardianId,
      wardPersonId: wardId,
      isPrimaryPayer: true,
      validFrom: addDays(calendarDate(), -100),
    })
    const guardian = await memberAccount(request, club, guardianId, 'kasia-l09')
    const ward = await memberAccount(request, club, wardId, 'jan-l09')
    const adult = await memberAccount(request, club, adultId, 'ola-l09')

    // The API carries the lines the pages draw: the ward card's `turns_18` (no `may_have_account`: Jan has an
    // account), Jan's own `turns_18` and Ola's `came_of_age`.
    const guardianMe = await noticesOf(request, guardian.token)
    expect(guardianMe.wards?.find((item) => item.personId === wardId)?.notices).toEqual([
      { kind: 'turns_18', on: birthday },
    ])
    expect((await noticesOf(request, ward.token)).notice).toEqual({ kind: 'turns_18', on: birthday })
    expect((await noticesOf(request, adult.token)).notice).toEqual({ kind: 'came_of_age', on: cameOfAgeOn })

    await prepareForAccessibilityScan(page)
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    const violations: Record<string, unknown> = {}

    // The guardian: the ward card on the profile and the ward page.
    const guardianToken = await asMember(page, request, club, guardian)
    for (const locale of LOCALES) {
      await setLocale(request, guardianToken, locale)
      const text = uiText('people.club.wards.notices.turns18', {
        params: { date: mediumDate(birthday, locale), name: 'Jan' },
      })
      await page.goto('/club/profile')
      const card = page.getByTestId('club-profile-ward').filter({ hasText: 'Jan' })
      const line = card.getByTestId('club-ward-notice-turns_18')
      await expect(line).toContainText(text)
      await expect(card.getByTestId('club-ward-notice-may_have_account')).toHaveCount(0)
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/club/profile ward card turns 18 (${locale})`,
          async () => {
            await expect(line).toBeVisible()
          },
          { platformBaseline: true },
        ),
      )
      await page.goto(`/club/wards/${wardId}`)
      const pageLine = page.getByTestId('club-ward-notice-turns_18')
      await expect(pageLine).toContainText(text)
      await expectNoPageOverflow(page)
      Object.assign(
        violations,
        await scanInColorSchemes(
          page,
          testInfo,
          `/club/wards ward page turns 18 (${locale})`,
          async () => {
            await expect(pageLine).toBeVisible()
          },
          { platformBaseline: true },
        ),
      )
    }

    // The ward's own card before the birthday, and the adult's card after it.
    for (const [member, kind, titleKey, bodyKey, on] of [
      [
        ward,
        'turns_18',
        'people.club.profile.notice.turns18.title',
        'people.club.profile.notice.turns18.body',
        birthday,
      ],
      [
        adult,
        'came_of_age',
        'people.club.profile.notice.cameOfAge.title',
        'people.club.profile.notice.cameOfAge.body',
        cameOfAgeOn,
      ],
    ] as const) {
      const token = await asMember(page, request, club, member)
      for (const locale of LOCALES) {
        await setLocale(request, token, locale)
        await page.goto('/club/profile')
        const card = page.getByTestId(`club-profile-notice-${kind}`)
        await expect(card.getByRole('heading', { level: 2 })).toHaveText(
          uiText(titleKey, { exact: true, params: { date: mediumDate(on, locale) } }),
        )
        await expect(card).toContainText(uiText(bodyKey))
        await expectNoPageOverflow(page)
        Object.assign(
          violations,
          await scanInColorSchemes(
            page,
            testInfo,
            `/club/profile own card ${kind} (${locale})`,
            async () => {
              await expect(card).toBeVisible()
            },
            { platformBaseline: true },
          ),
        )
      }
    }
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
