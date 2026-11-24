import { expect, test, type Page } from '@playwright/test'
import { expectNoPageOverflow, scanInColorSchemes } from '../_fixtures/axe'
import { createClub, uniqueSuffix, type Club } from '../_fixtures/club'
import { startClubDomainApp, type ClubDomainApp } from '../_fixtures/club-domain'
import { publicGet, publish } from '../_fixtures/publication'
import { uiTextIn } from '../_fixtures/ui-text'

// TEST-M03 and TEST-M02 (many clubs spec phase 3, REQ-M02, REQ-M01, AC-M02; E22-S05 #631): with `VEREINO_CLUB_DOMAIN`
// set, the request's host picks the club. Two clubs (two tenants) at `<slug>.localhost:<port>` each open their own public
// page from `/`; the bare domain and the host of `APP_URL` show the neutral landing page (both locales, 375 px, light and
// dark, no blocking axe violation); an unknown label answers 404; `/p/<slug>` opened anywhere else moves to the club's
// address. The sign-in page on a club's address targets that club's tenant, so club B's form refuses club A's account;
// a session of club A opened on club B's address goes back to A's address; a forged `x-vereino-club-slug` header changes
// nothing; the platform reset page stays on `APP_URL` (owner's decision of 2026-11-23, option (c)). The shared test app
// keeps its one-club behaviour; a second process on the same build and database runs with the club domain.
test.describe.configure({ mode: 'serial', timeout: 600_000 })

type ClubAtAddress = { club: Club; slug: string; name: string; origin: string }

let app: ClubDomainApp
let clubA: ClubAtAddress
let clubB: ClubAtAddress

async function publishedClub(request: Parameters<typeof createClub>[0], label: string): Promise<ClubAtAddress> {
  const club = await createClub(request, label)
  const slug = `qa-${label}-${uniqueSuffix()}`
  await publish(request, club.adminToken, slug, [])
  const page = await publicGet(request, `/api/club_core/public/${slug}`)
  expect(page.status).toBe(200)
  const name = (page.body as { club?: { name?: string } }).club?.name ?? ''
  expect(name).not.toBe('')
  return { club, slug, name, origin: app.clubUrl(slug) }
}

async function signInOnForm(page: Page, email: string, password: string) {
  const form = page.locator('form[data-auth-ready="1"]')
  await expect(form).toBeVisible()
  await form.locator('input[name="email"]').fill(email)
  await form.locator('input[name="password"]').fill(password)
  const answer = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'))
  await form.locator('input[name="password"]').press('Enter')
  return answer
}

/** Undone in reverse order after the tests, also when `beforeAll` stopped half-way. */
const cleanups: Array<() => Promise<void>> = []

// `describe.configure({ timeout })` raises the tests' timeout only; hooks keep the config's 20 s. Starting the second
// `next start` alone may take up to 180 s, so both hooks set their own timeout (#701).
test.beforeAll(async ({ request }) => {
  test.setTimeout(300_000)
  app = await startClubDomainApp()
  cleanups.push(() => app.stop())
  clubA = await publishedClub(request, 'm03a')
  cleanups.push(() => clubA.club.cleanup())
  clubB = await publishedClub(request, 'm03b')
  cleanups.push(() => clubB.club.cleanup())
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  for (const cleanup of cleanups.reverse()) await cleanup()
})

