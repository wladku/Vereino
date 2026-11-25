import { expect, test } from '@playwright/test'
import { declare, familyFor, oneOff } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { guardianMedicalConsent, putMedical, wardOf } from '../_fixtures/medical'
import { uiText } from '../_fixtures/ui-text'

// Training outlines and medical expiry spec, phase 1 (#682; REQ-O05, M-O3, Q-O05, AC-O05): TEST-O04 — a match of Żaki
// with a player whose certificate is valid and two without one: the coach's session page lists the squad with the
// chips and warns about the two by name; nothing is blocked — the guardian still confirms the red player, and the coach
// still reaches the attendance list. Phone width 375 px, light and dark (axe).
test.describe.configure({ timeout: 420_000 })

test('TEST-O04 a red player in a match squad gets a warning, not a block', async ({ page, request }, testInfo) => {
  const club = await createClub(request, 'test-o04')
  try {
    const family = await familyFor(request, club)
    const elder = family.elder.personId
    const younger = family.younger.personId
    const otherChild = family.other.child.personId

    // The elder is valid (green); the younger has a consent but no date (red); the other child has neither (red).
    await guardianMedicalConsent(request, family.guardian.token, elder, true)
    await guardianMedicalConsent(request, family.guardian.token, younger, true)
    const set = await putMedical(
      request,
      family.guardian.token,
      elder,
      calendarDate(200),
      (await wardOf(request, family.guardian.token, elder)).medical?.updatedAt ?? null,
    )
    expect(set.status, JSON.stringify(set.body)).toBe(200)

    const match = await oneOff(request, club, club.adminToken, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Mecz ligowy O04',
      type: 'match',
      weekday: 'SA',
      fromDaysAhead: 2,
      start: '10:00',
      end: '11:30',
    })
    // Not blocked: the guardian confirms the red player for the match.
    const confirmed = await declare(request, family.guardian.token, {
      occurrenceId: match.session.id,
      personId: younger,
      declared: 'yes',
    })
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201)

    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/club/occurrences/${match.session.id}`)
    const squad = page.getByTestId('club-session-squad')
    await expect(squad).toBeVisible()
    await expect(squad).toContainText(uiText('activities.club.medical.squad.title'))
    const player = (personId: string) =>
      squad.locator(`[data-testid="club-session-squad-player"][data-person-id="${personId}"]`)
    await expect(player(elder).getByTestId('club-session-squad-medical')).toHaveAttribute(
      'data-medical-status',
      'green',
    )
    await expect(player(younger).getByTestId('club-session-squad-medical')).toHaveAttribute(
      'data-medical-status',
      'red',
    )
    await expect(player(otherChild).getByTestId('club-session-squad-medical')).toHaveAttribute(
      'data-medical-status',
      'red',
    )
    const warning = page.getByTestId('club-session-medical-warning')
    await expect(warning).toHaveAttribute('data-count', '2')
    await expect(warning).toContainText(family.younger.firstName)
    await expect(warning).toContainText(family.other.child.firstName)
    await expect(warning).not.toContainText(family.elder.firstName)
    // Nothing is disabled: the attendance list is still one tap away.
    await expect(page.getByTestId('club-session-attendance')).toBeVisible()
    await expectNoPageOverflow(page, 375)
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/occurrences/[id] match squad',
      async () => {
        await expect(page.getByTestId('club-session-medical-warning')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
