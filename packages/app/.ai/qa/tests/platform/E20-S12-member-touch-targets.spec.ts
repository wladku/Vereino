import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { familyFor } from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { getMe, putMe } from '../_fixtures/members'
import { MIN_TARGET_PX, undersizedTargets } from '../_fixtures/touch-targets'
import { uiText } from '../_fixtures/ui-text'

// E20-S12 (#491; UX concept R05.1, `docs/ux-concept/tokens.md`): every touch target on the main `/club` pages is at
// least 44 × 44 px at 375 px, in Polish and English — a guardian's Today, calendar, profile, ward, messages, new message
// and payments; a 16-year-old member's own profile (M-10 consents); a coach's Today, calendar, places and one place's day
// (M-11 day chips). A consent row toggles its switch when its text or the space beside the switch is tapped, and the
// toast's "Dismiss" has a 44 px hit area and closes the toast.
test.describe.configure({ timeout: 600_000 })

/**
 * The member pages follow the person's preferred language, not only the locale cookie: set both (the lock token comes
 * from a fresh read of the profile).
 */
async function setLocale(page: Page, token: string, locale: 'en' | 'pl') {
  const me = await getMe(page.request, token)
  const saved = await putMe(page.request, token, { preferredLocale: locale }, me.body?.person.updatedAt)
  expect(saved.status, JSON.stringify(saved.body)).toBe(200)
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('E20-S12 every touch target on the member pages is at least 44 × 44 px', async ({ page, request }) => {
  const club = await createClub(request, 'e20-s12')
  try {
    const family = await familyFor(request, club)
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const undersized: Record<string, string[]> = {}
    const measure = async (label: string) => {
      const found = await undersizedTargets(page)
      if (found.length > 0) undersized[label] = found
    }
    const visitAll = async (who: string, token: string, hrefs: string[]) => {
      for (const locale of ['pl', 'en'] as const) {
        await setLocale(page, token, locale)
        for (const href of hrefs) {
          await page.goto(href)
          await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
          await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
          await page.waitForLoadState('networkidle')
          await expect(page.locator('html')).toHaveAttribute('lang', locale)
          await measure(`${who} ${href} ${locale}`)
        }
      }
    }

    // Anna, a guardian of two wards.
    const guardianPassword = await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    const guardianToken = await getAuthToken(request, family.guardian.email, guardianPassword)
    const ward = `/club/wards/${family.younger.personId}`
    await visitAll('guardian', guardianToken, [
      '/club',
      '/club/calendar',
      '/club/profile',
      ward,
      '/club/messages',
      '/club/messages/new',
      '/club/payments',
    ])

    // A consent row is one target (the trips row of the form; the image row saves at once, #871): its description text and the space beside the 32 px switch toggle the switch.
    await page.goto(ward)
    const image = page.locator('#club-ward-consent-trips')
    await expect(image).toHaveAttribute('aria-checked', 'false')
    await page.locator('#club-ward-consent-trips-description').click()
    await expect(image).toHaveAttribute('aria-checked', 'true')
    const imageBox = await image.boundingBox()
    expect(imageBox?.width).toBeGreaterThanOrEqual(MIN_TARGET_PX - 0.5)
    expect(imageBox?.height).toBeGreaterThanOrEqual(MIN_TARGET_PX - 0.5)
    // Just left of the switch's visible track: inside the 44 px (round) button, outside the 32 px track.
    await image.click({ position: { x: 4, y: 22 } })
    await expect(image).toHaveAttribute('aria-checked', 'false')
    await page.locator('label[for="club-ward-consent-trips"]').click({ position: { x: 1, y: 1 } })
    await expect(image).toHaveAttribute('aria-checked', 'true')

    // The toast after saving: its "Dismiss" is 44 × 44 px and closes it.
    await page.getByRole('button', { name: uiText('people.club.ward.actions.save') }).click()
    const dismiss = page.locator('.z-toast [data-slot="alert-dismiss"]')
    await expect(dismiss).toBeVisible()
    const dismissBox = await dismiss.boundingBox()
    expect(dismissBox?.width).toBeGreaterThanOrEqual(MIN_TARGET_PX - 0.5)
    expect(dismissBox?.height).toBeGreaterThanOrEqual(MIN_TARGET_PX - 0.5)
    await measure('guardian toast')
    await dismiss.click()
    await expect(dismiss).toHaveCount(0)

    // Kuba, 16, with his own account: his own consents (M-10).
    const elderPassword = await switchBrowserUser(page, request, club, family.elder.userId, family.elder.email)
    await visitAll('member', await getAuthToken(request, family.elder.email, elderPassword), ['/club', '/club/profile'])

    // Marek, the Żaki coach: the calendar, the places and one place's day with its day chips (M-11).
    const coachPassword = await switchBrowserUser(page, request, club, family.coach.userId, family.coach.email)
    await visitAll('coach', await getAuthToken(request, family.coach.email, coachPassword), [
      '/club',
      '/club/calendar',
      '/club/places',
      `/club/places/${family.pitch}`,
    ])

    expect(undersized).toEqual({})
  } finally {
    await club.cleanup()
  }
})
