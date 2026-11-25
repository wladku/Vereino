import { expect, test } from '@playwright/test'
import { addDays, createEvent, getOccurrence, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// TEST-A19 (groups and activities parity spec REQ-A13, AC-A14; E10-S07 #272): a sparring tomorrow at a typed venue whose
// coach is a substitute. The guardian on a phone sees on Today, in the calendar and on the session page the type badge,
// the section with its dot, the map link and "substitute: {name}". The group's coach sees the card title open the
// session page and an "Attendance list" button; the session page offers "Message the group" — the inbox composer
// addressed to the session — and lists the substitution history. Light and dark, 375 px.
test.describe.configure({ timeout: 360_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const VENUE = { name: 'Stadion Wisły Brzezie', address: 'ul. Sportowa 1, Zielony Las' }

test('TEST-A19 the session cards and the session page show the dot, the map, the substitute and the badges; the coach card opens the session page with the attendance list, the message composer and the history', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-a19')
  try {
    const family = await familyFor(request, club)
    const tomorrow = addDays(calendarDate(), 1)
    const sparring = await createEvent(request, family.coach.token, {
      groupId: family.zaki,
      type: 'sparring',
      name: 'Sparing wyjazdowy',
      venue: VENUE,
      startsAt: zoneInstant(tomorrow, '10:00'),
      endsAt: zoneInstant(tomorrow, '11:30'),
      coachPersonId: family.coach.personId,
    })
    expect(sparring.status, JSON.stringify(sparring.body)).toBe(201)
    const sessionId = String(sparring.body?.occurrenceId)
    // The coordinator gives the session to a substitute.
    const substitute = await signedInStaff(request, club, { firstName: 'Bartek', lastName: 'Zastępca', role: 'coach' })
    const current = await getOccurrence(request, family.academyCoordinator.token, sessionId)
    const assigned = await call(
      request,
      'POST',
      `/api/activities/occurrences/${sessionId}/coach`,
      family.academyCoordinator.token,
      {
        data: { coachPersonId: substitute.personId },
        headers: { [OPTIMISTIC_LOCK_HEADER]: String(current.body?.updatedAt) },
      },
    )
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200)
    const substituteText = uiText('activities.club.session.substituteCoach')

    // --- The guardian on a phone: Today, the calendar, the session page ---
    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/club')
    const card = page.locator(`[data-testid="club-today-card"][data-occurrence-id="${sessionId}"]`)
    await expect(card.getByTestId('session-facts-type')).toHaveText(
      uiText('activities.types.sparring', { exact: true }),
    )
    await expect(card.getByTestId('session-facts-section')).toContainText('Akademia piłkarska')
    await expect(card.getByTestId('session-facts-map')).toHaveAttribute('href', /openstreetmap\.org\/search\?query=/)
    await expect(card.getByTestId('session-facts-substitute')).toContainText('Bartek Zastępca')
    await expect(card.getByTestId('session-facts-substitute')).toHaveText(substituteText)
    await expectNoPageOverflow(page)

    await page.goto('/club/calendar')
    const item = page.locator(`[data-testid="calendar-item"][data-item-id="${sessionId}"]`)
    await expect(item.getByTestId('calendar-item-section')).toContainText('Akademia piłkarska')
    await expect(item.getByTestId('calendar-item-map')).toHaveAttribute('href', /openstreetmap\.org/)
    await expect(item).toContainText(uiText('activities.types.sparring'))
    await expect(item.getByText(substituteText)).toBeVisible()

    await page.goto(`/club/occurrences/${sessionId}?as=guardian`)
    await expect(page.getByTestId('session-facts-type')).toBeVisible()
    await expect(page.getByTestId('club-session-substitution')).toHaveText(substituteText)
    await expect(page.getByTestId('club-session-map')).toBeVisible()
    const guardianViolations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/occurrences/[id] as guardian',
      async () => {
        await expect(page.getByTestId('club-session-substitution')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(guardianViolations).toEqual({})

    // --- The group's coach: the card opens the session page and carries "Attendance list" ---
    await switchBrowserUser(page, request, club, family.coach.userId, family.coach.email)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto('/club/calendar')
    const coachItem = page.locator(`[data-testid="calendar-item"][data-item-id="${sessionId}"]`).last()
    await expect(coachItem.getByRole('link', { name: /Sparing wyjazdowy/ })).toHaveAttribute(
      'href',
      new RegExp(`/club/occurrences/${sessionId}\\?as=coach`),
    )
    await expect(
      coachItem.getByRole('link', { name: uiText('activities.club.session.attendanceList', { exact: true }) }),
    ).toHaveAttribute('href', `/club/occurrences/${sessionId}/attendance`)

    await page.goto(`/club/occurrences/${sessionId}?as=coach`)
    const block = page.getByTestId('club-session-coach')
    await expect(block.getByTestId('club-session-history-entry')).toHaveCount(1)
    await expect(block.getByTestId('club-session-history-entry')).toContainText('Bartek Zastępca')
    const message = block.getByTestId('club-session-message-group')
    await expect(message).toHaveAttribute('href', `/club/messages?compose=occurrence%3A${sessionId}`)
    const coachViolations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/occurrences/[id] as coach',
      async () => {
        await expect(page.getByTestId('club-session-history')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(coachViolations).toEqual({})
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()
    await expectNoPageOverflow(page)
    await page.getByTestId('club-session-message-group').click()
    // The inbox opens its composer addressed to the session.
    await expect(page.getByTestId('club-messages-compose')).toBeVisible()
  } finally {
    await club.cleanup()
  }
})
