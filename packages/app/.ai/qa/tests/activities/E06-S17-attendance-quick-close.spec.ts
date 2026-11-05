import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, createActivity } from '../_fixtures/activities'
import { expectNoPageOverflow } from '../_fixtures/axe'
import {
  addParticipants,
  declare,
  familyFor,
  readAttendanceList,
  rowOf,
  saveAttendanceList,
  sessionsOf,
  startNow,
} from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { createGroup } from '../_fixtures/groups'

// Issue #99 (E06-S17; README M-05, flow F-03 path B; REQ-007, REQ-008; R11): on a phone (375 px) the coach fills the
// list with "All declared present" (11 "yes" declarations; the three others stay unmarked), the close confirmation says
// the three unmarked persons will be recorded absent and to whom the unit is credited, Ctrl/Cmd+Enter opens it and a
// save by the coordinator meanwhile answers 409 with the conflict bar while the coach's marks stay; the closed save
// names the present count and returns to Today. A coordinator opening the empty list of a group without members is
// linked to the group roster.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const PRESENT = /^(Present|Obecny)$/

test('E06-S17 all declared present, the close summary, Ctrl+Enter, a 409 that keeps the marks, the closed toast and Today; the empty list links the coordinator to the roster', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e06-s17')
  try {
    const family = await familyFor(request, club)
    const extra = await addParticipants(request, club, family.zaki, 11)
    // A match declares with "yes" / "no" (`confirm`); the session's coach is the Żaki coach.
    const tomorrow = addDays(calendarDate(), 1)
    const match = await createActivity(request, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Mecz kontrolny',
      type: 'match',
      coachPersonId: family.coach.personId,
      startsOn: tomorrow,
      startTime: '17:00',
      endTime: '18:30',
    })
    const sessionId = (await sessionsOf(request, club, match.id)).at(0)?.id
    if (!sessionId) throw new Error('[test] the match has no session')
    for (const personId of extra) {
      const declared = await declare(request, family.coach.token, {
        occurrenceId: sessionId,
        personId,
        declared: 'yes',
      })
      expect(declared.status, JSON.stringify(declared.body)).toBe(201)
    }
    await startNow(request, club, sessionId)

    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    const coachToken = await getAuthToken(request, family.coach.email, password)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/club/occurrences/${sessionId}/attendance`)
    await expect(page.getByTestId('club-attendance-row')).toHaveCount(14)
    const row = (text: string) => page.getByTestId('club-attendance-row').filter({ hasText: text })

    // "All declared present": the 11 "yes" rows become present, the family's three stay unmarked.
    await page.getByTestId('club-attendance-fill-declared').click()
    await expect(page.getByTestId('club-attendance-announcement')).toHaveText(
      /Marked those who declared attendance as present|Zaznaczono jako obecne osoby, które zadeklarowały obecność/,
    )
    await expect(page.getByRole('radio', { name: PRESENT, checked: true })).toHaveCount(11)
    for (const name of [family.younger.firstName, family.elder.firstName, family.other.child.firstName]) {
      await expect(row(name).getByRole('radio', { checked: true })).toHaveCount(0)
    }
    await expect(page.getByTestId('club-attendance-fill-declared')).toBeDisabled()
    // The action bar stays in view above the bottom navigation on a phone.
    await expect(page.getByTestId('club-attendance-actions')).toBeInViewport()
    await expectNoPageOverflow(page)

    // Meanwhile the coordinator saves one of the same marks: the page's session version is stale.
    const loaded = await readAttendanceList(request, family.academyCoordinator.token, sessionId)
    const meanwhile = await saveAttendanceList(
      request,
      family.academyCoordinator.token,
      sessionId,
      { entries: [{ personId: extra[0] ?? '', actual: 'present' }] },
      loaded.body?.occurrence?.updatedAt,
    )
    expect(meanwhile.status, JSON.stringify(meanwhile.body)).toBe(200)
    const endAt = (loaded.body?.occurrence as { endAt?: string } | undefined)?.endAt

    // Ctrl+Enter opens the close confirmation with the summary.
    await page.getByTestId('club-attendance-title').click()
    await page.keyboard.press('Control+Enter')
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(
      /3 people without marked attendance — will be recorded as absent|Osoby bez zaznaczonej obecności: 3 — zostaną zapisane jako nieobecne/,
    )
    await expect(dialog).toContainText(
      /The unit is credited to: Marek Trener|Jednostka zostanie przypisana: Marek Trener/,
    )
    const running = /The session is still running or has not started|Zajęcia jeszcze trwają albo się nie zaczęły/
    if (endAt && new Date(endAt).getTime() > Date.now()) await expect(dialog).toContainText(running)
    else await expect(dialog).not.toContainText(running)
    await dialog.getByRole('button', { name: /^(Close session|Zamknij zajęcia)$/ }).click()

    // 409: the conflict bar; the list refreshes and the coach's marks stay; nothing was closed.
    await expect(page.getByTestId('record-conflict-banner')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${sessionId}/attendance$`))
    await expect(page.getByRole('radio', { name: PRESENT, checked: true })).toHaveCount(11)
    const afterConflict = await readAttendanceList(request, coachToken, sessionId)
    expect(afterConflict.body?.occurrence?.status).toBe('planned')

    // Closing again with the refreshed version: the toast names the present count and Today opens.
    await page.getByTestId('club-attendance-close').click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/3 people without|Osoby bez zaznaczonej obecności: 3/)
    await dialog.getByRole('button', { name: /^(Close session|Zamknij zajęcia)$/ }).click()
    await expect(page).toHaveURL(/\/club$/)
    await expect(page.getByText(/Session closed — 11 present|Zajęcia zamknięte — obecni: 11/).first()).toBeVisible()
    const closed = await readAttendanceList(request, coachToken, sessionId)
    expect(closed.body?.occurrence?.status).toBe('done')
    for (const personId of extra) {
      expect(closed.body && rowOf(closed.body, personId).actual).toBe('present')
    }
    for (const personId of [family.younger.personId, family.elder.personId, family.other.child.personId]) {
      expect(closed.body && rowOf(closed.body, personId).actual).toBe('absent')
    }

    // A group without members: the coordinator's empty list links to the group roster.
    const empty = await createGroup(request, club.adminToken, {
      sectionId: family.academy,
      name: 'Pusta grupa',
      kind: 'team',
    })
    const emptyActivity = await createActivity(request, family.academyCoordinator.token, {
      groupId: empty,
      placeId: family.lockerRoom,
      name: 'Trening pustej grupy',
      type: 'training',
      startsOn: tomorrow,
      startTime: '08:00',
      endTime: '09:00',
    })
    const emptySessionId = (await sessionsOf(request, club, emptyActivity.id)).at(0)?.id
    if (!emptySessionId) throw new Error('[test] the empty group has no session')
    await signInBrowser(page, request, club, family.academyCoordinator.userId, family.academyCoordinator.email)
    await page.goto(`/club/occurrences/${emptySessionId}/attendance`)
    await expect(page.getByTestId('club-attendance-empty')).toContainText(
      /The group has no members on the session date|Grupa nie ma członków w dniu zajęć/,
    )
    await page.getByTestId('club-attendance-roster-link').click()
    await expect(page).toHaveURL(new RegExp(`/backend/groups/groups/${empty}$`))
  } finally {
    await club.cleanup()
  }
})
