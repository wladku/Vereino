import { expect, test, type APIRequestContext } from '@playwright/test'
import { addDays, createEvent, getOccurrence, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, readCalendarItem } from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { postClosure } from '../_fixtures/facilities'
import { signedInStaff } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// TEST-A16 (groups and activities parity spec REQ-A10, AC-A12, J-A03 steps 1–2, J-A04 steps 1–2; E10-S08 #273): the
// coordinator of the academy, who coaches no group, works the section's sessions on a phone (375 px) in the staff
// context, en and pl, light and dark, without one `/backend` page: Today shows the three counts; "Needing a coach"
// opens the section calendar in that view; the session page's "Assign substitute" opens a bottom sheet that lists the
// free coaches first and finds Bartek by a search; the history then shows the entry. A session flagged "Needs a new
// time" is moved from the phone — the flag is cleared and the toast names how many people were told — and another
// one is cancelled. A session of the pool, opened by URL, shows nothing and takes no change (403). A busy coach answers
// the existing 409 with the collision.
test.describe.configure({ timeout: 480_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

async function session(
  request: APIRequestContext,
  club: Club,
  input: { groupId: string; placeId: string; name: string; date: string; start: string; end: string; coach?: string },
): Promise<string> {
  const created = await createEvent(request, club.adminToken, {
    groupId: input.groupId,
    type: 'other',
    name: input.name,
    placeId: input.placeId,
    startsAt: zoneInstant(input.date, input.start),
    endsAt: zoneInstant(input.date, input.end),
    ...(input.coach ? { coachPersonId: input.coach } : {}),
  })
  expect(created.status, `POST /api/activities/events ${JSON.stringify(created.body)}`).toBe(201)
  return String(created.body?.occurrenceId)
}

test('TEST-A16 a section coordinator sees the counts, assigns a substitute from a sheet, moves and cancels sessions on the phone, and cannot act on another section', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-a16')
  try {
    const family = await familyFor(request, club)
    const today = calendarDate()
    const inTwo = addDays(today, 2)
    const inThree = addDays(today, 3)
    const inFour = addDays(today, 4)
    const inFive = addDays(today, 5)
    const marek = family.coach.personId
    // Without a coach: the one session "Needing a coach".
    const unassigned = await session(request, club, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening bez trenera',
      date: inTwo,
      start: '17:00',
      end: '18:30',
    })
    // Irena runs the pool at the same time, so the sheet offers her as busy.
    await session(request, club, {
      groupId: family.poolGroup,
      placeId: family.poolPlace,
      name: 'Basen wieczorny',
      date: inTwo,
      start: '17:00',
      end: '18:30',
      coach: family.instructor.personId,
    })
    const flagged = await session(request, club, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening do przełożenia',
      date: inThree,
      start: '17:00',
      end: '18:30',
      coach: marek,
    })
    const toCancel = await session(request, club, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening do odwołania',
      date: inFive,
      start: '17:00',
      end: '18:30',
      coach: marek,
    })
    const poolSession = await session(request, club, {
      groupId: family.poolGroup,
      placeId: family.poolPlace,
      name: 'Nauka pływania',
      date: inFive,
      start: '18:00',
      end: '19:00',
      coach: family.instructor.personId,
    })
    const bartek = await signedInStaff(request, club, { firstName: 'Bartek', lastName: 'Wolny', role: 'coach' })
    // J-A03 step 1: the pitch closes on that evening, so the session needs a new time.
    const closure = await postClosure(request, club.adminToken, {
      placeId: family.pitch,
      startsAt: zoneInstant(inThree, '16:00'),
      endsAt: zoneInstant(inThree, '20:00'),
      reason: 'municipal_event',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    expect((await getOccurrence(request, club.adminToken, flagged)).body?.needsReschedule).toBe(true)

    // --- The reads and the refusals the pages rely on (before the browser sign-in ends the coordinator's token) ---
    const coordinatorToken = family.academyCoordinator.token
    const ownRead = await readCalendarItem(request, coordinatorToken, unassigned, 'as=coordinator')
    expect(ownRead.status, JSON.stringify(ownRead.body)).toBe(200)
    expect(ownRead.body).toMatchObject({ mayAssign: true, mayEdit: true, mayCancel: true, mayTakeOver: false })
    const detail = await getOccurrence(request, coordinatorToken, unassigned)
    expect(detail.body).toMatchObject({ mayAssign: true, mayEdit: true, mayTakeOver: false, mayCancel: true })
    // The coach of the group reads the session as the coach: no "Assign substitute" for them.
    const coachRead = await readCalendarItem(request, family.coach.token, flagged, 'as=coach')
    expect(coachRead.status, JSON.stringify(coachRead.body)).toBe(200)
    expect(coachRead.body).toMatchObject({ mayAssign: false, mayTakeOver: false })
    // Another section's session: 403 for the read and for every change.
    const otherRead = await readCalendarItem(request, coordinatorToken, poolSession, 'as=coordinator')
    expect(otherRead.status).toBe(403)
    const poolVersion = String((await getOccurrence(request, club.adminToken, poolSession)).body?.updatedAt)
    const otherCancel = await call(
      request,
      'POST',
      `/api/activities/occurrences/${poolSession}/cancel`,
      coordinatorToken,
      {
        data: { reason: 'Nie moja sekcja' },
        headers: { [OPTIMISTIC_LOCK_HEADER]: poolVersion },
      },
    )
    expect(otherCancel.status).toBe(403)
    const otherAssign = await call(
      request,
      'POST',
      `/api/activities/occurrences/${poolSession}/coach`,
      coordinatorToken,
      {
        data: { coachPersonId: bartek.personId },
        headers: { [OPTIMISTIC_LOCK_HEADER]: poolVersion },
      },
    )
    expect(otherAssign.status).toBe(403)
    expect((await getOccurrence(request, club.adminToken, poolSession)).body).toMatchObject({
      status: 'planned',
      coachPersonId: family.instructor.personId,
    })
    // J-A04 step 5: a coach who has another session then answers the existing 409 with the collision.
    const busy = await call(request, 'POST', `/api/activities/occurrences/${unassigned}/coach`, coordinatorToken, {
      data: { coachPersonId: family.instructor.personId },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(detail.body?.updatedAt) },
    })
    expect(busy.status, JSON.stringify(busy.body)).toBe(409)
    expect(busy.body?.code).toBe('occurrence_coach_conflict')

    // --- Today on the phone: the three counts, each opening its view (en and pl, light and dark) ---
    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, family.academyCoordinator.userId, family.academyCoordinator.email)
    await prepareForAccessibilityScan(page)
    const violations: Record<string, unknown> = {}
    const count = (view: string) =>
      page
        .locator(`[data-testid="club-today-section-count"][data-view="${view}"]`)
        .getByTestId('club-today-section-count-value')
    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto('/club')
      await expect(page.getByTestId('club-tile-section')).toContainText(uiText('activities.club.section.tileTitle'))
      await expect(count('unassigned')).toHaveText('1')
      await expect(count('reschedule')).toHaveText('1')
      await expect(count('unsettled')).toHaveText('0')
      // A coordinator who coaches no group gets no coach tile.
      await expect(page.getByTestId('club-tile-coach')).toHaveCount(0)
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `/club section tile (${locale})`, async () => {
          await expect(count('unassigned')).toHaveText('1')
        }),
      )
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 375, height: 812 })
      await page.goto('/club')
      await page.locator('[data-testid="club-today-section-count"][data-view="unassigned"]').getByRole('link').click()
      await expect(page).toHaveURL(/\/club\/calendar\?as=coordinator&view=unassigned$/)
      await expect(
        page.getByRole('tab', { name: uiText('activities.club.section.view.unassigned', { exact: true }) }),
      ).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator(`[data-testid="calendar-item"][data-item-id="${unassigned}"]`)).toBeVisible()
      await expect(page.locator(`[data-testid="calendar-item"][data-item-id="${flagged}"]`)).toHaveCount(0)
      await expect(page.locator(`[data-testid="calendar-item"][data-item-id="${poolSession}"]`)).toHaveCount(0)
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `/club/calendar section view (${locale})`, async () => {
          await expect(page.locator(`[data-testid="calendar-item"][data-item-id="${unassigned}"]`)).toBeVisible()
        }),
      )
      await expectNoPageOverflow(page)
    }
    await page.context().addCookies([{ name: 'locale', value: 'en', url: BASE_URL }])
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 375, height: 812 })

    // The "Unsettled" view is empty and leads back to All, where the week lists the section's sessions only.
    await page.goto('/club/calendar?as=coordinator&view=unsettled')
    await expect(page.getByTestId('calendar-empty')).toHaveText(uiText('activities.club.section.empty.unsettled'))
    await page.getByTestId('club-calendar-section-all').click()
    await expect(page).toHaveURL(/\/club\/calendar\?as=coordinator$/)
    await expect(
      page.getByRole('tab', { name: uiText('activities.club.section.view.all', { exact: true }) }),
    ).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('club-calendar-toolbar')).toBeVisible()

    // --- J-A04 steps 1–2: "Assign substitute" in a bottom sheet, the free coaches first, a search for "Bar" ---
    await page.goto('/club/calendar?as=coordinator&view=unassigned')
    await page
      .locator(`[data-testid="calendar-item"][data-item-id="${unassigned}"]`)
      .getByRole('link', { name: /Trening bez trenera/ })
      .click()
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${unassigned}\\?as=coordinator`))
    const block = page.getByTestId('club-session-coach')
    await expect(block.getByTestId('club-session-assign')).toHaveText(
      uiText('activities.club.session.assignSubstitute', { exact: true }),
    )
    await expect(block.getByTestId('club-session-edit')).toHaveAttribute(
      'href',
      `/club/occurrences/${unassigned}/edit?as=coordinator`,
    )
    // The destructive action comes last, and every action is a full-width 44 px target.
    const actions = block.getByTestId('club-session-actions')
    await expect(actions.locator(':scope > *').last()).toHaveAttribute('data-testid', 'club-session-cancel')
    for (const box of await actions
      .locator(':scope > *')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()))) {
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    await block.getByTestId('club-session-assign').click()
    const sheet = page.getByTestId('assign-coach-sheet')
    await expect(sheet.getByTestId('assign-coach-option').first()).toHaveAttribute('data-busy', 'false')
    await expect(sheet.getByTestId('assign-coach-option').last()).toHaveAttribute('data-busy', 'true')
    await expect(sheet.getByRole('radio', { name: /Irena Instruktor/ })).toHaveAttribute('data-busy', 'true')
    const sheetViolations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/occurrences/[id] assign sheet',
      async () => {
        await page.getByTestId('club-session-assign').click()
        await expect(page.getByTestId('assign-coach-sheet')).toBeVisible()
      },
      { platformBaseline: true },
    )
    Object.assign(violations, sheetViolations)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload()
    await page.getByTestId('club-session-assign').click()
    await sheet.getByTestId('assign-coach-search').fill('Bar')
    await expect(sheet.getByTestId('assign-coach-option')).toHaveCount(1)
    await sheet.getByRole('radio', { name: /Bartek Wolny/ }).check()
    const assignAnswer = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/activities/occurrences/${unassigned}/coach`) &&
        response.request().method() === 'POST',
    )
    await sheet.getByTestId('assign-coach-submit').click()
    expect((await assignAnswer).status()).toBe(200)
    await expect(page.getByText(uiText('activities.substitutions.assigned')).first()).toBeVisible()
    await expect(block.getByTestId('club-session-history-entry')).toHaveCount(1)
    await expect(block.getByTestId('club-session-history-entry')).toContainText('Bartek Wolny')
    await expect(block.getByTestId('club-session-assign')).toHaveText(
      uiText('activities.club.session.changeCoach', { exact: true }),
    )
    expect((await getOccurrence(request, club.adminToken, unassigned)).body?.coachPersonId).toBe(bartek.personId)

    // --- J-A03 steps 1–2: "Needs a new time" → the session → Edit → a new day; the flag is cleared ---
    await page.goto('/club/calendar?as=coordinator&view=reschedule')
    await page
      .locator(`[data-testid="calendar-item"][data-item-id="${flagged}"]`)
      .getByRole('link', { name: /Trening do przełożenia/ })
      .click()
    await page.getByTestId('club-session-edit').click()
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${flagged}/edit\\?as=coordinator`))
    await expect(page.getByTestId('club-edit-start')).toHaveValue('17:00')
    await page.getByTestId('club-edit-date').fill(inFour)
    const moved = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/activities/occurrences/${flagged}`) && response.request().method() === 'PATCH',
    )
    await page.getByTestId('club-edit-submit').click()
    const movedAnswer = await moved
    expect(movedAnswer.status()).toBe(200)
    const notified = ((await movedAnswer.json()) as { notified?: number }).notified ?? 0
    expect(notified).toBeGreaterThan(0)
    await expect(page.getByText(uiText('activities.club.edit.savedNotified')).first()).toContainText(String(notified))
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${flagged}\\?as=coordinator`))
    expect((await getOccurrence(request, club.adminToken, flagged)).body).toMatchObject({
      needsReschedule: false,
      startAt: zoneInstant(inFour, '17:00'),
    })

    // --- Cancel from the phone: the toast names how many people were told ---
    await page.goto(`/club/occurrences/${toCancel}?as=coordinator`)
    await page.getByTestId('club-session-cancel').click()
    await page.getByTestId('club-session-cancel-reason').fill('Turniej miejski')
    const cancelled = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/activities/occurrences/${toCancel}/cancel`) &&
        response.request().method() === 'POST',
    )
    await page.getByTestId('club-session-cancel-confirm').click()
    expect((await cancelled).status()).toBe(200)
    await expect(page.getByText(uiText('activities.club.cancel.done')).first()).toBeVisible()
    expect((await getOccurrence(request, club.adminToken, toCancel)).body?.status).toBe('cancelled')
    await page.goto('/club/calendar?as=coordinator&view=cancelled')
    await expect(page.locator(`[data-testid="calendar-item"][data-item-id="${toCancel}"]`)).toBeVisible()

    // --- Another section's session opened by URL: "This is not your session", no block, nothing saved ---
    await page.goto(`/club/occurrences/${poolSession}?as=coordinator`)
    await expect(page.getByTestId('club-session-missing')).toHaveText(uiText('activities.club.session.notYours'))
    await expect(page.getByTestId('club-session-coach')).toHaveCount(0)
    await page.goto(`/club/occurrences/${poolSession}/edit?as=coordinator`)
    await expect(page.getByTestId('club-edit-denied')).toBeVisible()
    expect((await getOccurrence(request, club.adminToken, poolSession)).body).toMatchObject({
      status: 'planned',
      coachPersonId: family.instructor.personId,
      startAt: zoneInstant(inFive, '18:00'),
    })

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
