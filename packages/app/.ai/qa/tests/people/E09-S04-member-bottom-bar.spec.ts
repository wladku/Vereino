import { expect, test, type Page } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'

// Issue #258 (E09-S04; navigation spec REQ-N05, REQ-N06, TEST-N06, AC-N05, AC-N06): every `/club` page of the five
// member modules shows the same bottom bar for the same person — Today · Calendar · Messages · a fourth tab (Payments
// for an adult payer, otherwise Facilities with `facilities.view`, otherwise none) · More — and More lists every
// member destination the person may open, each opening its page. While the feature check fails the bar degrades to
// three tabs and More with Profile and Sign out, without an error, and the next page load asks again. Targets are at
// least 48 × 48 px, and nothing scrolls sideways at 320 px, in light and dark.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const MORE = /^(More|Więcej)$/
const SIGN_OUT = /^(Sign out|Wyloguj się)$/
const TODAY = /^(Today|Dziś)$/
const CALENDAR = /^(Calendar|Kalendarz)$/
const MESSAGES = /^(Messages|Wiadomości)$/
const PAYMENTS = /^(Payments|Płatności)$/
const FACILITIES = /^(Facilities|Obiekty)$/

type Bar = { tabs: string[]; more: string[] }

/** The bar's tab names and the More entries (links only; Sign out is a button), with More opened and closed again. */
async function readBar(page: Page): Promise<Bar> {
  const bar = page.getByTestId('club-bottom-bar')
  await expect(bar).toBeVisible()
  const tabs = (await bar.locator(':scope > div > a').allInnerTexts()).map((text) => text.trim())
  await bar.getByText(MORE).click()
  const more = page.getByTestId('club-more')
  await expect(more.getByRole('button', { name: SIGN_OUT })).toBeVisible()
  const entries = (await more.getByRole('link').allInnerTexts()).map((text) => text.trim())
  await bar.getByText(MORE).click()
  return { tabs, more: entries }
}

/** Every bar target and every More entry is at least 48 px high, and the bar targets 48 px wide. */
async function expectTargets(page: Page): Promise<void> {
  const bar = page.getByTestId('club-bottom-bar')
  const targets = bar.locator(':scope > div > a, :scope > div > details > summary')
  for (let index = 0; index < (await targets.count()); index += 1) {
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

/** The same bar on each of the pages; returns it. */
async function expectSameBar(page: Page, paths: string[]): Promise<Bar> {
  let first: Bar | null = null
  for (const path of paths) {
    await page.goto(path)
    const bar = await readBar(page)
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
  await page.goto('/club')
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
      const guardianBar = await expectSameBar(page, [
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
    await page.goto('/club/orders')
    await expect(bar.getByRole('link', { name: PAYMENTS })).toHaveAttribute('aria-current', 'page')
    await page.goto('/club/calendar')
    await expect(bar.getByRole('link', { name: CALENDAR })).toHaveAttribute('aria-current', 'page')
    await page.goto('/club/profile')
    await expect(bar.locator('summary')).toHaveAttribute('aria-current', 'page')
    await expectTargets(page)
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
    await page.goto('/club/messages')
    expect(await readBar(page)).toEqual({ tabs: ['Dziś', 'Kalendarz', 'Wiadomości'], more: ['Profil'] })
    // No error message (the empty alert is the Next.js route announcer).
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0)
    await page.unroute('**/api/auth/feature-check')
    await page.goto('/club/calendar')
    await expect(bar.getByRole('link', { name: PAYMENTS })).toBeVisible()

    // --- The 16-year-old participant: three tabs, More with Profile only ---
    await signInBrowser(page, request, club, family.elder.userId, family.elder.email)
    const minorBar = await expectSameBar(page, ['/club', '/club/calendar', '/club/messages', '/club/profile'])
    expect(minorBar.tabs).toHaveLength(3)
    expect(minorBar.more).toHaveLength(1)
    await expect(bar.getByRole('link', { name: PAYMENTS })).toHaveCount(0)
    await expectTargets(page)

    // --- The coach without own payments: Facilities as the tab; My units and My groups' payments behind More ---
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    const coachBar = await expectSameBar(page, [
      '/club',
      '/club/calendar',
      '/club/messages',
      '/club/places',
      '/club/coach/units',
      '/club/coach/payments',
    ])
    expect(coachBar.tabs).toHaveLength(4)
    await expect(bar.getByRole('link', { name: FACILITIES })).toBeVisible()
    expect(coachBar.more).toEqual(expect.arrayContaining([expect.stringMatching(/^(My units|Moje jednostki)$/)]))
    expect(coachBar.more).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(My groups' payments|Płatności moich grup)$/)]),
    )
    expect(coachBar.more.some((entry) => /^(Facilities and booking|Obiekty i rezerwacje)$/.test(entry))).toBe(false)
    expect(coachBar.more).toHaveLength(3)
    await page.goto('/club/places')
    await expect(bar.getByRole('link', { name: FACILITIES })).toHaveAttribute('aria-current', 'page')
    await expectTargets(page)
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

    // --- The facility attendant: Facilities as the tab; Today at the facility behind More ---
    await signInBrowser(page, request, club, attendant.userId, attendant.email)
    const attendantBar = await expectSameBar(page, ['/club', '/club/messages', '/club/facility'])
    await expect(bar.getByRole('link', { name: FACILITIES })).toBeVisible()
    expect(attendantBar.more).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(Today at the facility|Dziś na obiekcie)$/)]),
    )
    await page.goto('/club/facility')
    await expect(bar.locator('summary')).toHaveAttribute('aria-current', 'page')
    await followEveryEntry(page)

    // --- The administrator on the phone: Accept cash and the admin panel behind More ---
    await signInBrowser(page, request, club, administrator.userId, administrator.email)
    const adminBar = await expectSameBar(page, ['/club', '/club/calendar', '/club/cash'])
    expect(adminBar.more).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(Accept cash|Przyjmij gotówkę)$/),
        expect.stringMatching(/^(Admin panel|Panel administracyjny)$/),
      ]),
    )
    await page.goto('/club/cash')
    await expect(bar.locator('summary')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('club-bottom-bar').getByRole('link', { name: TODAY })).toBeVisible()
    await expect(page.getByTestId('club-bottom-bar').getByRole('link', { name: MESSAGES })).toBeVisible()
    await expectTargets(page)
    await followEveryEntry(page)
    await page.goto('/club')
    await expectNoPageOverflow(page)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
