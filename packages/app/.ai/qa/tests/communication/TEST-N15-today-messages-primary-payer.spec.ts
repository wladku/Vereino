import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { markRead, postThread, unreadCount } from '../_fixtures/communication'
import { uiText } from '../_fixtures/ui-text'

// TEST-N15 (navigation spec REQ-N14, AC-N14; issue #263, E09-S09): a guardian with two unread threads opens `/club`.
// The Messages tile shows 2 and the subject of the newest one as a link to that thread; once both are read the tile
// says "No new messages." with its "All" link to the inbox. On `/club/profile` both wards, whose primary payer she is,
// carry the "Primary payer" badge. Every page at 375 px, in pl and en, light and dark, without blocking axe violations.
test.describe.configure({ timeout: 600_000 })

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

test('TEST-N15 Today messages tile: unread count and newest subject, then no new messages; primary payer badge on the ward cards', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-n15')
  try {
    const family = await familyFor(request, club)
    const anna = family.guardian
    const ids: string[] = []
    for (const subject of ['Zbiórka w sobotę', 'Zmiana godziny treningu']) {
      const posted = await postThread(request, family.coach.token, {
        audience: { kind: 'group', ids: [family.zaki] },
        subject,
        body: `${subject}: szczegóły w wiadomości.`,
      })
      expect(posted.status, JSON.stringify(posted.body)).toBe(201)
      ids.push(String(posted.body?.threadId))
    }
    expect(await unreadCount(request, anna.token)).toBe(2)

    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, anna.userId, anna.email)
    const annaToken = await getAuthToken(request, anna.email, password)
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

    for (const locale of ['pl', 'en'] as const) {
      await setLocale(page, locale)
      // Today: two unread conversations and the newest one's subject, linking to it.
      await page.goto('/club')
      await expect(page.getByTestId('club-tile-messages-unread')).toHaveAttribute('data-count', '2')
      const newest = page.getByTestId('club-tile-messages-newest')
      await expect(newest).toHaveText('Zmiana godziny treningu')
      await expect(newest).toHaveAttribute('href', `/club/messages/${ids[1]}`)
      await expect(page.getByTestId('club-tile-messages-none')).toHaveCount(0)
      await scan(`/club ${locale}`, async () => {
        await expect(page.getByTestId('club-tile-messages-newest')).toBeVisible()
      })

      // The profile: both wards carry the "Primary payer" badge.
      await page.goto('/club/profile')
      await expect(page.getByTestId('club-profile-ward')).toHaveCount(2)
      await expect(page.getByTestId('club-profile-ward-primary-payer')).toHaveCount(2)
      await expect(page.getByTestId('club-profile-ward-primary-payer').first()).toHaveText(
        uiText('people.guardianships.primaryPayer', { exact: true }),
      )
      await scan(`/club/profile ${locale}`, async () => {
        await expect(page.getByTestId('club-profile-ward-primary-payer').first()).toBeVisible()
      })
    }

    // Both read: "No new messages." and the "All" link still leads to the inbox.
    for (const id of ids) expect((await markRead(request, annaToken, id)).status).toBe(200)
    expect(await unreadCount(request, annaToken)).toBe(0)
    await page.goto('/club')
    await expect(page.getByTestId('club-tile-messages-none')).toHaveText(
      uiText('communication.tile.noNew', { exact: true }),
    )
    await expect(page.getByTestId('club-tile-messages-unread')).toHaveCount(0)
    await expect(page.getByTestId('club-tile-messages-newest')).toHaveCount(0)
    await scan('/club no unread', async () => {
      await expect(page.getByTestId('club-tile-messages-none')).toBeVisible()
    })
    await page.getByTestId('club-tile-messages').click()
    await expect(page).toHaveURL(/\/club\/messages$/)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
