import { expect, test, type Page } from '@playwright/test'
import { addDays, showCalendarWeekOf, weekdayOf } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, oneOff } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { createGuardianship } from '../_fixtures/people'

// Issue #101 (E06-S19; README 3.1 *Member `/club`*, M-02, M-03): every `/club` page has the bottom bar Today ·
// Calendar · Messages · More with the current tab marked and 48 × 48 px targets; More offers Profile, the admin panel
// for staff only and Sign out, which ends the session through the installed `auth` logout route so the back button
// does not reopen `/club`. In the header a guardian of two wards narrows Today and the calendar to one ward, and a
// coach who is also a guardian switches to "as coach" to see the coach tiles.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const MORE = /^(More|Więcej)$/
const SIGN_OUT = /^(Sign out|Wyloguj się)$/
const ADMIN_PANEL = /^(Admin panel|Panel administracyjny)$/

async function pick(page: Page, switcher: 'context' | 'ward', option: string | RegExp): Promise<void> {
  await page.locator(`#club-switcher-${switcher}`).click()
  await page.getByRole('option', { name: option }).click()
}

/** Every link and the More toggle of the bottom bar is at least 48 × 48 px (README 3.1, WCAG 2.5.5). */
async function expectBarTargets(page: Page): Promise<void> {
  const bar = page.getByTestId('club-bottom-bar')
  const targets = bar.locator(':scope > div > a, :scope > div > details > summary')
  const count = await targets.count()
  expect(count).toBe(4)
  for (let index = 0; index < count; index += 1) {
    const box = await targets.nth(index).boundingBox()
    expect(box, `bottom-bar target ${String(index)}`).not.toBeNull()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(48)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48)
  }
}

