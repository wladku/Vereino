import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { familyFor } from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, call, createClub, getPerson } from '../_fixtures/club'
import { confirmPassword, invitedGuardianOf, linkFor, pathOf, startLink, tokenOf } from '../_fixtures/invitation-links'
import { uiText } from '../_fixtures/ui-text'

// Personal invitation link spec phase 1 (#868; REQ-IL04, REQ-IL05; IL-AC-05, IL-AC-06): TEST-IL04 — a link that is
// replaced by a newer one, expired, used or whose account was blocked shows the invalid state with the club's name and
// how to ask for a new link, and nothing about the person; the start answers the same 410 for each. An unknown token
// shows the invalid state without a club. A link preview (GET) spends nothing: the newest link still works after it.
test.describe.configure({ timeout: 420_000 })

test('TEST-IL04 replaced, expired, used and blocked links say the invitation is no longer valid', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-il04')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const guardian = await invitedGuardianOf(request, club, family.younger.personId, {
      firstName: 'Ewelina',
      lastName: 'Nieaktualna',
    })

    const expectInvalid = async (url: string, withClub: boolean) => {
      await page.goto(pathOf(url))
      await expect(page.getByTestId('invitation-page')).toHaveAttribute('data-state', 'invalid')
      await expect(page.getByTestId('invitation-page-invalid')).toBeVisible()
      await expect(page.getByTestId('invitation-page-start')).toHaveCount(0)
      const text = await page.locator('body').innerText()
      for (const name of [guardian.firstName, guardian.lastName, family.younger.firstName, family.younger.lastName]) {
        expect(text).not.toContain(name)
      }
      if (withClub) {
        await expect(page.getByTestId('invitation-page-invalid')).toContainText(
          uiText('people.invitationLink.page.invalidTitle'),
        )
      }
      const started = await startLink(request, url)
      expect(started.status, JSON.stringify(started.body)).toBe(410)
      expect(started.body?.code).toBe('invitation_link_invalid')
      expect(started.headers['cache-control']).toContain('no-store')
    }

    // Replaced: a second link revokes the first; the newest stays valid, also after its page was opened.
    const first = await linkFor(request, admin, guardian.personId)
    const second = await linkFor(request, admin, guardian.personId)
    expect(tokenOf(second)).not.toBe(tokenOf(first))
    await expectInvalid(first, true)
    await page.goto(pathOf(second))
    await expect(page.getByTestId('invitation-page')).toHaveAttribute('data-state', 'valid')
    const clubName = await page.getByTestId('invitation-page-club').innerText()
    await page.goto(pathOf(first))
    await expect(page.getByTestId('invitation-page-club')).toHaveText(clubName)

    // Expired: the newest link with its expiry moved into the past.
    await withClient((client) =>
      client.query(`update people_invitation_links set expires_at = now() - interval '1 minute' where person_id = $1`, [
        guardian.personId,
      ]),
    )
    await expectInvalid(second, true)

    // Blocked: a fresh link of an account the administrator blocked.
    const third = await linkFor(request, admin, guardian.personId)
    const version = (await getPerson(request, admin, guardian.personId)).body as { updatedAt?: string }
    const blocked = await call(request, 'PUT', `/api/people/persons/${guardian.personId}/account`, admin, {
      data: { blocked: true },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(version.updatedAt) },
    })
    expect(blocked.status, JSON.stringify(blocked.body)).toBe(200)
    await expectInvalid(third, true)
    const unblockVersion = (await getPerson(request, admin, guardian.personId)).body as { updatedAt?: string }
    const unblocked = await call(request, 'PUT', `/api/people/persons/${guardian.personId}/account`, admin, {
      data: { blocked: false },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(unblockVersion.updatedAt) },
    })
    expect(unblocked.status, JSON.stringify(unblocked.body)).toBe(200)

    // Used: the guardian activates from the newest link; it is then invalid.
    const fourth = await linkFor(request, admin, guardian.personId)
    const started = await startLink(request, fourth)
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    await confirmPassword(request, String(started.body?.url))
    await expectInvalid(fourth, true)

    // An unknown token: the invalid state without any club.
    const unknown = `${new URL(fourth).origin}/club/i/${'x'.repeat(43)}`
    await expectInvalid(unknown, false)
    await expect(page.getByTestId('invitation-page-club')).not.toHaveText(clubName)
  } finally {
    await club.cleanup()
  }
})
