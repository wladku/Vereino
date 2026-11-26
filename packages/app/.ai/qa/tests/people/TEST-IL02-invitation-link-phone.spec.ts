import { expect, test } from '@playwright/test'
import { familyFor } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { actionLogs, createClub, signInAs } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { invitedGuardianOf, linkFor, pendingFamilies } from '../_fixtures/invitation-links'
import { uiText } from '../_fixtures/ui-text'

// Personal invitation link spec phase 2 (#868; REQ-IL02, J-IL01; IL-AC-02): TEST-IL02 — the coach of Żaki sees the
// invited guardian of a Żaki child on `/club/invitations` (from the group page's "Invite families"), opens the family
// and gets the QR code at 375 px; the coordinator of the academy section sees the same family and takes a link too.
// The list holds names and the children's first names and groups only, no contact data.
test.describe.configure({ timeout: 420_000 })

test('TEST-IL02 a coach and a coordinator share a family invitation link on the phone', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-il02')
  try {
    const family = await familyFor(request, club)
    const guardian = await invitedGuardianOf(request, club, family.other.child.personId, {
      firstName: 'Celina',
      lastName: 'Rodzic',
    })

    // The API: the coach of Żaki and the academy coordinator see the family, without any address.
    for (const staff of [family.coach, family.academyCoordinator]) {
      const list = await pendingFamilies(request, staff.token)
      expect(list.status, JSON.stringify(list.body)).toBe(200)
      const row = list.body?.items?.find((item) => item.personId === guardian.personId)
      expect(row).toMatchObject({
        displayName: `${guardian.firstName} ${guardian.lastName}`,
        children: [{ firstName: family.other.child.firstName, groupName: 'Żaki' }],
      })
      expect(JSON.stringify(list.body)).not.toContain('@')
      expect(await linkFor(request, staff.token, guardian.personId)).toMatch(/\/club\/i\//)
    }
    const logged = (await actionLogs(request, club.adminToken, guardian.personId)).filter(
      (entry) => entry.commandId === 'people.persons.share_invitation',
    )
    expect(logged.map((entry) => entry.context?.actingRole).sort()).toEqual(['coach', 'coordinator'])

    // The coach on the phone: the group page links to the families of the group; a family opens the QR code.
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto(`/club/groups/${family.zaki}`)
    await page.getByTestId('club-group-invite-families').click()
    await page.waitForURL(/\/club\/invitations\?groupId=/)
    const row = page.getByTestId('club-invitations-family').filter({ hasText: guardian.lastName })
    await expect(row).toBeVisible()
    await expect(row).toContainText(family.other.child.firstName)
    await prepareForAccessibilityScan(page)
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/invitations coach',
      async () => {
        await expect(page.getByTestId('club-invitations-family').first()).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
    await expectNoPageOverflow(page, 375)
    await page.setViewportSize({ width: 375, height: 812 })
    await row.click()
    const dialog = page.getByTestId('invitation-share-dialog')
    await expect(dialog.getByTestId('invitation-share-qr')).toBeVisible()
    await expect(dialog.getByTestId('invitation-share-url')).toHaveValue(/\/club\/i\//)
    await expect(dialog.getByTestId('invitation-share-copy')).toBeVisible()
    const box = await dialog.getByTestId('invitation-share-qr').boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(240)
    await page.keyboard.press('Escape')

    // The coordinator reaches the page from More → Invitations.
    await switchBrowserUser(page, request, club, family.academyCoordinator.userId, family.academyCoordinator.email)
    await page.goto('/club')
    await page.getByTestId('club-bottom-bar').locator('summary').click()
    await page
      .getByTestId('club-bottom-bar')
      .getByRole('link', { name: uiText('people.club.nav.invitations', { exact: true }) })
      .click()
    await page.waitForURL(/\/club\/invitations$/)
    await expect(page.getByTestId('club-invitations-family').filter({ hasText: guardian.lastName })).toBeVisible()

    // A fresh token for the coach after the browser sign-in ended the earlier one (lesson
    // `sign-in-browser-ends-the-api-token`) still lists the family.
    const coachToken = await signInAs(request, club, family.coach.userId, family.coach.email)
    expect(
      (await pendingFamilies(request, coachToken)).body?.items?.some((i) => i.personId === guardian.personId),
    ).toBe(true)
  } finally {
    await club.cleanup()
  }
})
