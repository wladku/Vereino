import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test'
import { capturedCount, finishSignInOnPage } from '../_fixtures/auth'
import { createClub, uniqueSuffix, type Club } from '../_fixtures/club'
import { startClubDomainApp, type ClubDomainApp } from '../_fixtures/club-domain'
import { getSettings, png, publish, publicGet, putSettings, upload } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// E31-S01 (#873, D-045): Vereino is installable per club address. On `<slug>.localhost:<port>` the web app manifest
// carries the club's name, icons of 192 and 512 px drawn from its logo, the member start URL, standalone display and
// the club's colour; the instance's own address, the shared one-club app and a club that stops publishing its page get
// Vereino's name and mark. Chromium reports no installability error (the check Lighthouse's PWA audit ran), and the
// member menu offers "Install" while the browser offers installation. Without network the installed app shows the
// offline page. The service worker keeps only that page (no API response, no member page) and no notification
// permission is asked for (N02). Safari on an iPhone shows the "Add to Home Screen" hint once per device.
// E31-S02 (#906): the manifest also offers maskable icons whose logo stays inside the safe zone, every page carries the
// address's theme colour in `<meta name="theme-color">`, and the worker enables navigation preload.
test.describe.configure({ mode: 'serial', timeout: 600_000 })

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const ACCENT = '#1b8f3a'

let app: ClubDomainApp
let club: Club
let slug: string
let name: string
let origin: string

type Manifest = {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  theme_color: string
  lang: string
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>
}

async function manifestAt(base: string): Promise<{ status: number; type: string | null; body: Manifest }> {
  const response = await fetch(`${base}/manifest.webmanifest`)
  return {
    status: response.status,
    type: response.headers.get('content-type'),
    body: (await response.json()) as Manifest,
  }
}

