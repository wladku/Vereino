import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, weekdayOf } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { declare, familyFor, oneOff, personOf, readCalendarItem } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'

// Issue #32, club spec TEST-014 (REQ-006, REQ-007; the guardian part — the coach's attendance list is #33): a guardian
// on a phone (375 px) reaches a declaration in at most three taps — "Today" → the session → "Report absence" — and
// approves a ward's pending declaration from the attendance tile. The member pages (`/club`, `/club/calendar`,
// `/club/occurrences/[id]`) render in light and dark mode with no critical or serious axe violation outside the platform
// baseline and no horizontal overflow; the calendar shows its error state with a working "Try again".
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const ABSENT = /^Absent$|^Nieobecny$/
const ATTENDING = /^Attending$|^Będzie$/

test('TEST-014 a guardian on a phone: Today → session → report absence in three taps, approve a pending declaration, states, axe in both schemes', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-014')
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
    const match = await oneOff(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Mecz ligowy',
      type: 'match',
      weekday: weekdayOf(addDays(calendarDate(), 3)),
      fromDaysAhead: 3,
      start: '10:00',
      end: '11:30',
    })
    // The 16-year-old answers the match himself: under the default `guardian_confirm` it waits for the guardian.
    const own = await declare(request, family.elder.token, {
      occurrenceId: match.session.id,
      personId: family.elder.personId,
      declared: 'yes',
    })
    expect(own.status, JSON.stringify(own.body)).toBe(201)
    expect(own.body?.declarationStatus).toBe('pending_guardian')

    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    // A new password ends the guardian's earlier sessions: later API calls use a fresh token.
    const guardianToken = await getAuthToken(request, family.guardian.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}

    // Tap 1: "Today" lists tomorrow's training in the calendar tile; the attendance tile names the waiting declaration.
    await page.goto('/club')
    const calendarTile = page.getByTestId('club-tile-calendar')
    await expect(calendarTile).toBeVisible()
    const todaySession = calendarTile.getByTestId('club-today-session').filter({ hasText: 'Trening dodatkowy' })
    await expect(todaySession).toBeVisible()
    await expect(page.getByTestId('club-tile-attendance')).toBeVisible()
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.reload()
      await expect(page.getByTestId('club-tile-calendar')).toBeVisible()
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (found.length > 0) violations[`/club (${colorScheme})`] = found
    }
    await expectNoPageOverflow(page)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()

    // Tap 2: the session page with the place, its address and a map link, and both wards in Żaki.
    await page.getByTestId('club-today-session').filter({ hasText: 'Trening dodatkowy' }).click()
    await expect(page.getByTestId('club-session-title')).toHaveText('Trening dodatkowy')
    await expect(page.getByTestId('club-session-address')).toBeVisible()
    await expect(page.getByTestId('club-session-map')).toBeVisible()
    const younger = page.getByTestId('club-session-person').filter({ hasText: family.younger.firstName })
    await expect(younger).toBeVisible()
    // A training is `absence_only`: only "Report absence" is offered.
    await expect(younger.getByRole('button', { name: /Attending|Będzie/ })).toHaveCount(0)

    // Tap 3: "Report absence" for the 14-year-old; the status is announced and stored.
    await younger.getByRole('button', { name: /Report absence|Zgłoś nieobecność/ }).click()
    await expect(younger.getByTestId('club-session-declaration')).toHaveText(ABSENT)
    await expect(page.getByTestId('club-session-announcement')).not.toBeEmpty()
    const stored = await readCalendarItem(request, guardianToken, training.session.id, 'as=guardian')
    expect(stored.status, JSON.stringify(stored.body)).toBe(200)
    expect(personOf(stored.body as never, family.younger.personId).declaration?.declared).toBe('no')
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.reload()
      await expect(page.getByTestId('club-session-title')).toBeVisible()
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (found.length > 0) violations[`/club/occurrences (${colorScheme})`] = found
    }
    await expectNoPageOverflow(page)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // The waiting match: from the attendance tile to the decision; "Approve" makes the ward's answer final.
    await page.goto('/club')
    await page.getByTestId('club-today-pending').first().click()
    await expect(page.getByTestId('club-session-title')).toHaveText('Mecz ligowy')
    const elder = page.getByTestId('club-session-person').filter({ hasText: family.elder.firstName })
    await elder
      .getByTestId('club-session-decision')
      .getByRole('button', { name: /^(Approve|Zatwierdź) — / })
      .click()
    await expect(elder.getByTestId('club-session-declaration')).toHaveText(ATTENDING)
    await expect(elder.getByTestId('club-session-decision')).toHaveCount(0)

    // The calendar: both sections, light and dark, then the error state with "Try again".
    await page.goto('/club/calendar')
    await expect(page.getByTestId('calendar-item').first()).toBeVisible()
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.reload()
      await expect(page.getByTestId('calendar-item').first()).toBeVisible()
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (found.length > 0) violations[`/club/calendar (${colorScheme})`] = found
    }
    await expectNoPageOverflow(page)
    await page.route('**/api/activities/calendar?*', (route) => route.abort())
    await page.reload()
    await expect(page.getByText(/calendar could not be loaded|Nie udało się wczytać kalendarza/)).toBeVisible()
    await page.unroute('**/api/activities/calendar?*')
    await page.getByRole('button', { name: /Try again|Spróbuj ponownie/ }).click()
    await expect(page.getByTestId('calendar-item').first()).toBeVisible()
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
