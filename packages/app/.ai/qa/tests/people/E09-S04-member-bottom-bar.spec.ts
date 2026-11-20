import { expect, test, type Page } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import {
  OPTIMISTIC_LOCK_HEADER,
  assignRole,
  birthDateTurning,
  calendarDate,
  createClub,
  createStaff,
  userRoles,
} from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { makeMaintainer } from '../_fixtures/maintenance'
import { createGuardianship } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// Issue #258 (E09-S04; navigation spec REQ-N05, REQ-N06, TEST-N06, AC-N05, AC-N06): every `/club` page of the five
// member modules shows the same bottom bar for the same person — Today · Calendar · Messages · a fourth tab (Payments
// for an adult payer, otherwise Facilities with `facilities.view`, otherwise none) · More — and More lists every
// member destination the person may open, each opening its page. While the feature check fails the bar degrades to
// three tabs and More with Profile and Sign out, without an error, and the next page load asks again. Targets are at
// least 48 × 48 px, and nothing scrolls sideways at 320 px, in light and dark. The people: the guardian (en and pl), a
// 16-year-old participant, a coach without own payments, the same coach once they coordinate and guard a ward, a
// maintenance planner, the facility attendant and an administrator who is a member too.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const MORE = uiText('people.club.nav.more', { exact: true })
const SIGN_OUT = uiText('people.club.nav.signOut', { exact: true })
const TODAY = uiText('people.club.nav.today', { exact: true })
const CALENDAR = uiText('people.club.nav.calendar', { exact: true })
const MESSAGES = uiText('people.club.nav.messages', { exact: true })
const PAYMENTS = uiText('people.club.nav.payments', { exact: true })
const FACILITIES = uiText('people.club.nav.facilities', { exact: true })

type Bar = { tabs: string[]; more: string[] }

/**
 * Opens a member page and waits until the frame's own feature check has answered and rendered: the bar shows three
 * tabs until then, so a bar read earlier could pass a negative check for the wrong reason. The places pages make a
 * second feature check of their own; the frame's is the one that asks for `activities.reports.view_own`.
 */
async function openSettled(page: Page, path: string): Promise<void> {
  const answered = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/feature-check') &&
      (response.request().postData() ?? '').includes('activities.reports.view_own'),
  )
  await page.goto(path)
  await answered
  // The store notifies React after the answer; two frames later the bar is rendered from it.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve()
          })
        })
      }),
  )
}

/** The bar's tab names and the More entries (links only; Sign out is a button), with More opened and closed again. */
async function readBar(page: Page, tabCount: number): Promise<Bar> {
  const bar = page.getByTestId('club-bottom-bar')
  const tabLinks = bar.locator(':scope > div > a')
  await expect(tabLinks).toHaveCount(tabCount)
  const tabs = (await tabLinks.allInnerTexts()).map((text) => text.trim())
  await bar.getByText(MORE).click()
  const more = page.getByTestId('club-more')
  await expect(more.getByRole('button', { name: SIGN_OUT })).toBeVisible()
  const entries = (await more.getByRole('link').allInnerTexts()).map((text) => text.trim())
  await bar.getByText(MORE).click()
  return { tabs, more: entries }
}

/** Every bar target and every More entry is at least 48 px high, and the bar targets 48 px wide. */
async function expectTargets(page: Page, tabCount: number): Promise<void> {
  const bar = page.getByTestId('club-bottom-bar')
  const targets = bar.locator(':scope > div > a, :scope > div > details > summary')
  await expect(targets).toHaveCount(tabCount + 1)
  for (let index = 0; index <= tabCount; index += 1) {
    const box = await targets.nth(index).boundingBox()
    expect(box?.width ?? 0, `bar target ${String(index)}`).toBeGreaterThanOrEqual(48)
    expect(box?.height ?? 0, `bar target ${String(index)}`).toBeGreaterThanOrEqual(48)
  }
  await bar.getByText(MORE).click()
  const entries = page.getByTestId('club-more').locator('a, button')
  for (let index = 0; index < (await entries.count()); index += 1) {
    const box = await entries.nth(index).boundingBox()
    expect(box?.height ?? 0, `More entry ${String(index)}`).toBeGreaterThanOrEqual(48)
  }
  await bar.getByText(MORE).click()
}