/** The width and height of a PNG from its IHDR chunk. */
function pngSize(bytes: Buffer): [number, number] {
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

async function iconAt(base: string, src: string): Promise<Buffer> {
  const response = await fetch(`${base}${src}`)
  expect(response.status, src).toBe(200)
  expect(response.headers.get('content-type')).toBe('image/png')
  return Buffer.from(await response.arrayBuffer())
}

/**
 * The RGB colour of one pixel of an icon, read by the browser on a page of the icon's origin (PNG decoding stays in the
 * browser; the test adds no image library).
 */
async function iconPixel(page: Page, src: string, x: number, y: number): Promise<[number, number, number]> {
  return page.evaluate(
    async ({ src, x, y }) => {
      const image = new Image()
      image.src = src
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no 2d context')
      context.drawImage(image, 0, 0)
      const [r, g, b] = context.getImageData(x, y, 1, 1).data
      return [r, g, b] as [number, number, number]
    },
    { src, x, y },
  )
}

/** Whether a colour is the logo's red (200, 30, 30), allowing for scaling and compression. */
function isLogoRed([r, g, b]: [number, number, number]): boolean {
  return r > 150 && g < 90 && b < 90
}

async function signInAtClub(page: Page): Promise<void> {
  await page.goto(`${origin}/login`)
  const form = page.locator('form[data-auth-ready="1"]')
  await expect(form).toBeVisible()
  await form.locator('input[name="email"]').fill(club.tenant.email)
  await form.locator('input[name="password"]').fill(club.tenant.password)
  const since = capturedCount(club.tenant.email)
  const answer = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'))
  await form.locator('input[name="password"]').press('Enter')
  expect((await answer).ok()).toBe(true)
  // The club administrator is staff: the sign-in continues on `/login/second-factor` with the e-mailed code (#736).
  await finishSignInOnPage(page, club.tenant.email, since)
  await page.goto(`${origin}/club`)
  // The bar appears once the member's profile has loaded (the header shows the club's short name, unset here).
  await expect(page.getByTestId('club-bottom-bar')).toBeVisible()
}

async function memberPage(browser: Browser, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext(options)
  return context.newPage()
}

const cleanups: Array<() => Promise<void>> = []

test.beforeAll(async ({ request }) => {
  test.setTimeout(300_000)
  app = await startClubDomainApp()
  cleanups.push(() => app.stop())
  club = await createClub(request, 'e31s01')
  cleanups.push(() => club.cleanup())
  slug = `qa-e31-${uniqueSuffix()}`
  await publish(request, club.adminToken, slug, [], { accentColor: ACCENT })
  const settings = await getSettings(request, club.adminToken)
  const logo = await upload(
    request,
    club.adminToken,
    '/api/club_core/logo',
    png([200, 30, 30], 64),
    {},
    settings.updatedAt,
  )
  expect(logo.status, JSON.stringify(logo.body)).toBe(200)
  const page = await publicGet(request, `/api/club_core/public/${slug}`)
  expect(page.status).toBe(200)
  name = (page.body as { club?: { name?: string } }).club?.name ?? ''
  expect(name).not.toBe('')
  origin = app.clubUrl(slug)
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  for (const cleanup of cleanups.reverse()) await cleanup()
})

test('E31-S01 the manifest and icons of a club address, and Vereino elsewhere', async ({ request, page }) => {
  const manifest = await manifestAt(origin)
  expect(manifest.status).toBe(200)
  expect(manifest.type).toContain('application/manifest+json')
  expect(manifest.body).toMatchObject({
    name,
    short_name: name,
    start_url: '/club',
    scope: '/',
    display: 'standalone',
    theme_color: ACCENT,
  })
  expect(manifest.body.icons.map((icon) => [icon.sizes, icon.type, icon.purpose])).toEqual([
    ['192x192', 'image/png', 'any'],
    ['512x512', 'image/png', 'any'],
    ['192x192', 'image/png', 'maskable'],
    ['512x512', 'image/png', 'maskable'],
  ])
  const clubIcons: Buffer[] = []
  for (const icon of manifest.body.icons) {
    const bytes = await iconAt(origin, icon.src)
    const size = Number(icon.sizes.split('x')[0])
    expect(pngSize(bytes)).toEqual([size, size])
    clubIcons.push(bytes)
  }

  // The instance's own address and the shared one-club app name no club: Vereino's name, colour and mark.
  for (const base of [app.appUrl, app.bareUrl]) {
    const own = await manifestAt(base)
    expect(own.body).toMatchObject({
      name: 'Vereino',
      start_url: '/club',
      display: 'standalone',
      theme_color: '#171717',
    })
    const mark = await iconAt(base, own.body.icons[0].src)
    expect(pngSize(mark)).toEqual([192, 192])
    expect(mark.equals(clubIcons[0])).toBe(false)
  }
  const shared = await request.get('/manifest.webmanifest')
  expect(shared.status()).toBe(200)
  expect(((await shared.json()) as Manifest).name).toBe('Vereino')

  // The iPhone home screen icon; any other size is not found.
  expect(pngSize(await iconAt(origin, '/app-icon/180'))).toEqual([180, 180])
  expect((await fetch(`${origin}/app-icon/999`)).status).toBe(404)
  // The touch icon has no maskable variant (#906).
  expect((await fetch(`${origin}/app-icon/maskable-180`)).status).toBe(404)

  // Every page links the manifest and the touch icon, and carries the club's colour as the theme colour (#906).
  await page.goto(`${origin}/login`)
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/app-icon/180')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', ACCENT)

  // The maskable icon keeps the logo inside the safe zone (#906): 60 px from the edge of the 512 px icon the `any` icon
  // already shows the logo (it fills 80 %), the maskable one still its white padding; both show it in the centre.
  const [anyIcon, maskableIcon] = [manifest.body.icons[1].src, manifest.body.icons[3].src]
  expect(maskableIcon).toMatch(/^\/app-icon\/maskable-512\?v=/)
  expect(isLogoRed(await iconPixel(page, anyIcon, 60, 256))).toBe(true)
  expect(await iconPixel(page, maskableIcon, 60, 256)).toEqual([255, 255, 255])
  expect(await iconPixel(page, maskableIcon, 0, 0)).toEqual([255, 255, 255])
  expect(isLogoRed(await iconPixel(page, maskableIcon, 256, 256))).toBe(true)

  // Vereino's colour on the instance's own address.
  await page.goto(`${app.appUrl}/login`)
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#171717')
})

