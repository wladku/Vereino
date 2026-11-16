import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { listOccurrences, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { call, createClub, uniqueSuffix } from '../_fixtures/club'
import { confirmationToken, requestForm, submitRequest } from '../_fixtures/facility-requests'
import { publicPitch } from '../_fixtures/public-places'
import { PUBLICATION_BLOCKS, publicGet, publish, putSectionPublic, putSettings } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// TEST-N09 (navigation spec REQ-N09, REQ-N10, AC-N09, AC-N10; E09-S07 #261): every public page — club, section,
// session, facilities list, facility calendar and the request confirmation — starts with the header Club · Sections ·
// Facilities · Sign in ("Facilities" only with the calendar block; "Events" only with the events block, covered by TEST-N14), and every link works. The
// sign-in page shows the club of `?club=` (logo, name, tagline), remembers it in the `vereino_club` cookie for the
// next `/login`, shows the neutral page for an unknown and an unpublished slug alike, and never says "Open Mercato".
test.describe.configure({ timeout: 300_000 })

const COOKIE = 'vereino_club'
const YEAR_SECONDS = 365 * 24 * 60 * 60

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

/** The header of the page at `path`: the club link, the links in order with their hrefs and the current one. */
async function expectHeader(
  page: Page,
  input: { slug: string; clubName: string; prefix: string; facilities: boolean; current: string | null },
) {
  const { slug, prefix } = input
  const header = page.getByTestId('public-header')
  await expect(header.getByTestId('public-club-link')).toHaveAttribute('href', `/p/${slug}`)
  await expect(header.getByTestId('public-club-link')).toContainText(input.clubName)
  const nav = header.getByRole('navigation', { name: uiText(`${prefix}.nav.label`, { exact: true }) })
  await expect(nav).toHaveCount(1)
  const expected: Array<[string, string]> = [
    ['club', `/p/${slug}`],
    ['sections', `/p/${slug}#sections`],
    ...(input.facilities ? [['facilities', `/p/${slug}/places`] as [string, string]] : []),
    ['signIn', `/login?club=${slug}`],
  ]
  await expect(nav.getByRole('link')).toHaveCount(expected.length)
  for (const [id, href] of expected) {
    const link = nav.getByTestId(`public-nav-${id}`)
    await expect(link).toHaveAttribute('href', href)
    await expect(link).toHaveText(uiText(`${prefix}.nav.${id}`, { exact: true }))
    // A section page belongs to the sections list: "Sections" marks its location, not the page itself.
    if (id === input.current)
      await expect(link).toHaveAttribute('aria-current', id === 'sections' ? 'location' : 'page')
    else await expect(link).not.toHaveAttribute('aria-current')
  }
  await expect(nav.getByTestId('public-nav-events')).toHaveCount(0)
  if (!input.facilities) await expect(nav.getByTestId('public-nav-facilities')).toHaveCount(0)
}

/** Nothing on the sign-in page names the platform: visible text, the title, image alt texts and the logo file. */
async function expectNoPlatformName(page: Page) {
  const texts = [
    await page.locator('body').innerText(),
    await page.title(),
    ...(await page.locator('img').evaluateAll((images) => images.map((image) => image.getAttribute('alt') ?? ''))),
  ]
  for (const text of texts) expect(text).not.toContain('Open Mercato')
}

async function clubCookie(page: Page) {
  return (await page.context().cookies()).find((cookie) => cookie.name === COOKIE)
}

/** The neutral sign-in page: the form is ready and no club sits above it. */
async function expectNeutralSignIn(page: Page) {
  await expect(page.locator('form[data-auth-ready="1"]')).toBeVisible()
  await expect(page.getByTestId('sign-in-club-loading')).toHaveCount(0)
  await expect(page.getByTestId('sign-in-club')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: uiText('auth.login.brandName', { exact: true }) })).toBeVisible()
}

