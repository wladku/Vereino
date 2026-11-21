import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { createClub, uniqueSuffix } from '../_fixtures/club'
import { publicGet, publish, putSettings } from '../_fixtures/publication'
import { uiText, uiTextIn } from '../_fixtures/ui-text'

// E19-S03 (issue #469; engineering standards S9.2, S9.3, S9.7): a club that has not set the address of its own privacy
// policy on B-03 gets Vereino's default notice at `/p/<slug>/privacy`, in the page language, with the club's name
// filled in and a short version for children at the end; the footer of every public page links there. A club that set
// its own address keeps it: the API still sends that address, the footer links to it and the notice page only points to
// it (negative case).
test.describe.configure({ timeout: 300_000 })

const CLUB = 'Klub Delfin'
const OWN = 'https://klub-delfin.example/polityka-prywatnosci'

async function setGuestLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

async function privacyLinkOf(request: APIRequestContext, slug: string): Promise<string | null> {
  const result = await publicGet(request, `/api/club_core/public/${slug}`)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return (result.body as { club: { links: { privacyPolicy: string | null } } }).club.links.privacyPolicy
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
}

test('E19-S03 default privacy notice in the page language, with a short version for children', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e19-s03-privacy')
  try {
    const slug = `e1903-${uniqueSuffix()}`
    const admin = club.adminToken
    await publish(request, admin, slug, ['description_schedule'], { shortName: CLUB })
    const notice = `/p/${slug}/privacy`
    // A new club has set nothing: the API keeps sending null, the page links to the default notice.
    expect(await privacyLinkOf(request, slug)).toBeNull()

    page.setDefaultTimeout(30_000)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)
    await setGuestLocale(page, 'en')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/p/${slug}`)
    const footerLink = page.getByTestId('public-footer-privacy')
    await expect(footerLink).toHaveAttribute('href', notice)
    await expect(footerLink).toHaveAttribute('data-source', 'default')
    await footerLink.click()
    await expect(page).toHaveURL(new RegExp(`${notice}$`))

    // English: the title, the club's name in the text, every section and the children's version.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(uiText('club_core.privacy.title', { exact: true }))
    await expect(page.getByTestId('privacy-intro')).toHaveText(
      uiTextIn('en', 'club_core.privacy.intro').replace('{club}', CLUB),
    )
    await expect(page.getByTestId('privacy-section-controller')).toContainText(CLUB)
    for (const id of ['data', 'purposes', 'children', 'recipients', 'retention', 'rights', 'cookies', 'changes']) {
      await expect(page.getByTestId(`privacy-section-${id}`), id).toBeVisible()
    }
    const kids = page.getByTestId('privacy-section-kids')
    await expect(kids.getByRole('heading', { level: 2 })).toHaveText(uiTextIn('en', 'club_core.privacy.kids.title'))
    await expect(kids).toContainText(uiTextIn('en', 'club_core.privacy.kids.lead1').replace('{club}', CLUB))
    await expect(kids.getByRole('listitem')).toHaveCount(6)
    await expect(page).toHaveTitle(new RegExp(`^${CLUB} — `))
    // The footer of the notice page links to itself; the jump link reaches the children's version.
    await expect(page.getByTestId('public-footer-privacy')).toHaveAttribute('href', notice)
    await page.getByTestId('privacy-children-link').click()
    await expect(page).toHaveURL(new RegExp(`${notice}#privacy-for-children$`))
    await expect(kids).toBeInViewport()

    // Light and dark, desktop: no blocking accessibility violation.
    const violations = await scanInColorSchemes(page, testInfo, 'privacy notice (desktop, en)', async () => {
      await expect(page.getByTestId('privacy-notice')).toBeVisible()
    })
    expect(violations).toEqual({})
    await shot(page, testInfo, 'desktop-en-dark')
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()
    await shot(page, testInfo, 'desktop-en-light')

    // 375 px, Polish, light and dark: Polish text with the club's name, no horizontal overflow.
    await setGuestLocale(page, 'pl')
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(uiTextIn('pl', 'club_core.privacy.title'))
    await expect(page.getByTestId('privacy-intro')).toHaveText(
      uiTextIn('pl', 'club_core.privacy.intro').replace('{club}', CLUB),
    )
    await expect(kids).toContainText(uiTextIn('pl', 'club_core.privacy.kids.lead1').replace('{club}', CLUB))
    await expectNoPageOverflow(page)
    await shot(page, testInfo, 'mobile-pl-light')
    const mobileViolations = await scanInColorSchemes(page, testInfo, 'privacy notice (375 px, pl)', async () => {
      await expect(page.getByTestId('privacy-notice')).toBeVisible()
    })
    expect(mobileViolations).toEqual({})
    await expectNoPageOverflow(page)
    await shot(page, testInfo, 'mobile-pl-dark')

    // Negative case: a club that wrote its own policy keeps it everywhere.
    expect((await putSettings(request, admin, { privacyPolicyUrl: OWN })).status).toBe(200)
    expect(await privacyLinkOf(request, slug)).toBe(OWN)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(`/p/${slug}`)
    await expect(page.getByTestId('public-footer-privacy')).toHaveAttribute('href', OWN)
    await expect(page.getByTestId('public-footer-privacy')).toHaveAttribute('data-source', 'club')
    await page.goto(notice)
    await expect(page.getByTestId('privacy-own')).toHaveText(
      uiTextIn('pl', 'club_core.privacy.own.message').replace('{club}', CLUB),
    )
    await expect(page.getByTestId('privacy-own-link')).toHaveAttribute('href', OWN)
    await expect(page.getByTestId('privacy-section-controller')).toHaveCount(0)
    await expect(page.getByTestId('privacy-section-kids')).toHaveCount(0)
    await shot(page, testInfo, 'mobile-pl-own-policy')

    // A slug no club publishes: the 404 notice, nothing about any club.
    await page.goto(`/p/e1903-missing-${uniqueSuffix()}/privacy`)
    await expect(page.getByTestId('public-not-found')).toBeVisible()
    await expect(page.getByTestId('public-footer')).toHaveCount(0)

    expect(consoleErrors.filter((line) => !line.includes('404'))).toEqual([])
  } finally {
    await club.cleanup()
  }
})
