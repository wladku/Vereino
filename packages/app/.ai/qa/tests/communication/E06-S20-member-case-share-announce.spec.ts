import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import {
  awaitEmails,
  getThread,
  listThreads,
  markCase,
  postThread,
  settledDeliveries,
  shareText,
  threadVersion,
  type ThreadDetail,
} from '../_fixtures/communication'

// E06-S20 (#102; README M-06, M-07, F-05; club spec REQ-009, REQ-010; foundation III `AudiencePicker`,
// `DeliveryStatusList`) on the TEST-008 family: Anna guards Hania (Żaki and the pool group) and Kuba (Żaki); Marek
// coaches Żaki, Irena the pool group. API: the guardian's ward filter (`wardId`) narrows the inbox to a ward's group and
// section threads, never the club-wide one, and another family's child lists nothing; posting answers
// `recipientCount`; a coach posting to a group they do not coach gets 403; the e-mail counts come with the author's own
// message only. Browser at 375 px: the parent sees the "Case" mark in the inbox and the case banner in the thread, the
// ward filter, no "New announcement"; the coach copies the text for the group chat (clipboard and confirmation), posts
// an announcement to their group from the phone (toast with the count, the new thread opens) and sees the e-mail
// delivery line under it. axe in light and dark mode on the inbox and the thread.
test.describe.configure({ timeout: 600_000 })

