import { expect, test } from '@playwright/test'
import { familyFor } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { actionLogs, createClub, getPerson } from '../_fixtures/club'
import { signInBrowser, signOutBrowser } from '../_fixtures/club-structure'
import { confirmPassword, invitedGuardianOf, pathOf, startLink } from '../_fixtures/invitation-links'
import { uiText } from '../_fixtures/ui-text'

// Personal invitation link spec phase 1 (#868; REQ-IL01, REQ-IL03, REQ-IL05; IL-AC-01, IL-AC-04, IL-AC-06):
// TEST-IL01 — the administrator opens an invited guardian's Account tab, takes the invitation link: the sheet shows the
// QR code and the link. The guardian opens the link without a session: the page shows only the club and **Set your
// password**, never the guardian's or the child's name; the button opens the platform's password setup, the guardian
// sets a password and the account becomes active; afterwards the link is no longer valid. The link is in the audit log
// with the administrator as `club_admin`, never the link itself.
test.describe.configure({ timeout: 420_000 })

test('TEST-IL01 the administrator shares an invitation link and the guardian activates the account from it', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-il01')
  try {
    const family = await familyFor(request, club)
    const guardian = await invitedGuardianOf(request, club, family.younger.personId, {
      firstName: 'Bogna',
      lastName: 'Zaproszona',
    })

    // The administrator's Account tab: "Invitation link" next to the re-send; the sheet shows the QR code and the link.
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.goto(`/backend/people/persons/${guardian.personId}?tab=account`)
    await expect(page.getByText(uiText('people.account.state.invited', { exact: true }))).toBeVisible()
    await page.getByTestId('people-account-invitation-link').click()
    const dialog = page.getByTestId('invitation-share-dialog')
    await expect(dialog.getByTestId('invitation-share-qr')).toBeVisible()
    await expect(
      dialog.getByRole('img', { name: uiText('people.invitationLink.qrLabel', { exact: true }) }),
    ).toBeVisible()
    const field = dialog.getByTestId('invitation-share-url')
    await expect(field).toHaveValue(/\/club\/i\/[A-Za-z0-9_-]{20,}$/)
    const url = await field.inputValue()
    await expect(dialog.getByTestId('invitation-share-copy')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    // The audit log names the administrator's role and the link's expiry, never the link.
    await expect
      .poll(
        async () =>
          (await actionLogs(request, club.adminToken, guardian.personId)).filter(
            (entry) => entry.commandId === 'people.persons.share_invitation',
          ).length,
      )
      .toBe(1)
    const entry = (await actionLogs(request, club.adminToken, guardian.personId)).find(
      (item) => item.commandId === 'people.persons.share_invitation',
    )
    expect(entry?.context).toMatchObject({ actingRole: 'club_admin' })
    expect(JSON.stringify(entry)).not.toContain(url.split('/club/i/')[1])

    // The guardian opens the link without a session: the club and the next step only.
    await signOutBrowser(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(pathOf(url))
    const main = page.getByTestId('invitation-page')
    await expect(main).toHaveAttribute('data-state', 'valid')
    const body = await page.locator('body').innerText()
    for (const name of [guardian.firstName, guardian.lastName, family.younger.firstName, family.younger.lastName]) {
      expect(body).not.toContain(name)
    }
    await expect(page.getByTestId('invitation-page-start')).toBeVisible()
    await prepareForAccessibilityScan(page)
    const violations = await scanInColorSchemes(page, testInfo, '/club/i valid', async () => {
      await expect(page.getByTestId('invitation-page-start')).toBeVisible()
    })
    expect(violations).toEqual({})
    await expectNoPageOverflow(page)

    // **Set your password** opens the platform's password setup; a GET of the page spent nothing.
    await page.getByTestId('invitation-page-start').click()
    await page.waitForURL(/\/reset\//)
    const resetUrl = page.url()
    await confirmPassword(request, resetUrl)
    const activated = await getPerson(request, club.adminToken, guardian.personId)
    expect((activated.body as { account?: { state?: string } }).account?.state).toBe('active')

    // The link is used: the page shows the invalid state with the club, and the start answers 410.
    await page.goto(pathOf(url))
    await expect(page.getByTestId('invitation-page')).toHaveAttribute('data-state', 'invalid')
    await expect(page.getByTestId('invitation-page-invalid')).toBeVisible()
    const again = await startLink(request, url)
    expect(again.status).toBe(410)
    expect(again.body?.code).toBe('invitation_link_invalid')
  } finally {
    await club.cleanup()
  }
})
