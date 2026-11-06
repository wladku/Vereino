import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { getThread, listThreads } from '../_fixtures/communication'
import { getMe, putMe, updateClubSettings } from '../_fixtures/members'

// TEST-M13 (foundation III REQ-M12, DD-M18, AC-M12; #138) on the TEST-M12 fixture (the TEST-008 family): Anna opens
// `/club/messages` → "Write to the coach", picks Hania and the coaches of Żaki with the keyboard, writes and sends; the
// new thread opens with her message and the inbox lists it. The page passes axe in light and dark mode at 375 px with
// no horizontal overflow, in Polish (the club's language) and in English (Anna's preference). A member of the club in
// no group (the academy coordinator) gets no action and sees the empty state.
test.describe.configure({ timeout: 600_000 })

test('TEST-M13 write to the coach: inbox action, pick the member and the coaches, keyboard send, the thread opens, both locales, axe at 375 px, empty state', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-m13')
  try {
    const settings = await updateClubSettings(request, club.adminToken, { defaultLocale: 'pl' })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const family = await familyFor(request, club)
    const anna = family.guardian

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

    // The inbox offers "Write to the coach" (Polish: the club's language).
    await page.goto('/club/messages')
    const write = page.getByTestId('club-messages-write')
    await expect(write).toHaveText('Napisz do trenera')
    await write.click()
    await expect(page).toHaveURL(/\/club\/messages\/new$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Napisz do trenera')
    await scan('/club/messages/new (pl)', async () => {
      await expect(page.getByTestId('club-direct-form')).toBeVisible()
    })

    // About: Hania (Anna has two wards with groups); To: the coaches of Żaki, chosen with the keyboard.
    await page.getByTestId('club-direct-about').click()
    await page.getByRole('option', { name: 'Hania Kowalska' }).click()
    const coaches = page.getByRole('radio', { name: /^Trenerzy grupy Żaki/ })
    const coordinator = page.getByRole('radio', { name: /^Koordynator sekcji Akademia piłkarska \(Żaki\)/ })
    await expect(coaches).toBeChecked()
    await expect(page.getByTestId('club-direct-recipient').first()).toContainText('Marek Trener')
    // Radix moves the focus in a timeout and selects only while an arrow key is down, so the key is held until then.
    await coaches.focus()
    await page.keyboard.down('ArrowDown')
    await expect(coordinator).toBeChecked()
    await page.keyboard.up('ArrowDown')
    await page.keyboard.down('ArrowUp')
    await expect(coaches).toBeChecked()
    await page.keyboard.up('ArrowUp')

    // Subject and message with the keyboard; Send with Enter.
    const subject = `Hania w środę ${String(Date.now())}`
    const body = 'Hania nie przyjdzie w środę, ma wizytę u lekarza.'
    await page.getByTestId('club-direct-subject').focus()
    await page.keyboard.type(subject)
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('club-direct-body')).toBeFocused()
    await page.keyboard.type(body)
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('club-direct-send')).toBeFocused()
    await page.keyboard.press('Enter')

    // The new thread opens with the message; the inbox lists it as a direct message.
    await expect(page).toHaveURL(/\/club\/messages\/[0-9a-f-]{36}$/)
    await expect(page.getByTestId('club-thread-subject')).toHaveText(subject)
    await expect(page.getByTestId('thread-message-body').filter({ hasText: body })).toBeVisible()
    const threadId = page.url().split('/').at(-1) ?? ''
    const stored = await getThread(request, annaToken, threadId)
    expect(stored.body).toMatchObject({ scopeType: 'direct', subject })
    const inbox = await listThreads(request, annaToken, '&as=member')
    expect(inbox.map((thread) => thread.id)).toContain(threadId)
    await page.goto('/club/messages')
    await expect(page.getByTestId('club-thread').filter({ hasText: subject })).toBeVisible()
    await expect(page.getByTestId('club-thread').filter({ hasText: subject })).toContainText('Wiadomość bezpośrednia')

    // English, Anna's preference: the page follows her language.
    const me = await getMe(request, annaToken)
    const english = await putMe(request, annaToken, { preferredLocale: 'en' }, me.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)
    await page.goto('/club/messages/new')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Write to the coach')
    await expect(page.getByRole('radio', { name: /^Coaches of / }).first()).toBeVisible()
    await scan('/club/messages/new (en)', async () => {
      await expect(page.getByTestId('club-direct-form')).toBeVisible()
    })

    // A member in no group (the academy coordinator): no action in the inbox, the empty state on the page.
    await page.context().clearCookies()
    await signInBrowser(page, request, club, family.academyCoordinator.userId, family.academyCoordinator.email)
    await page.goto('/club/messages')
    await expect(page.getByTestId('club-messages-empty')).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('club-messages-write')).toHaveCount(0)
    await page.goto('/club/messages/new')
    await expect(page.getByTestId('club-direct-empty')).toBeVisible()
    await scan('/club/messages/new (empty)', async () => {
      await expect(page.getByTestId('club-direct-empty')).toBeVisible()
    })

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