test('TEST-N09 public header on every public page and the club on the sign-in page', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-n09')
  try {
    const slug = `n09-${uniqueSuffix()}`
    let admin = club.adminToken
    const setup = await publicPitch(request, club, slug)
    expect(
      (await putSectionPublic(request, admin, setup.academy, { isPublic: true, publicSlug: 'akademia' })).status,
    ).toBe(200)
    const occurrenceId = (await listOccurrences(request, admin)).items[0].id
    const clubPage = await publicGet(request, `/api/club_core/public/${slug}`)
    expect(clubPage.status).toBe(200)
    const clubName = (clubPage.body as { club: { name: string } }).club.name

    // The API: `club.nav` in every public response frame; Facilities on, Events not before P-06.
    for (const path of [
      `/api/club_core/public/${slug}`,
      `/api/club_core/public/${slug}/sections/akademia`,
      `/api/activities/public/${slug}/sessions/${occurrenceId}`,
      `/api/facilities/public/${slug}/places`,
      `/api/facilities/public/${slug}/places/${setup.placeSlug}/schedule`,
    ]) {
      const result = await publicGet(request, path)
      expect(result.status, path).toBe(200)
      expect((result.body as { club: { nav: unknown } }).club.nav, path).toEqual({ facilities: true, events: false })
    }

    // Every public page type at 375 px, in both locales.
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const pages: Array<{ path: string; prefix: string; current: string | null; ready: string }> = [
      { path: `/p/${slug}`, prefix: 'club_core.public', current: 'club', ready: 'public-sections' },
      {
        path: `/p/${slug}/sections/akademia`,
        prefix: 'club_core.public',
        current: 'sections',
        ready: 'public-breadcrumb-club',
      },
      {
        path: `/p/${slug}/s/${occurrenceId}`,
        prefix: 'activities.publicSession',
        current: null,
        ready: 'public-session',
      },
      { path: `/p/${slug}/places`, prefix: 'facilities.public', current: 'facilities', ready: 'public-footer' },
      {
        path: `/p/${slug}/places/${setup.placeSlug}?month=${setup.month}`,
        prefix: 'facilities.public',
        current: 'facilities',
        ready: `public-schedule-day-${setup.day}`,
      },
    ]
    const violations: Record<string, unknown[]> = {}
    for (const locale of ['en', 'pl'] as const) {
      await setGuestLocale(page, locale)
      for (const entry of pages) {
        await page.setViewportSize({ width: 375, height: 812 })
        await page.goto(entry.path)
        await expect(page.getByTestId(entry.ready).first(), entry.path).toBeVisible()
        await expectHeader(page, { slug, clubName, prefix: entry.prefix, facilities: true, current: entry.current })
        if (locale === 'en') {
          await expectNoPageOverflow(page)
          violations[entry.path] = await scanBlockingViolations(page, testInfo, {})
        }
      }
    }
    expect(violations).toEqual(Object.fromEntries(Object.keys(violations).map((key) => [key, []])))

    // Every header link works, followed from a facility page.
    await setGuestLocale(page, 'en')
    const placePath = `/p/${slug}/places/${setup.placeSlug}`
    const follow = async (id: string, url: RegExp, ready: string) => {
      await page.goto(placePath)
      await page.getByTestId('public-header').getByTestId(`public-nav-${id}`).click()
      await expect(page).toHaveURL(url)
      await expect(page.getByTestId(ready).first()).toBeVisible()
    }
    await follow('club', new RegExp(`/p/${slug}$`), 'public-sections')
    await follow('sections', new RegExp(`/p/${slug}#sections$`), 'public-sections')
    await follow('facilities', new RegExp(`/p/${slug}/places$`), 'public-footer')
    await follow('signIn', new RegExp(`/login\\?club=${slug}$`), 'sign-in-club')
    await page.goto(placePath)
    await page.getByTestId('public-header').getByTestId('public-club-link').click()
    await expect(page).toHaveURL(new RegExp(`/p/${slug}$`))

    // The request confirmation (P-05) shows the header once the link is confirmed.
    const email = `n09-${club.tenant.organizationId.slice(0, 8)}@example.test`
    const submitted = await submitRequest(slug, setup.placeSlug, requestForm(zoneInstant(setup.day, '13:00'), email))
    expect(submitted.status, submitted.text).toBe(202)
    const token = await confirmationToken(email)
    await page.goto(`/p/${slug}/requests/verify/${encodeURIComponent(token)}`)
    await expect(page.getByTestId('public-verify-awaiting')).toBeVisible()
    await expectHeader(page, { slug, clubName, prefix: 'facilities.public', facilities: true, current: null })

    // The calendar block off: no Facilities link, in the API and on the pages.
    await publish(request, admin, slug, ['contact'])
    for (const path of [`/api/club_core/public/${slug}`, `/api/activities/public/${slug}/sessions/${occurrenceId}`]) {
      const result = await publicGet(request, path)
      expect((result.body as { club: { nav: unknown } }).club.nav, path).toEqual({ facilities: false, events: false })
    }
    for (const entry of pages.slice(0, 3)) {
      await page.goto(entry.path)
      await expect(page.getByTestId(entry.ready).first(), entry.path).toBeVisible()
      await expectHeader(page, { slug, clubName, prefix: entry.prefix, facilities: false, current: entry.current })
    }

    // Sign-in with a known slug: the club's logo, name and tagline above the form; the cookie remembers it.
    await page.context().clearCookies()
    await setGuestLocale(page, 'en')
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.goto(`/login?club=${slug}`)
      const brand = page.getByTestId('sign-in-club')
      await expect(brand.getByTestId('sign-in-club-name')).toHaveText(clubName)
      await expect(brand.getByTestId('sign-in-club-tagline')).toHaveText(
        uiText('vereino.login.tagline', { exact: true }),
      )
      await expect(brand.getByTestId('public-logo-initial').or(brand.getByTestId('public-logo'))).toBeVisible()
      await expect(page.locator('form[data-auth-ready="1"]')).toBeVisible()
      await expectNoPlatformName(page)
    }
    await expect.poll(async () => (await clubCookie(page))?.value).toBe(slug)
    const cookie = await clubCookie(page)
    expect(cookie).toMatchObject({ value: slug, path: '/', sameSite: 'Lax', httpOnly: false })
    const lifetime = (cookie?.expires ?? 0) - Date.now() / 1000
    expect(lifetime).toBeGreaterThan(YEAR_SECONDS - 3600)
    expect(lifetime).toBeLessThanOrEqual(YEAR_SECONDS + 60)
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    expect(await scanBlockingViolations(page, testInfo, { platformBaseline: true })).toEqual([])

    // `/login` alone shows the same club, in Polish too.
    await setGuestLocale(page, 'pl')
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto('/login')
    await expect(page.getByTestId('sign-in-club-name')).toHaveText(clubName)
    await expect(page.getByTestId('sign-in-club-tagline')).toHaveText(uiText('vereino.login.tagline', { exact: true }))
    await expectNoPlatformName(page)

    // After a sign-in through the form the cookie still names the club, and `/login` shows it again.
    const password = `Vereino-${uniqueSuffix()}-Aa1!`
    const reset = await call(request, 'PUT', '/api/auth/users', club.superToken, {
      data: { id: club.adminUserId, password },
    })
    expect(reset.status, JSON.stringify(reset.body)).toBe(200)
    await page.locator('#email').fill(club.tenant.email)
    await page.locator('#password').fill(password)
    await page.locator('form[data-auth-ready="1"] button[type="submit"]').click()
    await expect(page).not.toHaveURL(/\/login/)
    expect((await clubCookie(page))?.value).toBe(slug)
    // A new password ends the user's API tokens (lesson `sign-in-browser-ends-the-api-token`).
    admin = await getAuthToken(request, club.tenant.email, password)
    const origin = new URL(page.url()).origin
    // Sign out: leave the signed-in page first (lesson `leave-backend-page-before-clearing-cookies`), keep the cookie.
    await page.goto('about:blank')
    await page.context().clearCookies()
    await page.context().addCookies([{ name: COOKIE, value: slug, url: origin }])
    await setGuestLocale(page, 'pl')
    await page.goto('/login')
    await expect(page.getByTestId('sign-in-club-name')).toHaveText(clubName)

    // The logo file of the platform card is the Vereino mark.
    const mark = await page.request.get('/open-mercato.svg')
    expect(mark.ok()).toBe(true)
    const markText = await mark.text()
    expect(markText).toContain('Vereino')
    expect(markText).not.toContain('Mercato')

    // An unknown slug: the neutral page, no cookie (negative case).
    await page.context().clearCookies()
    for (const locale of ['en', 'pl'] as const) {
      await setGuestLocale(page, locale)
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.goto(`/login?club=no-such-club-${uniqueSuffix()}`)
        await expectNeutralSignIn(page)
        await expectNoPlatformName(page)
      }
      await page.goto('/login')
      await expectNeutralSignIn(page)
      await expectNoPlatformName(page)
    }
    expect(await clubCookie(page)).toBeUndefined()

    // An unpublished slug reads the same as an unknown one and writes nothing; a remembered one is forgotten — also
    // when the link names it.
    await setGuestLocale(page, 'en')
    await page.goto(`/login?club=${slug}`)
    await expect(page.getByTestId('sign-in-club-name')).toHaveText(clubName)
    await expect.poll(async () => (await clubCookie(page))?.value).toBe(slug)
    const unpublished = await putSettings(request, admin, {
      publication: { enabled: false, blocks: Object.fromEntries(PUBLICATION_BLOCKS.map((block) => [block, false])) },
    })
    expect(unpublished.status, JSON.stringify(unpublished.body)).toBe(200)
    await page.goto(`/login?club=${slug}`)
    await expectNeutralSignIn(page)
    await expect.poll(async () => await clubCookie(page)).toBeUndefined()
    await page.context().clearCookies()
    await setGuestLocale(page, 'en')
    await page.goto(`/login?club=${slug}`)
    await expectNeutralSignIn(page)
    expect(await clubCookie(page)).toBeUndefined()
    await page.context().addCookies([{ name: COOKIE, value: slug, url: page.url() }])
    await page.goto('/login')
    await expectNeutralSignIn(page)
    await expect.poll(async () => await clubCookie(page)).toBeUndefined()
  } finally {
    await club.cleanup()
  }
})
