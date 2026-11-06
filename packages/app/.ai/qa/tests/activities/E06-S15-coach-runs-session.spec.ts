import { expect, test, type Page } from '@playwright/test'
import { addDays, weekdayOf } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, oneOff, readCalendarItem, sessionsOf } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { createGuardianship } from '../_fixtures/people'

// Issue #97 (E06-S15; README M-02, M-04, F-05; club spec REQ-007, REQ-009, TEST-014): a coach finds their sessions on
// Today and runs one from the phone (375 px). Marek coaches Żaki and is also the guardian of a child in Żaki: Today
// shows the ward's session and "My sessions" together; "Attendance list" opens M-05; M-04 as the coach carries the
// ward's declaration and "Running the session" together; a two-character reason is refused; "Pitch closed" cancels the
// session and the toast names the people told. The instructor of another group gets "This is not your session" on
// M-04 and M-05 with none of the session's data (the J-002 defect), and a coach-only person has no admin panel link.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const NOT_YOURS = /This is not your session|To nie są Twoje zajęcia/
const ADMIN_PANEL = /^(Admin panel|Panel administracyjny)$/

async function openMore(page: Page): Promise<void> {
  await page
    .getByTestId('club-bottom-bar')
    .getByText(/^(More|Więcej)$/)
    .click()
}

test('E06-S15 the coach runs a session from the phone: Today, attendance list, coach and guardian on M-04, cancellation; an outside coach is refused', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s15')
  try {
    const family = await familyFor(request, club)
    const tomorrow = addDays(calendarDate(), 1)
    const training = await oneOff(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening dodatkowy',
      type: 'training',
      weekday: weekdayOf(tomorrow),
      fromDaysAhead: 1,
      start: '17:00',
      end: '18:00',
    })
    const sessionId = training.session.id
    // Marek, the coach of Żaki, is also the guardian of the other family's child, who trains in Żaki.
    await createGuardianship(request, club.adminToken, {
      guardianPersonId: family.coach.personId,
      wardPersonId: family.other.child.personId,
      isPrimaryPayer: false,
      consents: { regulations: true },
      validFrom: addDays(calendarDate(), -30),
    })

    // The API: the coach reads the session as the coach; the instructor of the pool group is refused with 403.
    const asCoach = await readCalendarItem(request, family.coach.token, sessionId, 'as=coach')
    expect(asCoach.status, JSON.stringify(asCoach.body)).toBe(200)
    expect(asCoach.body?.persons).toEqual([])
    expect(asCoach.body?.summary).toBeTruthy()
    const outside = await readCalendarItem(request, family.instructor.token, sessionId, 'as=coach')
    expect(outside.status, JSON.stringify(outside.body)).toBe(403)
    expect(JSON.stringify(outside.body)).not.toContain('Trening dodatkowy')

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // --- Marek: coach and guardian ---
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto('/club')
    // Today unions the perspectives: the ward's session in the calendar tile and "My sessions" in the coach tile.
    const memberTile = page.getByTestId('club-tile-calendar')
    await expect(memberTile.getByTestId('club-today-session').filter({ hasText: 'Trening dodatkowy' })).toHaveText(
      new RegExp(family.other.child.firstName),
    )
    const coachTile = page.getByTestId('club-tile-coach')
    await expect(
      coachTile.getByRole('heading', { name: /My sessions today and tomorrow|Moje zajęcia dziś i jutro/ }),
    ).toBeVisible()
    const coachRow = coachTile.getByTestId('club-today-coach-session').filter({ hasText: 'Trening dodatkowy' })
    await expect(coachRow).toBeVisible()
    // Tap 1 → 2: "Attendance list" opens M-05.
    await coachRow.getByTestId('club-today-attendance-list').click()
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${sessionId}/attendance$`))
    await expect(page.getByTestId('club-attendance-title')).toContainText('Trening dodatkowy')

    // From Today to M-04 as the coach: both the ward's declaration and "Running the session".
    await page.goto('/club')
    await coachRow.getByRole('link', { name: /Trening dodatkowy/ }).click()
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${sessionId}\\?as=coach`))
    await expect(page.getByTestId('club-session-title')).toHaveText('Trening dodatkowy')
    const coachBlock = page.getByTestId('club-session-coach')
    await expect(coachBlock).toBeVisible()
    await expect(page.getByTestId('club-session-summary')).not.toBeEmpty()
    await expect(
      page.getByTestId('club-session-person').filter({ hasText: family.other.child.firstName }),
    ).toBeVisible()
    await expect(coachBlock.getByTestId('club-session-attendance')).toHaveAttribute(
      'href',
      `/club/occurrences/${sessionId}/attendance`,
    )
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/occurrences/[id] as coach',
      async () => {
        await expect(page.getByTestId('club-session-coach')).toBeVisible()
      },
      { platformBaseline: true },
    )
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()

    // A two-character reason is refused in the dialog; the session stays planned.
    await page.getByTestId('club-session-cancel').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(
      /Participants, guardians and the coach will be notified|Uczestnicy, opiekunowie i trener dostaną powiadomienie/,
    )
    await dialog.getByTestId('club-session-cancel-reason').fill('ab')
    await dialog.getByTestId('club-session-cancel-confirm').click()
    await expect(dialog.getByTestId('club-session-cancel-problem')).toHaveText(/at least 3|co najmniej 3/)
    await expect(dialog).toBeVisible()
    expect((await sessionsOf(request, club, training.activityId)).at(0)?.status).toBe('planned')

    // "Pitch closed" cancels it; the toast names how many people were told.
    await dialog.getByTestId('club-session-cancel-reason').fill('Pitch closed')
    const answer = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/activities/occurrences/${sessionId}/cancel`) &&
        response.request().method() === 'POST',
    )
    await dialog.getByTestId('club-session-cancel-confirm').click()
    const cancelled = await answer
    expect(cancelled.status()).toBe(200)
    const body = (await cancelled.json()) as { status?: string; notified?: number }
    expect(body.status).toBe('cancelled')
    // Żaki's three participants and the two families' guardians; Marek, who cancelled, is not counted.
    expect(body.notified).toBe(5)
    await expect(
      page.getByText(/Session canceled — people notified: 5|Zajęcia odwołane — powiadomione osoby: 5/).first(),
    ).toBeVisible()
    await expect(page.getByTestId('club-session-cancelled')).toContainText('Pitch closed')
    await expect(page.getByTestId('club-session-cancel')).toHaveCount(0)
    await expect(page.getByTestId('club-session-attendance')).toHaveCount(0)

    // --- The instructor of the pool group: a coach of another group ---
    await signInBrowser(page, request, club, family.instructor.userId, family.instructor.email)
    await page.goto(`/club/occurrences/${sessionId}?as=coach`)
    await expect(page.getByTestId('club-session-missing')).toHaveText(NOT_YOURS)
    await expect(page.getByTestId('club-session-title')).toHaveCount(0)
    await expect(page.getByText('Trening dodatkowy')).toHaveCount(0)
    await expect(page.getByText('Pitch closed')).toHaveCount(0)
    await page.goto(`/club/occurrences/${sessionId}/attendance`)
    await expect(page.getByTestId('club-attendance-missing')).toHaveText(NOT_YOURS)
    await expect(page.getByText('Trening dodatkowy')).toHaveCount(0)
    // A coach-only person runs their sessions from /club: no admin panel without a sessions perspective there.
    await page.goto('/club')
    await expect(page.getByTestId('club-tile-coach')).toBeVisible()
    await openMore(page)
    await expect(page.getByTestId('club-more').getByRole('link', { name: ADMIN_PANEL })).toHaveCount(0)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