/** The same bar, with `tabCount` tabs, on each of the pages once the feature check has answered; returns it. */
async function expectSameBar(page: Page, tabCount: number, paths: string[]): Promise<Bar> {
  let first: Bar | null = null
  for (const path of paths) {
    await openSettled(page, path)
    const bar = await readBar(page, tabCount)
    if (first) expect(bar, path).toEqual(first)
    else first = bar
  }
  return first as Bar
}

/** Follows every More entry with a full page load: each answers 200 and renders its page in the frame, not a refusal. */
async function followEveryEntry(page: Page): Promise<void> {
  const bar = page.getByTestId('club-bottom-bar')
  await bar.getByText(MORE).click()
  const hrefs = await page
    .getByTestId('club-more')
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  await bar.getByText(MORE).click()
  for (const href of hrefs) {
    const response = await page.goto(href)
    expect(response?.status(), href).toBe(200)
    expect(new URL(page.url()).pathname, href).toBe(href)
    if (href.startsWith('/club')) await expect(page.getByTestId('club-bottom-bar'), href).toBeVisible()
    else await expect(page.locator('main').first(), href).toBeVisible()
  }
}

/** Sets the signed-in member's interface language through the profile route, then reloads. */
async function setMemberLocale(page: Page, locale: 'pl' | 'en'): Promise<void> {
  const me = await page.request.get('/api/people/me')
  const body = (await me.json()) as { person: { updatedAt: string } }
  const updatedAt = body.person.updatedAt
  const saved = await page.request.put('/api/people/me', {
    data: { preferredLocale: locale },
    headers: { [OPTIMISTIC_LOCK_HEADER]: updatedAt },
  })
  expect(saved.status(), await saved.text()).toBe(200)
  await openSettled(page, '/club')
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
}

