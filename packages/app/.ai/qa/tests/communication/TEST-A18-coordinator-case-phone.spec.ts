import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { getThread, markCase, postReply, postThread, threadVersion } from '../_fixtures/communication'
import { uiText } from '../_fixtures/ui-text'

// TEST-A18 (groups and activities parity spec REQ-A12, AC-A13, Q-A26; E10-S09 #274; README M-07) on the TEST-008
// family: the coordinator of the academy works two Żaki threads that carry a guardian's reply, on a phone (375 px).
// "Mark as case" (confirmed) shows the case banner and the badge and takes every "Delete" away. On a thread that is not
// a case "Delete" turns the guardian's message into a tombstone ("deleted"). When the thread becomes a case between the
// page's read and the deletion, the refusal 409 `case_immutable` is shown in the page as readable text and the page
// then shows the case. The coach of the group, without `communication.cases.manage`, gets neither action.
test.describe.configure({ timeout: 480_000 })

async function groupThread(request: APIRequestContext, token: string, group: string, subject: string): Promise<string> {
  const posted = await postThread(request, token, {
    audience: { kind: 'group', ids: [group] },
    subject,
    body: `${subject}: szczegóły w wiadomości.`,
  })
  expect(posted.status, `${subject}: ${JSON.stringify(posted.body)}`).toBe(201)
  return String(posted.body?.threadId)
}

test('TEST-A18 coordinator on the phone: mark a thread as a case with banner and badge, delete a message into a tombstone, and 409 case_immutable shown as text', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-a18')
  try {
    const family = await familyFor(request, club)
    const coordinator = family.academyCoordinator
    const caseThread = await groupThread(request, family.coach.token, family.zaki, 'Wyjazd na turniej')
    const plainThread = await groupThread(request, family.coach.token, family.zaki, 'Nowe stroje')
    for (const [threadId, body] of [
      [caseThread, 'Hania nie pojedzie, prosimy o zwrot zaliczki.'],
      [plainThread, 'Rozmiar stroju Hani: 152.'],
    ] as const) {
      const replied = await postReply(request, family.guardian.token, threadId, body)
      expect(replied.status, JSON.stringify(replied.body)).toBe(201)
    }
    // The read model the page relies on: the coordinator may mark and delete, the coach may do neither on others' messages.
    const asCoordinator = (await getThread(request, coordinator.token, plainThread)).body
    expect(asCoordinator?.canMarkCase).toBe(true)
    expect(asCoordinator?.messages.every((message) => message.canDelete)).toBe(true)
    expect((await getThread(request, family.coach.token, plainThread)).body?.canMarkCase).toBe(false)

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // --- The coach of the group: no case actions ------------------------------------------------------------------
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto(`/club/messages/${plainThread}`)
    await expect(page.getByTestId('club-thread-subject')).toHaveText('Nowe stroje')
    await expect(page.getByTestId('thread-message')).toHaveCount(2)
    await expect(page.getByTestId('club-thread-mark-case')).toHaveCount(0)
    await expect(page.getByTestId('club-message-delete')).toHaveCount(0)

    // --- The coordinator --------------------------------------------------------------------------------------------
    const password = await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    const token = await getAuthToken(request, coordinator.email, password)

    // Mark as case: confirmed, then the banner and the badge; no message can be deleted any more.
    await page.goto(`/club/messages/${caseThread}`)
    await expect(page.getByTestId('club-thread-subject')).toHaveText('Wyjazd na turniej')
    await expect(page.getByTestId('club-message-delete')).toHaveCount(2)
    await page.getByTestId('club-thread-mark-case').click()
    const confirmation = page.getByRole('alertdialog')
    await expect(confirmation).toContainText(uiText('communication.cases.confirm.text'))
    await confirmation
      .getByRole('button', { name: uiText('communication.cases.actions.mark', { exact: true }) })
      .click()
    await expect(page.getByTestId('thread-case-banner')).toContainText(uiText('communication.cases.banner.title'))
    await expect(page.getByTestId('club-thread-case')).toBeVisible()
    await expect(page.getByTestId('club-thread-mark-case')).toHaveCount(0)
    await expect(page.getByTestId('club-message-delete')).toHaveCount(0)
    expect((await getThread(request, token, caseThread)).body?.isCase).toBe(true)
    const violations = await scanInColorSchemes(page, testInfo, '/club/messages/[threadId] (case)', async () => {
      await expect(page.getByTestId('thread-case-banner')).toBeVisible()
    })
    await expectNoPageOverflow(page)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // Not a case: "Delete" turns the guardian's message into a tombstone.
    await page.goto(`/club/messages/${plainThread}`)
    const reply = page.getByTestId('thread-message').filter({ hasText: 'Rozmiar stroju Hani: 152.' })
    const replyId = String(await reply.getAttribute('data-message-id'))
    await reply.getByTestId('club-message-delete').click()
    const deleteConfirmation = page.getByRole('alertdialog')
    await expect(deleteConfirmation).toContainText(uiText('communication.message.delete.confirm.text'))
    await deleteConfirmation
      .getByRole('button', { name: uiText('communication.message.actions.delete', { exact: true }) })
      .click()
    const tombstone = page.locator(`[data-testid="thread-message"][data-message-id="${replyId}"]`)
    await expect(tombstone).toContainText(uiText('communication.message.deleted'))
    await expect(tombstone.getByTestId('club-message-delete')).toHaveCount(0)
    const afterDelete = (await getThread(request, token, plainThread)).body
    expect(afterDelete?.messages.find((message) => message.id === replyId)?.deleted).toBe(true)

    // The thread becomes a case between the page's read and the deletion (another device marks it; the deletion then
    // carries the thread's newest version, as when the marking commits first under the row lock): 409 `case_immutable`
    // is shown in the page as text, and the page then shows the case.
    await expect(page.getByTestId('club-message-delete')).toHaveCount(1)
    const marked = await markCase(request, token, plainThread, await threadVersion(request, token, plainThread))
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    await page.route(`**/api/communication/threads/${plainThread}/messages/*`, async (route) => {
      const headers = { ...route.request().headers(), [OPTIMISTIC_LOCK_HEADER]: String(marked.body?.updatedAt) }
      await route.continue({ headers })
    })
    const refused = page.waitForResponse(
      (response) =>
        response.url().includes(`/threads/${plainThread}/messages/`) && response.request().method() === 'DELETE',
    )
    await page.getByTestId('club-message-delete').click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: uiText('communication.message.actions.delete', { exact: true }) })
      .click()
    const response = await refused
    expect(response.status()).toBe(409)
    expect(((await response.json()) as { code?: string }).code).toBe('case_immutable')
    await expect(page.getByTestId('club-thread-refusal')).toHaveText(
      uiText('communication.errors.case_immutable', { exact: true }),
    )
    await expect(page.getByTestId('thread-case-banner')).toBeVisible()
    await expect(page.getByTestId('club-message-delete')).toHaveCount(0)
    await page.unroute(`**/api/communication/threads/${plainThread}/messages/*`)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
