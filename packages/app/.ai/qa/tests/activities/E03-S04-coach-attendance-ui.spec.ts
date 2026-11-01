import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, showCalendarWeekOf, weekdayOf } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import {
  declare,
  familyFor,
  oneOff,
  readAttendanceList,
  rowOf,
  saveAttendanceList,
  startNow,
} from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'

// Issue #33 (E03-S04), club spec UI row `/club/occurrences/[id]/attendance`: the coach on a phone (375 px) reads the
// list before the session — the summary of the kind and each child's expectation, no check-off yet — then, once the
// session started, reaches the list from the coach calendar, checks off, meets a save made meanwhile by the coordinator
// (the shared conflict bar; the list refreshes and the coach's selections stay), saves and closes the session after a
// confirmation. Light and dark mode without critical or serious axe violations outside the platform baseline; no
// horizontal overflow at 375 and 320 px.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const PRESENT = /^(Present|Obecny)$/
const ABSENT = /^(Absent|Nieobecny)$/
const LATE = /^(Late|Spóźniony)$/

test('E03-S04 the coach on a phone: expectations before the start, check-off from the calendar, a conflict keeps the selections, save and close; axe in both schemes', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e03-s04-ui')
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
    const reported = await declare(request, family.guardian.token, {
      occurrenceId: sessionId,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(reported.status, JSON.stringify(reported.body)).toBe(201)

    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    // A new password ends the coach's earlier sessions: later API calls use a fresh token.
    const coachToken = await getAuthToken(request, family.coach.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}

    // Before the session: the summary and the expectations, no check-off.
    await page.goto(`/club/occurrences/${sessionId}/attendance`)
    await expect(page.getByTestId('club-attendance-title')).toContainText('Trening dodatkowy')
    await expect(page.getByTestId('club-attendance-summary')).toHaveText(
      /Expected: 2 · absent: 1|Oczekiwani: 2 · nieobecni: 1/,
    )
    await expect(page.getByTestId('club-attendance-not-started')).toBeVisible()
    await expect(page.getByTestId('club-attendance-row')).toHaveCount(3)
    await expect(page.getByRole('radio')).toHaveCount(0)
    const youngerBefore = page.getByTestId('club-attendance-row').filter({ hasText: family.younger.firstName })
    await expect(youngerBefore.getByTestId('club-attendance-expectation')).toHaveText(
      /Absence reported|Zgłoszona nieobecność/,
    )
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.reload()
      await expect(page.getByTestId('club-attendance-summary')).toBeVisible()
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (found.length > 0) violations[`/club/occurrences/[id]/attendance before (${colorScheme})`] = found
    }
    await expectNoPageOverflow(page)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // The session starts; the coach finds it in the coach calendar and opens the list from there.
    await startNow(request, club, sessionId)
    await page.goto('/club/calendar')
    await page.getByLabel(/^(Show|Pokaż)$/).click()
    await page.getByRole('option', { name: /As coach|Jako trener/ }).click()
    // `startNow` moves the times only: the session keeps tomorrow's date, which is next week on a Sunday.
    await showCalendarWeekOf(page, tomorrow)
    const item = page.getByTestId('calendar-item').filter({ hasText: 'Trening dodatkowy' })
    await expect(item).toBeVisible()
    await item.getByRole('link').first().click()
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${sessionId}/attendance$`))
    await expect(page.getByTestId('club-attendance-not-started')).toHaveCount(0)

    const row = (firstName: string) => page.getByTestId('club-attendance-row').filter({ hasText: firstName })
    await row(family.younger.firstName).getByRole('radio', { name: ABSENT }).click()
    await row(family.elder.firstName).getByRole('radio', { name: LATE }).click()
    await row(family.other.child.firstName).getByRole('radio', { name: PRESENT }).click()

    // Meanwhile the coordinator saves the list: the page's version is stale.
    const loaded = await readAttendanceList(request, family.academyCoordinator.token, sessionId)
    const meanwhile = await saveAttendanceList(
      request,
      family.academyCoordinator.token,
      sessionId,
      { entries: [{ personId: family.other.child.personId, actual: 'late' }] },
      loaded.body?.occurrence?.updatedAt,
    )
    expect(meanwhile.status, JSON.stringify(meanwhile.body)).toBe(200)
    await page.getByTestId('club-attendance-save').click()
    await expect(page.getByTestId('record-conflict-banner')).toBeVisible()
    // The list refreshed (the coordinator's mark shows as saved) and the coach's selections stayed.
    await expect(row(family.other.child.firstName).getByTestId('club-attendance-marked-by')).toContainText(
      /coordinator|koordynator/,
    )
    await expect(row(family.younger.firstName).getByRole('radio', { name: ABSENT })).toBeChecked()
    await expect(row(family.elder.firstName).getByRole('radio', { name: LATE })).toBeChecked()
    await expect(row(family.other.child.firstName).getByRole('radio', { name: PRESENT })).toBeChecked()

    // Saving again with the refreshed version succeeds; each row says who marked it.
    await page.getByTestId('club-attendance-save').click()
    await expect(page.getByTestId('club-attendance-announcement')).toHaveText(/Attendance saved|Obecność zapisana/)
    await expect(row(family.elder.firstName).getByTestId('club-attendance-marked-by')).toContainText(/coach|trener/)
    const stored = await readAttendanceList(request, coachToken, sessionId)
    expect(stored.status, JSON.stringify(stored.body)).toBe(200)
    expect(stored.body && rowOf(stored.body, family.elder.personId)).toMatchObject({
      actual: 'late',
      markedByPersonId: family.coach.personId,
      markedAsRole: 'coach',
    })
    expect(stored.body && rowOf(stored.body, family.other.child.personId).actual).toBe('present')
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.reload()
      await expect(page.getByTestId('club-attendance-row').first()).toBeVisible()
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (found.length > 0) violations[`/club/occurrences/[id]/attendance open (${colorScheme})`] = found
    }
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 320, height: 720 })
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // "Close session" asks first; confirming closes it and the list becomes read-only.
    await page.getByTestId('club-attendance-close').click()
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^(Close session|Zamknij zajęcia)$/ }).click()
    await expect(page.getByTestId('club-attendance-done')).toBeVisible()
    await expect(page.getByRole('radio')).toHaveCount(0)
    await expect(row(family.elder.firstName).getByTestId('club-attendance-actual')).toHaveText(LATE)
    const closed = await readAttendanceList(request, coachToken, sessionId)
    expect(closed.body?.occurrence?.status).toBe('done')
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
