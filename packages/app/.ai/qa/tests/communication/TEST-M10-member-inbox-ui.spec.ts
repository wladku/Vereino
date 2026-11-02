import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { getThread, markRead, postThread, unreadCount } from '../_fixtures/communication'

// TEST-M10 (foundation III REQ-M10, AC-M10): a guardian with three threads, one unread. The "Messages" tile on `/club`
// shows 1; `/club/messages` lists the three with the unread marker on one; opening it clears the marker and the tile;
// the guardian replies with the keyboard. `/club`, the inbox and the thread pass axe in light and dark mode at 375 px
// with no horizontal overflow.
test.describe.configure({ timeout: 600_000 })

test('TEST-M10 member inbox: tile count 1 then 0, unread marker cleared on open, keyboard reply, axe at 375 px in both schemes', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-m10')
  try {
    const family = await familyFor(request, club)
    const anna = family.guardian
    const ids: string[] = []
    for (const subject of ['Zbiórka w sobotę', 'Nowe stroje', 'Zmiana godziny treningu']) {
      const posted = await postThread(request, family.coach.token, {
        audience: { kind: 'group', ids: [family.zaki] },
        subject,
        body: `${subject}: szczegóły w wiadomości.`,
      })
      expect(posted.status, JSON.stringify(posted.body)).toBe(201)
      ids.push(String(posted.body?.threadId))
    }
    // Anna has read the first two.
    for (const id of ids.slice(0, 2)) expect((await markRead(request, anna.token, id)).status).toBe(200)
    expect(await unreadCount(request, anna.token)).toBe(1)
    const unreadId = ids[2]

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

    // The tile shows one unread conversation.
    await page.goto('/club')
    await expect(page.getByTestId('club-tile-messages')).toBeVisible()
    await expect(page.getByTestId('club-tile-messages-unread')).toHaveAttribute('data-count', '1')
    await scan('/club', async () => {
      await expect(page.getByTestId('club-tile-messages-unread')).toBeVisible()
    })

    // The inbox: three threads, the unread marker on one.
    await page.getByTestId('club-tile-messages').click()
    await expect(page).toHaveURL(/\/club\/messages$/)
    await expect(page.getByTestId('club-thread')).toHaveCount(3)
    await expect(page.locator('[data-testid="club-thread"][data-unread="true"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="club-thread"][data-unread="true"]')).toContainText(
      'Zmiana godziny treningu',
    )
    await scan('/club/messages', async () => {
      await expect(page.getByTestId('club-thread').first()).toBeVisible()
    })

    // Open the unread thread: the read marker moves, the count drops to zero.
    await page.locator('[data-testid="club-thread"][data-unread="true"]').click()
    await expect(page.getByTestId('club-thread-subject')).toHaveText('Zmiana godziny treningu')
    await expect.poll(async () => unreadCount(request, annaToken), { timeout: 20_000 }).toBe(0)

    // Reply with the keyboard only.
    const reply = 'Będziemy, dziękuję.'
    await page.getByTestId('thread-reply-body').focus()
    await page.keyboard.type(reply)
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('thread-reply-send')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('thread-message-body').filter({ hasText: reply })).toBeVisible()
    const stored = await getThread(request, annaToken, unreadId)
    expect(stored.body?.messages.at(-1)).toMatchObject({ body: reply, audience: 'staff', own: true })
    await scan('/club/messages/[threadId]', async () => {
      await expect(page.getByTestId('club-thread-subject')).toBeVisible()
    })

    // Back in the inbox no marker is left, and the tile shows no count.
    await page.goto('/club/messages')
    await expect(page.getByTestId('club-thread')).toHaveCount(3)
    await expect(page.locator('[data-testid="club-thread"][data-unread="true"]')).toHaveCount(0)
    await page.goto('/club')
    await expect(page.getByTestId('club-tile-messages')).toBeVisible()
    await expect(page.getByTestId('club-tile-messages-unread')).toHaveCount(0)
    expect(await unreadCount(request, annaToken)).toBe(0)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