test('E31-S01 installable in Chromium, Install in the menu, the offline page and nothing personal cached', async ({
  browser,
}) => {
  const page = await memberPage(browser)
  // Counts every request for notification or push permission (N02: none).
  await page.context().addInitScript(() => {
    const counted = window as unknown as { __permissionAsks: number }
    counted.__permissionAsks = 0
    const ask = Notification.requestPermission.bind(Notification)
    Notification.requestPermission = (...args: Parameters<typeof Notification.requestPermission>) => {
      counted.__permissionAsks += 1
      return ask(...args)
    }
    const subscribe = Object.getOwnPropertyDescriptor(PushManager.prototype, 'subscribe')?.value as (
      this: PushManager,
      ...args: Parameters<PushManager['subscribe']>
    ) => ReturnType<PushManager['subscribe']>
    PushManager.prototype.subscribe = function (this: PushManager, ...args: Parameters<PushManager['subscribe']>) {
      counted.__permissionAsks += 1
      return subscribe.apply(this, args)
    }
    // A browser that offers installation fires the offer early, before the app hydrates (kept by the head script).
    document.addEventListener('DOMContentLoaded', () => {
      if (!location.pathname.startsWith('/club')) return
      const offer = new Event('beforeinstallprompt', { cancelable: true }) as Event & Record<string, unknown>
      offer.prompt = () => {
        ;(window as unknown as { __prompted?: number }).__prompted = 1
        return Promise.resolve()
      }
      offer.userChoice = Promise.resolve({ outcome: 'accepted' })
      window.dispatchEvent(offer)
    })
  })
  await signInAtClub(page)
  // The worker enables navigation preload where the browser supports it (Chromium does; #906).
  const preload = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return registration.navigationPreload.getState()
  })
  expect(preload.enabled).toBe(true)

  // The browser's own installability check (what Lighthouse's PWA installability audit reported).
  const cdp = await page.context().newCDPSession(page)
  const manifest = (await cdp.send('Page.getAppManifest')) as { url: string; errors: unknown[] }
  expect(manifest.url).toBe(`${origin}/manifest.webmanifest`)
  expect(manifest.errors).toEqual([])
  const installability = (await cdp.send('Page.getInstallabilityErrors')) as { installabilityErrors: unknown[] }
  expect(installability.installabilityErrors).toEqual([])

  // The offer fired before hydration: "Install" appears in More and opens the browser's dialog.
  await page.getByTestId('club-more').locator('summary').click()
  const install = page.getByTestId('club-install')
  await expect(install).toHaveText(uiText('club_core.webApp.install'))
  await install.click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted?: number }).__prompted)).toBe(1)
  await expect(install).toHaveCount(0)

  // No notification permission asked (N02), and no iPhone hint in Chromium.
  expect(await page.evaluate(() => (window as unknown as { __permissionAsks: number }).__permissionAsks)).toBe(0)
  await expect(page.getByTestId('web-app-ios-hint')).toHaveCount(0)

  // The worker keeps the offline page only: no API response and no member page.
  const cached = await page.evaluate(async () => {
    const out: Record<string, string[]> = {}
    for (const key of await caches.keys()) {
      const cache = await caches.open(key)
      out[key] = (await cache.keys()).map((entry) => new URL(entry.url).pathname)
    }
    return out
  })
  expect(cached).toEqual({ 'vereino-offline-v1': ['/offline'] })

  // Without network a page of the app shows the offline page instead of the browser's error.
  await page.context().setOffline(true)
  await page.goto(`${origin}/club/calendar`)
  const offline = page.getByTestId('web-app-offline')
  await expect(offline).toBeVisible()
  await expect(offline.locator('h1')).toHaveText(uiText('club_core.webApp.offline.title'))
  await page.context().setOffline(false)

  // Signed out on the same device: no cache serves the member page. Offline it is the offline page, without any member
  // content; online the server sends the visitor to the sign-in page.
  await page.goto('about:blank')
  await page.context().clearCookies()
  await page.context().setOffline(true)
  await page.goto(`${origin}/club`)
  await expect(page.getByTestId('web-app-offline')).toBeVisible()
  await expect(page.getByTestId('club-bottom-bar')).toHaveCount(0)
  await page.context().setOffline(false)
  await page.goto(`${origin}/club`)
  await expect(page).toHaveURL(/\/login/)

  // Browsers check the worker for a new version on every visit.
  const worker = await fetch(`${origin}/sw.js`)
  expect(worker.status).toBe(200)
  expect(worker.headers.get('cache-control')).toBe('no-cache')
  await page.context().close()
})

test('E31-S01 Safari on an iPhone shows the Add to Home Screen hint once per device', async ({ browser }) => {
  const page = await memberPage(browser, {
    userAgent: IPHONE_SAFARI,
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  })
  // Not on the sign-in page: the hint belongs to the member pages.
  await page.goto(`${origin}/login`)
  await expect(page.locator('form[data-auth-ready="1"]')).toBeVisible()
  await expect(page.getByTestId('web-app-ios-hint')).toHaveCount(0)
  await signInAtClub(page)
  const hint = page.getByTestId('web-app-ios-hint')
  await expect(hint).toBeVisible()
  await expect(hint).toContainText(uiText('club_core.webApp.iosHint.title'))
  await expect(hint).toContainText(uiText('club_core.webApp.iosHint.body'))
  const dismiss = page.getByRole('button', { name: uiText('club_core.webApp.iosHint.dismiss') })
  await dismiss.focus()
  await page.keyboard.press('Enter')
  await expect(hint).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('club-bottom-bar')).toBeVisible()
  await expect(page.getByTestId('web-app-ios-hint')).toHaveCount(0)
  await page.context().close()
})

test('E31-S01 a club that stops publishing its page is installed as Vereino', async ({ request, page }) => {
  const result = await putSettings(request, club.adminToken, { publication: { enabled: false } })
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  const manifest = await manifestAt(origin)
  expect(manifest.body).toMatchObject({ name: 'Vereino', theme_color: '#171717' })
  expect(manifest.body.icons[0].src).toBe('/app-icon/192?v=mark')
  expect(manifest.body.icons[2].src).toBe('/app-icon/maskable-192?v=mark')
  // Its icons no longer show its logo: the same mark as the instance's own address.
  const mark = await iconAt(app.appUrl, '/app-icon/192?v=mark')
  for (const src of ['/app-icon/192?v=mark', '/app-icon/192'])
    expect((await iconAt(origin, src)).equals(mark)).toBe(true)
  // Its pages carry Vereino's theme colour again (#906).
  await page.goto(`${origin}/login`)
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#171717')
})