test('E09-S04 the same bottom bar on every member page and every member page reachable from More', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e09-s04')
  try {
    const family = await familyFor(request, club)
    const attendant = await signedInStaff(request, club, {
      firstName: 'Adam',
      lastName: 'Animator',
      role: 'facility_operator',
      placeId: family.pitch,
    })
    const administrator = await signedInStaff(request, club, {
      firstName: 'Ewa',
      lastName: 'Prezes',
      role: 'club_admin',
    })

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // --- The guardian: Payments on every page of the five modules; More with Profile and Orders ---
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    for (const locale of ['en', 'pl'] as const) {
      await setMemberLocale(page, locale)
      const guardianBar = await expectSameBar(page, 4, [
        '/club',
        '/club/calendar',
        '/club/messages',
        '/club/payments',
        '/club/profile',
        '/club/orders',
      ])
      expect(guardianBar).toEqual(
        locale === 'en'
          ? { tabs: ['Today', 'Calendar', 'Messages', 'Payments'], more: ['Profile', 'Orders (e.g. kit)'] }
          : {
              tabs: ['Dziś', 'Kalendarz', 'Wiadomości', 'Płatności'],
              more: ['Profil', 'Zamówienia (np. stroje)'],
            },
      )
    }
    const bar = page.getByTestId('club-bottom-bar')
    // The current tab: Payments also on an order, Calendar on its page, More on the profile.
    // One current mark only: the Orders entry behind More is not marked while the Payments tab is.
    await openSettled(page, '/club/orders')
    await expect(bar.getByRole('link', { name: PAYMENTS })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
    await openSettled(page, '/club/calendar')
    await expect(bar.getByRole('link', { name: CALENDAR })).toHaveAttribute('aria-current', 'page')
    await openSettled(page, '/club/profile')
    await expect(bar.locator('summary')).toHaveAttribute('aria-current', 'page')
    await expectTargets(page, 4)
    await followEveryEntry(page)
    await page.goto('/club')
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club guardian',
      async () => {
        await expect(page.getByTestId('club-bottom-bar').getByRole('link', { name: PAYMENTS })).toBeVisible()
      },
      { platformBaseline: true },
    )
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // The feature check fails: three tabs and More with Profile and Sign out, no error; the next page load asks again.
    await page.route('**/api/auth/feature-check', (route) => route.fulfill({ status: 500, body: '{}' }))
    await openSettled(page, '/club/messages')
    expect(await readBar(page, 3)).toEqual({ tabs: ['Dziś', 'Kalendarz', 'Wiadomości'], more: ['Profil'] })
    // No error message (the empty alert is the Next.js route announcer).
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0)
    await page.unroute('**/api/auth/feature-check')
    await openSettled(page, '/club/calendar')
    await expect(bar.getByRole('link', { name: PAYMENTS })).toBeVisible()

    // --- The 16-year-old participant: three tabs, More with Profile only ---
    await signInBrowser(page, request, club, family.elder.userId, family.elder.email)
    const minorBar = await expectSameBar(page, 3, ['/club', '/club/calendar', '/club/messages', '/club/profile'])
    expect(minorBar.more).toHaveLength(1)
    await expect(bar.getByRole('link', { name: PAYMENTS })).toHaveCount(0)
    await expectTargets(page, 3)

    // --- The coach without own payments: Facilities as the tab; My units, Groups (#274) and My groups' payments behind
    // More ---
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    const coachBar = await expectSameBar(page, 4, [
      '/club',
      '/club/calendar',
      '/club/messages',
      '/club/places',
      '/club/coach/units',
      '/club/coach/payments',
    ])
    await expect(bar.getByRole('link', { name: FACILITIES })).toBeVisible()
    expect(coachBar.more).toEqual(
      expect.arrayContaining([expect.stringMatching(uiText('people.club.nav.myUnits', { exact: true }))]),
    )
    expect(coachBar.more).toEqual(
      expect.arrayContaining([expect.stringMatching(uiText('people.club.nav.groups', { exact: true }))]),
    )
    expect(coachBar.more).toEqual(
      expect.arrayContaining([expect.stringMatching(uiText('people.club.nav.groupPayments', { exact: true }))]),
    )
    expect(coachBar.more.some((entry) => uiText('people.club.nav.facilitiesMore', { exact: true }).test(entry))).toBe(
      false,
    )
    expect(coachBar.more).toHaveLength(4)
    await openSettled(page, '/club/places')
    await expect(bar.getByRole('link', { name: FACILITIES })).toHaveAttribute('aria-current', 'page')
    await expectTargets(page, 4)
    await followEveryEntry(page)
    Object.assign(
      violations,
      await scanInColorSchemes(
        page,
        testInfo,
        '/club coach',
        async () => {
          await expect(page.getByTestId('club-bottom-bar').getByRole('link', { name: FACILITIES })).toBeVisible()
        },
        { platformBaseline: true },
      ),
    )
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // --- The same coach once they coordinate the academy and guard a ward: Payments as the tab, Facilities and
    // booking, Orders and the admin panel behind More ---
    await createGuardianship(request, club.adminToken, {
      guardianPersonId: family.coach.personId,
      wardPersonId: family.other.child.personId,
      isPrimaryPayer: false,
      consents: { regulations: true },
      validFrom: calendarDate(-30),
    })
    await assignRole(request, club.adminToken, {
      personId: family.coach.personId,
      role: 'coordinator',
      sectionId: family.academy,
      validFrom: '2020-01-01',
    })
    await expect
      .poll(() => userRoles(request, club, family.coach.userId), { timeout: 20_000 })
      .toEqual(expect.arrayContaining(['vereino_coordinator', 'vereino_payer']))
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    const busyBar = await expectSameBar(page, 4, ['/club', '/club/payments', '/club/places'])
    await expect(bar.getByRole('link', { name: PAYMENTS })).toBeVisible()
    expect(busyBar.more).toEqual([
      expect.stringMatching(uiText('people.club.nav.profile', { exact: true })),
      expect.stringMatching(uiText('people.club.nav.myUnits', { exact: true })),
      expect.stringMatching(uiText('people.club.nav.groups', { exact: true })),
      expect.stringMatching(uiText('people.club.nav.facilitiesMore', { exact: true })),
      expect.stringMatching(uiText('people.club.nav.orders', { exact: true })),
      expect.stringMatching(uiText('people.club.nav.groupPayments', { exact: true })),
      // A section coordinator organises club events from the phone (E14-S05, #380).
      expect.stringMatching(uiText('people.club.nav.clubEvents', { exact: true })),
      expect.stringMatching(uiText('people.club.nav.backend', { exact: true })),
    ])
    // The places belong to More while Payments is the tab.
    await expect(bar.locator('summary')).toHaveAttribute('aria-current', 'page')
    await followEveryEntry(page)

    // --- A maintenance planner without other roles: three tabs; the places behind More ---
    const plannerStaff = await createStaff(request, club, {
      firstName: 'Marek',
      lastName: 'Konserwator',
      birthDate: birthDateTurning(40),
    })
    await makeMaintainer(request, club, plannerStaff, family.pitch)
    await signInBrowser(page, request, club, plannerStaff.userId, plannerStaff.email)
    const plannerBar = await expectSameBar(page, 3, ['/club', '/club/messages', '/club/places'])
    expect(plannerBar.more).toEqual([
      expect.stringMatching(uiText('people.club.nav.profile', { exact: true })),
      expect.stringMatching(uiText('people.club.nav.facilitiesMore', { exact: true })),
    ])
    await expect(bar.locator('summary')).toHaveAttribute('aria-current', 'page')
    await expectTargets(page, 3)
    await followEveryEntry(page)

    // --- The facility attendant: Facilities as the tab; Today at the facility behind More ---
    await signInBrowser(page, request, club, attendant.userId, attendant.email)
    const attendantBar = await expectSameBar(page, 4, ['/club', '/club/messages', '/club/facility'])
    await expect(bar.getByRole('link', { name: FACILITIES })).toBeVisible()
    expect(attendantBar.more).toEqual(
      expect.arrayContaining([expect.stringMatching(uiText('people.club.nav.facilityToday', { exact: true }))]),
    )
    await openSettled(page, '/club/facility')
    await expect(bar.locator('summary')).toHaveAttribute('aria-current', 'page')
    await followEveryEntry(page)

    // --- The administrator on the phone: Accept cash and the admin panel behind More ---
    await signInBrowser(page, request, club, administrator.userId, administrator.email)
    const adminBar = await expectSameBar(page, 4, ['/club', '/club/calendar', '/club/cash'])
    expect(adminBar.more).toEqual(
      expect.arrayContaining([
        expect.stringMatching(uiText('people.club.nav.acceptCash', { exact: true })),
        expect.stringMatching(uiText('people.club.nav.clubEvents', { exact: true })),
        expect.stringMatching(uiText('people.club.nav.backend', { exact: true })),
      ]),
    )
    await openSettled(page, '/club/cash')
    await expect(bar.locator('summary')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('club-bottom-bar').getByRole('link', { name: TODAY })).toBeVisible()
    await expect(page.getByTestId('club-bottom-bar').getByRole('link', { name: MESSAGES })).toBeVisible()
    await expectTargets(page, 4)
    await followEveryEntry(page)
    await page.goto('/club')
    await expectNoPageOverflow(page)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