test('E06-S19 bottom bar, ward and role-context switchers, More without the admin panel for a member, sign-out', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s19')
  try {
    const family = await familyFor(request, club)
    const tomorrow = addDays(calendarDate(), 1)
    // Tomorrow: a Żaki training (both wards, and the coach's group) and a pool class (only the 14-year-old).
    await oneOff(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening dodatkowy',
      type: 'training',
      weekday: weekdayOf(tomorrow),
      fromDaysAhead: 1,
      start: '17:00',
      end: '18:00',
    })
    await oneOff(request, club, family.poolCoordinator.token, {
      groupId: family.poolGroup,
      placeId: family.poolPlace,
      name: 'Basen dodatkowy',
      type: 'training',
      weekday: weekdayOf(tomorrow),
      fromDaysAhead: 1,
      start: '19:00',
      end: '20:00',
    })
    // The coach of Żaki is also the guardian of the other family's child, who trains in Żaki.
    await createGuardianship(request, club.adminToken, {
      guardianPersonId: family.coach.personId,
      wardPersonId: family.other.child.personId,
      isPrimaryPayer: false,
      consents: { regulations: true },
      validFrom: addDays(calendarDate(), -30),
    })

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // --- The guardian of two wards ---
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    await page.goto('/club')
    const bar = page.getByTestId('club-bottom-bar')
    await expect(bar).toBeVisible()
    await expect(bar.getByRole('link', { name: /^(Today|Dziś)$/ })).toHaveAttribute('aria-current', 'page')
    await expect(bar.getByRole('link', { name: /^(Calendar|Kalendarz)$/ })).not.toHaveAttribute('aria-current', 'page')
    await expectBarTargets(page)
    // No role-context switcher for a member who does not coach; the ward switcher for two wards.
    await expect(page.getByTestId('club-switcher-context')).toHaveCount(0)
    await expect(page.getByTestId('club-switcher-ward')).toBeVisible()
    const tile = page.getByTestId('club-tile-calendar')
    await expect(tile.getByTestId('club-today-session').filter({ hasText: 'Trening dodatkowy' })).toBeVisible()
    await expect(tile.getByTestId('club-today-session').filter({ hasText: 'Basen dodatkowy' })).toBeVisible()

    // More: Profile and Sign out, no admin panel for a member without staff roles.
    await bar.getByText(MORE).click()
    const more = page.getByTestId('club-more')
    await expect(more.getByRole('link', { name: /^(Profile|Profil)$/ })).toBeVisible()
    await expect(more.getByRole('button', { name: SIGN_OUT })).toBeVisible()
    await expect(more.getByRole('link', { name: ADMIN_PANEL })).toHaveCount(0)
    const moreBox = await more.getByRole('button', { name: SIGN_OUT }).boundingBox()
    expect(moreBox?.height ?? 0).toBeGreaterThanOrEqual(48)
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club',
      async () => {
        await expect(page.getByTestId('club-bottom-bar')).toBeVisible()
        await expect(page.getByTestId('club-tile-calendar')).toBeVisible()
      },
      { platformBaseline: true },
    )
    await expectNoPageOverflow(page)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()

    // The ward switcher narrows Today to the 16-year-old: the pool class (only the 14-year-old's) disappears.
    await pick(page, 'ward', `${family.elder.firstName} ${family.elder.lastName}`)
    await expect(tile.getByTestId('club-today-session').filter({ hasText: 'Basen dodatkowy' })).toHaveCount(0)
    await expect(tile.getByTestId('club-today-session').filter({ hasText: 'Trening dodatkowy' })).toHaveText(
      new RegExp(family.elder.firstName),
    )
    await expect(tile.getByTestId('club-today-session').filter({ hasText: family.younger.firstName })).toHaveCount(0)

    // The choice follows into the calendar, reached through the bar, which marks Calendar current.
    await bar.getByRole('link', { name: /^(Calendar|Kalendarz)$/ }).click()
    await expect(page).toHaveURL(/\/club\/calendar$/)
    await expect(bar.getByRole('link', { name: /^(Calendar|Kalendarz)$/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('#club-switcher-ward')).toContainText(family.elder.firstName)
    await showCalendarWeekOf(page, tomorrow)
    await expect(page.getByTestId('calendar-item').filter({ hasText: 'Trening dodatkowy' })).toBeVisible()
    await expect(page.getByTestId('calendar-item').filter({ hasText: 'Basen dodatkowy' })).toHaveCount(0)
    await expectBarTargets(page)
    Object.assign(
      violations,
      await scanInColorSchemes(
        page,
        testInfo,
        '/club/calendar',
        async () => {
          await expect(page.getByTestId('club-bottom-bar')).toBeVisible()
          await expect(page.getByTestId('club-calendar-range')).not.toBeEmpty()
        },
        { platformBaseline: true },
      ),
    )
    await expectNoPageOverflow(page)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // Back to everyone: both classes again.
    await page.reload()
    await pick(page, 'ward', /^(Everyone|Wszyscy)$/)
    await showCalendarWeekOf(page, tomorrow)
    await expect(page.getByTestId('calendar-item').filter({ hasText: 'Basen dodatkowy' })).toBeVisible()

    // The messages pages share the bar with Messages current.
    await bar.getByRole('link', { name: /^(Messages|Wiadomości)$/ }).click()
    await expect(page).toHaveURL(/\/club\/messages$/)
    await expect(bar.getByRole('link', { name: /^(Messages|Wiadomości)$/ })).toHaveAttribute('aria-current', 'page')
    await expectBarTargets(page)

    // Sign out from More: the session ends, /login opens, and the back button does not reopen /club.
    await bar.getByText(MORE).click()
    await page.getByTestId('club-more').getByRole('button', { name: SIGN_OUT }).click()
    await expect(page).toHaveURL(/\/login/)
    const me = await page.request.get('/api/people/me')
    expect(me.status()).toBe(401)
    await page.goBack()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByTestId('club-bottom-bar')).toHaveCount(0)
    expect(await page.evaluate(() => window.sessionStorage.getItem('vereino.member-context'))).toBeNull()

    // --- The coach who is also a guardian ---
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto('/club')
    await expect(page.getByTestId('club-switcher-context')).toBeVisible()
    // One ward: no ward switcher. Acting as a member, Today shows the ward's session.
    await expect(page.getByTestId('club-switcher-ward')).toHaveCount(0)
    const coachTile = page.getByTestId('club-tile-calendar')
    await expect(coachTile.getByTestId('club-today-session').filter({ hasText: 'Trening dodatkowy' })).toHaveText(
      new RegExp(family.other.child.firstName),
    )
    await pick(page, 'context', /^(Coach|Trener)$/)
    await expect(
      coachTile.getByRole('heading', { name: /My sessions today and tomorrow|Moje zajęcia dziś i jutro/ }),
    ).toBeVisible()
    const coachSession = coachTile.getByTestId('club-today-session').filter({ hasText: 'Trening dodatkowy' })
    await expect(coachSession).toHaveAttribute('href', /\/club\/occurrences\/[^/]+\/attendance$/)
    await expect(coachTile.getByTestId('club-today-session').filter({ hasText: 'Basen dodatkowy' })).toHaveCount(0)
    // Staff get the admin panel behind More.
    await bar.getByText(MORE).click()
    await expect(page.getByTestId('club-more').getByRole('link', { name: ADMIN_PANEL })).toBeVisible()
    Object.assign(
      violations,
      await scanInColorSchemes(
        page,
        testInfo,
        '/club as coach',
        async () => {
          await expect(page.getByTestId('club-switcher-context')).toBeVisible()
          await expect(page.getByTestId('club-tile-calendar')).toBeVisible()
        },
        { platformBaseline: true },
      ),
    )
    await expectNoPageOverflow(page)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