test('E06-S20 member inbox on the phone: case mark and banner, ward filter, copy text for group chat, new announcement with recipient count, e-mail delivery line, axe at 375 px', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s20')
  try {
    const family = await familyFor(request, club)
    const anna = family.guardian
    const coach = family.coach

    const post = async (token: string, kind: string, ids: string[] | undefined, subject: string) => {
      const posted = await postThread(request, token, {
        audience: ids ? { kind, ids } : { kind },
        subject,
        body: `${subject}: szczegóły w wiadomości.`,
      })
      expect(posted.status, `${subject}: ${JSON.stringify(posted.body)}`).toBe(201)
      return posted.body
    }
    const zakiPost = await post(coach.token, 'group', [family.zaki], 'Turniej w sobotę')
    const zakiThreadId = String(zakiPost?.threadId)
    const poolThreadId = String((await post(family.instructor.token, 'group', [family.poolGroup], 'Czepki'))?.threadId)
    const clubThreadId = String((await post(club.adminToken, 'club', undefined, 'Walne zebranie'))?.threadId)

    // POST answers how many people the message reaches; the stored message says the same.
    const zakiAsCoach = await getThread(request, coach.token, zakiThreadId)
    expect(zakiPost?.recipientCount).toBeGreaterThan(0)
    expect(zakiPost?.recipientCount).toBe(zakiAsCoach.body?.messages[0]?.recipientCount)

    // Negative: a coach posting to a group they do not coach.
    const denied = await postThread(request, coach.token, {
      audience: { kind: 'group', ids: [family.poolGroup] },
      subject: 'Nie moja grupa',
      body: 'Próba.',
    })
    expect(denied.status, JSON.stringify(denied.body)).toBe(403)

    // The ward filter: Hania — her two groups' threads; Kuba — Żaki only; never the club-wide thread; another family's
    // child (or any person who is not Anna's ward) lists nothing.
    const ids = (items: { id: string }[]) => items.map((item) => item.id).sort()
    expect(ids(await listThreads(request, anna.token, '&as=member'))).toEqual(
      [zakiThreadId, poolThreadId, clubThreadId].sort(),
    )
    expect(ids(await listThreads(request, anna.token, `&as=member&wardId=${family.younger.personId}`))).toEqual(
      [zakiThreadId, poolThreadId].sort(),
    )
    expect(ids(await listThreads(request, anna.token, `&as=member&wardId=${family.elder.personId}`))).toEqual([
      zakiThreadId,
    ])
    expect(await listThreads(request, anna.token, `&as=member&wardId=${family.other.child.personId}`)).toEqual([])
    expect(await listThreads(request, coach.token, `&as=member&wardId=${family.younger.personId}`)).toEqual([])

    // E-mail counts: with the author's own message, never with another author's.
    await settledDeliveries(request, coach.token, zakiThreadId)
    const ownEmail = (await getThread(request, coach.token, zakiThreadId)).body?.messages[0]?.emailCounts
    expect(ownEmail?.sent).toBeGreaterThan(0)
    expect((await getThread(request, anna.token, zakiThreadId)).body?.messages[0]?.emailCounts).toBeNull()

    // The pool group thread becomes a case.
    const marked = await markCase(
      request,
      family.poolCoordinator.token,
      poolThreadId,
      await threadVersion(request, family.poolCoordinator.token, poolThreadId),
    )
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)

    page.setDefaultTimeout(30_000)
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

    // --- The parent -------------------------------------------------------------------------------------------------
    const annaPassword = await signInBrowser(page, request, club, anna.userId, anna.email)
    const annaToken = await getAuthToken(request, anna.email, annaPassword)
    const featureCheck = page.waitForResponse((response) => response.url().includes('/api/auth/feature-check'))
    await page.goto('/club/messages')
    await featureCheck
    await expect(page.getByTestId('club-thread')).toHaveCount(3)
    // No "New announcement" for a parent.
    await expect(page.getByTestId('club-messages-new')).toHaveCount(0)
    // The case mark on the case thread only; "scope · last author · time".
    const caseItem = page.locator('[data-testid="club-thread"][data-case="true"]')
    await expect(caseItem).toHaveCount(1)
    await expect(caseItem).toContainText('Czepki')
    await expect(caseItem.getByTestId('club-thread-case')).toBeVisible()
    await expect(
      page.getByTestId('club-thread').filter({ hasText: 'Turniej w sobotę' }).getByTestId('club-thread-meta'),
    ).toContainText(/Żaki · Marek Trener · /)
    // The ward filter.
    const wards = page.getByTestId('club-messages-wards')
    await wards.locator(`[data-ward="${family.elder.personId}"]`).click()
    await expect(wards.locator(`[data-ward="${family.elder.personId}"]`)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('club-thread')).toHaveCount(1)
    await expect(page.getByTestId('club-thread')).toContainText('Turniej w sobotę')
    await wards.locator(`[data-ward="${family.younger.personId}"]`).click()
    await expect(page.getByTestId('club-thread')).toHaveCount(2)
    await wards.locator('[data-ward="all"]').click()
    await expect(page.getByTestId('club-thread')).toHaveCount(3)
    await scan('/club/messages (parent)', async () => {
      await expect(page.getByTestId('club-thread').first()).toBeVisible()
    })

    // The case thread: the mark and the banner; no share text for a parent; no e-mail line under others' messages.
    await caseItem.click()
    await expect(page.getByTestId('club-thread-subject')).toHaveText('Czepki')
    await expect(page.getByTestId('club-thread-case')).toBeVisible()
    await expect(page.getByTestId('thread-case-banner')).toContainText(
      /Case — messages cannot be deleted or edited|Sprawa — wiadomości nie można usuwać ani edytować/,
    )
    await expect(page.getByTestId('thread-share')).toHaveCount(0)
    await expect(page.getByTestId('club-message-email')).toHaveCount(0)
    await scan('/club/messages/[threadId] (case)', async () => {
      await expect(page.getByTestId('thread-case-banner')).toBeVisible()
    })

    // --- The coach --------------------------------------------------------------------------------------------------
    const coachPassword = await signInBrowser(page, request, club, coach.userId, coach.email)
    const coachToken = await getAuthToken(request, coach.email, coachPassword)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

    // "Copy text for group chat" on their group's thread: the clipboard holds the text with the link, and the page says so.
    await page.goto(`/club/messages/${zakiThreadId}`)
    await expect(page.getByTestId('club-thread-subject')).toHaveText('Turniej w sobotę')
    await page.getByTestId('thread-share').click()
    await expect(page.getByTestId('thread-share-status')).toHaveText(/copied|skopiowany/i)
    const expected = await shareText(request, coachToken, `threadId=${zakiThreadId}`)
    expect(expected.status, JSON.stringify(expected.body)).toBe(200)
    await expect(page.getByTestId('thread-share-text')).toHaveText(String(expected.body?.text))
    expect(String(expected.body?.text)).toContain(String(expected.body?.url))
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected.body?.text)
    // "E-mail: {n} delivered · {m} not delivered" under the coach's own message.
    const emailLine = page.getByTestId('club-message-email')
    await expect(emailLine).toHaveCount(1)
    await expect(emailLine).toHaveAttribute('data-delivered', String(ownEmail?.sent))
    await expect(emailLine).toContainText(/E-mail: /)

    // "New announcement" to their own group from the phone.
    await page.goto('/club/messages')
    await page.getByTestId('club-messages-new').click()
    const dialog = page.getByTestId('club-messages-compose')
    await expect(dialog).toBeVisible()
    const kind = dialog.getByTestId('audience-picker-kind')
    await expect(kind.locator('option[value="group"]')).toHaveCount(1)
    await expect(kind.locator('option[value="occurrence"]')).toHaveCount(1)
    await expect(kind.locator('option[value="club"]')).toHaveCount(0)
    await expect(kind.locator('option[value="activity"]')).toHaveCount(0)
    await kind.selectOption('group')
    const targets = dialog.getByTestId('audience-picker-targets')
    await expect(targets.getByRole('radio')).toHaveCount(1)
    await expect(targets).toContainText('Żaki')
    await targets.getByRole('radio').first().check()
    await expect(dialog.getByTestId('audience-picker-count')).toBeVisible()
    // The installed CrudForm does not tie its labels to the inputs (lesson integration-fixture-pitfalls-tokens-crudform-undo).
    await dialog.locator('[data-crud-field-id="subject"] input').fill('Zbiórka o 8:30')
    await dialog.locator('[data-crud-field-id="body"] textarea').fill('Zbiórka przed autokarem o 8:30.')
    const created = page.waitForResponse(
      (response) => response.url().endsWith('/api/communication/threads') && response.request().method() === 'POST',
    )
    await dialog.getByRole('button', { name: /^(Send|Wyślij)$/ }).click()
    const response = await created
    expect(response.status()).toBe(201)
    const body = (await response.json()) as { threadId: string; recipientCount: number }
    const count = String(body.recipientCount)
    await expect(page.getByText(new RegExp(`(Sent to ${count} people|odbiorców: ${count})`))).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/club/messages/${body.threadId}$`))
    await expect(page.getByTestId('club-thread-subject')).toHaveText('Zbiórka o 8:30')
    // The recipients got it in the app (Anna's inbox has the thread) and by e-mail.
    const annaThread = await getThread(request, annaToken, body.threadId)
    expect(annaThread.status).toBe(200)
    expect((annaThread.body as ThreadDetail).messages[0]?.body).toBe('Zbiórka przed autokarem o 8:30.')
    expect((await listThreads(request, annaToken, '&as=member')).map((item) => item.id)).toContain(body.threadId)
    await awaitEmails(anna.email, 'Zbiórka o 8:30')
    await scan('/club/messages/[threadId] (coach)', async () => {
      await expect(page.getByTestId('thread-share')).toBeVisible()
    })

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
