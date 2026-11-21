import { expect, test, type Page } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { createClub, uniqueSuffix } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { publish } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// TEST-N16 (navigation spec REQ-N15, AC-N15; issue #264, E09-S10): while a member or public page waits for its first
// read (held by a route), it shows a skeleton in the shape of its content — tiles on Today and on Facilities, rows on
// Messages and Payments — inside an `aria-busy` region whose pieces are `aria-hidden`, and the loading text is only the
// visually hidden status line. The public club page is read on the server since #487, so it arrives with its content
// and shows no loading state at all, even while the browser's own read would be slow. With empty fixtures the inbox names its next step
// ("Write to the coach"), the public club page without public sections offers to ask the club and the Events page
// without upcoming events links the sections. Every page at 375 px, in pl and en, light and dark, without blocking axe
// violations.
test.describe.configure({ timeout: 600_000 })

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

/** Holds every request whose path matches until the returned `release` is called (a slow response, TEST-N16). */
async function holdRequests(page: Page, path: (pathname: string) => boolean): Promise<() => Promise<void>> {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const matcher = (url: URL) => path(url.pathname)
  await page.route(matcher, async (route) => {
    await gate
    await route.continue()
  })
  return async () => {
    release()
    await page.unroute(matcher)
  }
}

/** The page is in its loading state: a skeleton of the shape, `aria-busy`, hidden pieces and no visible loading text. */
async function expectSkeleton(page: Page, shape: 'tiles' | 'rows' | 'fields') {
  const skeleton = page.locator(`[data-skeleton="${shape}"]`).first()
  await expect(skeleton).toBeVisible()
  await expect(skeleton).toHaveAttribute('aria-busy', 'true')
  await expect(skeleton.locator(':scope > [aria-hidden="true"]')).toHaveCount(1)
  await expect(skeleton.locator('[role="status"].sr-only')).toHaveCount(1)
  // The platform's text loading state (`LoadingMessage`, a spinner with its label) is gone from these pages.
  await expect(page.locator('main .animate-spin')).toHaveCount(0)
}

test('TEST-N16 member and public pages load with a skeleton, and empty lists name the next action', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-n16')
  try {
    const family = await familyFor(request, club)
    const anna = family.guardian
    const slug = `tn16-${uniqueSuffix()}`
    // A published club page with the club phone and no public section, and the events block on with no events.
    await publish(request, club.adminToken, slug, ['description_schedule', 'contact', 'events'], {
      shortName: 'Klub Sokół',
      contactPhone: '+48 600 100 200',
    })

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, anna.userId, anna.email)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    const scan = async (label: string, ready: () => Promise<void>) => {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.reload()
        await ready()
        const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
        if (found.length > 0) violations[`${label} (${colorScheme})`] = found
      }
      await expectNoPageOverflow(page)
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    }

    const memberPages: { href: string; shape: 'tiles' | 'rows'; ready: string }[] = [
      { href: '/club', shape: 'tiles', ready: 'club-tile-profile' },
      { href: '/club/messages', shape: 'rows', ready: 'club-messages-empty' },
      { href: '/club/payments', shape: 'rows', ready: 'club-payments-empty' },
      { href: '/club/places', shape: 'tiles', ready: 'club-places-denied' },
    ]
    const isProfile = (pathname: string) => pathname === '/api/people/me'
    const isPublicClub = (pathname: string) => pathname === `/api/club_core/public/${slug}`

    for (const locale of ['pl', 'en'] as const) {
      await setLocale(page, locale)
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        // Slow responses: each member frame waits for the profile, the public page for its club read.
        for (const target of memberPages) {
          const release = await holdRequests(page, isProfile)
          await page.goto(target.href, { waitUntil: 'commit' })
          await expectSkeleton(page, target.shape)
          await release()
          await expect(page.getByTestId(target.ready)).toBeVisible()
          await expect(page.locator('[aria-busy="true"][data-skeleton]')).toHaveCount(0)
        }
        // The public club page is read on the server (#487): its HTML already holds the club, so it has no loading
        // state at all — no skeleton, no loading text — and the browser never reads the club itself.
        const browserReads: string[] = []
        const countRead = (request: { url: () => string }) => {
          if (isPublicClub(new URL(request.url()).pathname)) browserReads.push(request.url())
        }
        page.on('request', countRead)
        const release = await holdRequests(page, isPublicClub)
        await page.goto(`/p/${slug}`, { waitUntil: 'commit' })
        await expect(page.getByTestId('public-club-name')).toBeVisible()
        await expect(page.locator('[data-skeleton]')).toHaveCount(0)
        await expect(page.locator('main .animate-spin')).toHaveCount(0)
        await release()
        page.off('request', countRead)
        expect(browserReads).toEqual([])
      }
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

      // Empty fixtures: the inbox has no conversation and offers to write to the coach.
      await page.goto('/club/messages')
      const inbox = page.getByTestId('club-messages-empty')
      await expect(inbox).toContainText(uiText('communication.club.empty'))
      await expect(inbox.getByTestId('club-messages-empty-write')).toHaveAttribute('href', '/club/messages/new')
      await scan(`/club/messages empty ${locale}`, async () => {
        await expect(page.getByTestId('club-messages-empty-write')).toBeVisible()
      })

      // The public club page without a public section offers to ask the club (its contact on the same page).
      await page.goto(`/p/${slug}`)
      const sections = page.getByTestId('public-sections-empty')
      await expect(sections).toContainText(uiText('club_core.public.sections.empty'))
      await expect(sections.getByRole('link', { name: uiText('club_core.public.askClub') })).toHaveAttribute(
        'href',
        '#contact',
      )
      await expect(page.locator('#contact')).toContainText('+48 600 100 200')
      await scan(`/p/[slug] empty ${locale}`, async () => {
        await expect(page.getByTestId('public-sections-empty')).toBeVisible()
      })

      // The Events page without upcoming events links the sections of the club page.
      await page.goto(`/p/${slug}/events`)
      const events = page.getByTestId('public-events-no-upcoming')
      await expect(events).toContainText(uiText('club_core.public.events.noUpcoming'))
      await expect(events.getByRole('link', { name: uiText('club_core.public.events.seeSections') })).toHaveAttribute(
        'href',
        `/p/${slug}#sections`,
      )
      await scan(`/p/[slug]/events empty ${locale}`, async () => {
        await expect(page.getByTestId('public-events-no-upcoming')).toBeVisible()
      })
    }

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