test('TEST-M03 each club at its own address, the neutral landing page and 404 for an unknown label', async ({
  page,
}, testInfo) => {
  for (const club of [clubA, clubB]) {
    await page.goto(`${club.origin}/`)
    await expect(page).toHaveURL(`${club.origin}/p/${club.slug}`)
    await expect(page.getByTestId('public-club-name')).toHaveText(club.name)
  }

  // `/p/<slug>` from the instance's address or another club's address moves to the club's own address, path and query kept.
  await page.goto(`${app.appUrl}/p/${clubA.slug}`)
  await expect(page).toHaveURL(`${clubA.origin}/p/${clubA.slug}`)
  await page.goto(`${clubB.origin}/p/${clubA.slug}/events?section=none`)
  await expect(page).toHaveURL(`${clubA.origin}/p/${clubA.slug}/events?section=none`)

  // An unknown label is not found.
  const unknown = await page.goto(`${app.clubUrl(`qa-none-${uniqueSuffix()}`)}/`)
  expect(unknown?.status()).toBe(404)

  // The bare domain and the host of APP_URL show the neutral landing page, which names no club.
  for (const origin of [app.bareUrl, app.appUrl]) {
    const response = await page.goto(`${origin}/`)
    expect(response?.status()).toBe(200)
    await expect(page.getByTestId('club-landing')).toBeVisible()
    await expect(page.getByTestId('club-landing')).not.toContainText(clubA.name)
  }

  // Both locales at 375 px, light and dark, without a blocking accessibility violation.
  await page.setViewportSize({ width: 375, height: 812 })
  for (const locale of ['en', 'pl'] as const) {
    const switched = await page.request.post(`${app.bareUrl}/api/auth/locale`, { data: { locale } })
    expect(switched.ok()).toBe(true)
    await page.goto(`${app.bareUrl}/`)
    const landing = page.getByTestId('club-landing')
    await expect(landing.getByRole('heading', { level: 2 })).toHaveText(uiTextIn(locale, 'club_core.landing.findClub'))
    await expect(page.getByTestId('club-landing-sign-in')).toHaveText(uiTextIn(locale, 'club_core.landing.signIn'))
    await expectNoPageOverflow(page, 375)
    const violations = await scanInColorSchemes(page, testInfo, `landing ${locale}`, async () => {
      await expect(landing).toBeVisible()
    })
    expect(violations).toEqual({})
  }
})

test('TEST-M02 sign-in targets the host’s club, another club’s session goes home, a forged header is ignored', async ({
  page,
  request,
}) => {
  // The sign-in page on a club's address carries that club's tenant.
  await page.goto(`${clubA.origin}/login`)
  await expect(page).toHaveURL(new RegExp(`^${clubA.origin}/login\\?tenant=${clubA.club.tenant.tenantId}$`))

  // Club B's form refuses club A's account: the form signs in to B's tenant only.
  await page.goto(`${clubB.origin}/login`)
  await expect(page).toHaveURL(new RegExp(`tenant=${clubB.club.tenant.tenantId}`))
  const refused = await signInOnForm(page, clubA.club.tenant.email, clubA.club.tenant.password)
  expect(refused.status()).not.toBe(200)
  await expect(page).toHaveURL(new RegExp(`^${clubB.origin}/login`))

  // On A's address the same account signs in and lands in the app there.
  await page.goto(`${clubA.origin}/login`)
  const accepted = await signInOnForm(page, clubA.club.tenant.email, clubA.club.tenant.password)
  expect(accepted.status()).toBe(200)
  await page.waitForURL((url) => url.origin === clubA.origin && !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  })

  // A's session carried over to B's address (the cookie is host-only, so it is copied by hand) goes back to A's address.
  const session = (await page.context().cookies(clubA.origin)).find((cookie) => cookie.name === 'auth_token')
  expect(session).toBeDefined()
  await page
    .context()
    .addCookies([{ name: 'auth_token', value: String(session?.value), domain: `${clubB.slug}.localhost`, path: '/' }])
  await page.goto(`${clubB.origin}/backend`)
  await expect(page).toHaveURL(new RegExp(`^${clubA.origin}/backend`))
  await page.goto(`${clubB.origin}/`)
  await expect(page).toHaveURL(new RegExp(`^${clubA.origin}/backend`))

  // The platform reset page stays on APP_URL in this phase.
  await page.goto(`${clubA.origin}/reset`)
  await expect(page).toHaveURL(`${app.appUrl}/reset`)

  // A client-sent club header is never read: the instance's address still shows the neutral landing page.
  const forged = await request.get(`${app.appUrl}/`, { headers: { 'x-vereino-club-slug': clubA.slug } })
  expect(forged.status()).toBe(200)
  const html = await forged.text()
  expect(html).toContain('data-testid="club-landing"')
  expect(html).not.toContain(clubA.name)
})
