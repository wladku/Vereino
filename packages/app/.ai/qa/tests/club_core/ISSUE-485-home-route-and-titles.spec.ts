import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { createClub } from '../_fixtures/club'
import { signInBrowser, signOutBrowser } from '../_fixtures/club-structure'
import { publicGet, publish, putSettings } from '../_fixtures/publication'
import { uiTextIn } from '../_fixtures/ui-text'

// ISSUE-485 (E20-S06; owner decisions 4 and 5 of epic #479): no Open Mercato template is left. A guest at `/` lands on
// the public page of the instance's club (`VEREINO_HOME_CLUB_SLUG`, `qa-home-club` in the test environment) while it
// is published and on `/login` otherwise; `/start` answers 404 in production; the tab says "Vereino" ("{page} —
// Vereino" in the panel, "{club} — {page}" on a club page) in both locales; the panel shows the Vereino mark, never the
// platform logo, and nothing names the platform or hints at a demo password.
test.describe.configure({ timeout: 300_000 })

const HOME_SLUG = 'qa-home-club'
const LOCALES = ['en', 'pl'] as const
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
] as const

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

/** Nothing names the platform or shows the start page's role cards and demo hints: text, title and image alt texts. */
async function expectNoTemplate(page: Page, locale: 'en' | 'pl') {
  const texts = [
    await page.locator('body').innerText(),
    await page.title(),
    ...(await page.locator('img').evaluateAll((images) => images.map((image) => image.getAttribute('alt') ?? ''))),
  ]
  for (const text of texts) {
    expect(text).not.toContain('Open Mercato')
    expect(text).not.toContain(uiTextIn(locale, 'startPage.chooseRole.title'))
  }
}

test('ISSUE-485 "/" leads to the club or the sign-in page, /start is gone and titles say Vereino', async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(30_000)

  // The platform sign-in card hard-codes `/open-mercato.svg` (V-N05b): that file is the Vereino mark.
  const mark = await page.request.get('/vereino-mark.svg')
  const cardLogo = await page.request.get('/open-mercato.svg')
  expect(mark.ok() && cardLogo.ok()).toBe(true)
  expect(await cardLogo.text()).toBe(await mark.text())

  // Production: the platform start page does not exist.
  const start = await page.request.get('/start', { maxRedirects: 0 })
  expect(start.status()).toBe(404)

  // No club publishes its page under the home slug yet: a guest lands on the sign-in page, titled "Vereino".
  for (const locale of LOCALES) {
    await setLocale(page, locale)
    await page.goto('/')
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(page.locator('form[data-auth-ready="1"]')).toBeVisible()
    await expect(page).toHaveTitle(uiTextIn(locale, 'auth.login.brandName'))
    await expectNoTemplate(page, locale)
  }

  const club = await createClub(request, 'issue-485')
  try {
    await publish(request, club.adminToken, HOME_SLUG, [])
    const clubPage = await publicGet(request, `/api/club_core/public/${HOME_SLUG}`)
    expect(clubPage.status).toBe(200)
    const clubName = (clubPage.body as { club: { name: string } }).club.name

    // Published: a guest at `/` lands on the club page, titled "{club} — {page}", at 375 px and on a desktop.
    for (const locale of LOCALES) {
      await setLocale(page, locale)
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport)
        await page.goto('/')
        await expect(page).toHaveURL(new RegExp(`/p/${HOME_SLUG}$`))
        await expect(page.getByTestId('public-header')).toBeVisible()
        await expect(page).toHaveTitle(`${clubName} — ${uiTextIn(locale, 'club_core.public.pageTitle')}`)
        await expectNoTemplate(page, locale)
      }
    }

    // A missing section of the published club carries no club data, not even in the title (E02-S05).
    await page.goto(`/p/${HOME_SLUG}/sections/no-such-section`)
    await expect(page.getByTestId('public-not-found')).toBeVisible()
    expect(await page.title()).not.toContain(clubName)
    await page.goto(`/p/${HOME_SLUG}/events/no-such-event`)
    expect(await page.title()).not.toContain(clubName)

    // A signed-in administrator at `/` goes into the panel: "Vereino" on the dashboard, "{page} — Vereino" on a page,
    // and the Vereino mark in the sidebar while the club has no logo.
    const email = club.tenant.email
    const password = await signInBrowser(page, request, club, club.adminUserId, email)
    for (const locale of LOCALES) {
      await setLocale(page, locale)
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport)
        await page.goto('/')
        await expect(page).toHaveURL(/\/backend(?:\?|$)/)
        const product = uiTextIn(locale, 'app.metadata.title')
        await expect(page).toHaveTitle(product)
        await page.goto('/backend/club/publication')
        await expect(page).toHaveTitle(`${uiTextIn(locale, 'club_core.nav.publication')} — ${product}`)
        await expect(page.locator('img[src*="vereino-mark.svg"]').first()).toBeAttached()
        await expectNoTemplate(page, locale)
      }
    }
    await signOutBrowser(page)

    // The club switches its page off: `/` leads a guest to the sign-in page again.
    // Signing in the browser ended the earlier API token (lesson `sign-in-browser-ends-the-api-token`).
    const adminToken = await getAuthToken(request, email, password)
    const off = await putSettings(request, adminToken, { publication: { enabled: false } })
    expect(off.status, JSON.stringify(off.body)).toBe(200)
    await page.goto('/')
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
  } finally {
    await club.cleanup()
  }
})
