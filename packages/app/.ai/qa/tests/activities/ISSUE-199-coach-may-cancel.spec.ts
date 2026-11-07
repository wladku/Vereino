import { expect, test } from '@playwright/test'
import { addDays, cancelOccurrence, weekdayOf } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, oneOff, readAttendanceList, readCalendarItem } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { addMembership } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'

// Issue #199 (club spec DD-37; README M-04, M-05): the club setting `coach_may_cancel` (yes by default). Under the
// default, Marek, the coach of Żaki, is offered "Cancel session" (the #139 behaviour). Once the administrator turns the
// setting off, the coach's reads of M-04 and M-05 say `mayCancel: false` and the pages on the phone (375 px) offer no
// "Cancel session"; a forged cancellation answers 403 `coach_cancel_disabled` with a message that names the setting,
// and the session stays planned. Krystyna, the section's coordinator who also coaches Żaki, still cancels — in the
// coordinator role.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('ISSUE-199 coach_may_cancel off hides "Cancel session" from the coach and refuses a forged cancellation with 403; a coordinator still cancels', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'issue-199')
  try {
    const family = await familyFor(request, club)
    const coordinator = family.academyCoordinator
    const created = await oneOff(request, club, coordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening sobotni',
      type: 'training',
      weekday: weekdayOf(addDays(calendarDate(), 1)),
      fromDaysAhead: 1,
      start: '17:00',
      end: '18:00',
    })
    const sessionId = created.session.id

    // The default: the coach may cancel (#139 unchanged).
    const byDefault = await readCalendarItem(request, family.coach.token, sessionId, 'as=coach')
    expect(byDefault.status, JSON.stringify(byDefault.body)).toBe(200)
    expect(byDefault.body).toMatchObject({ mayCancel: true })
    const listByDefault = await readAttendanceList(request, family.coach.token, sessionId)
    expect(listByDefault.status, JSON.stringify(listByDefault.body)).toBe(200)
    expect(listByDefault.body).toMatchObject({ mayCancel: true })

    // The administrator turns the setting off.
    const off = await updateClubSettings(request, club.adminToken, { coachMayCancel: false })
    expect(off.status, JSON.stringify(off.body)).toBe(200)
    expect(off.body).toMatchObject({ coachMayCancel: false })

    const item = await readCalendarItem(request, family.coach.token, sessionId, 'as=coach')
    expect(item.body).toMatchObject({ mayCancel: false })
    const list = await readAttendanceList(request, family.coach.token, sessionId)
    expect(list.body).toMatchObject({ mayCancel: false })

    // A forged cancellation by the coach: 403 naming the setting; the session stays planned.
    const forged = await cancelOccurrence(
      request,
      family.coach.token,
      sessionId,
      'Pitch closed',
      created.session.updatedAt,
    )
    expect(forged.status, JSON.stringify(forged.body)).toBe(403)
    expect(forged.body?.code).toBe('coach_cancel_disabled')
    expect(forged.body?.error).toMatch(/Coaches may cancel sessions|Trenerzy mogą odwoływać zajęcia/)
    const still = await readCalendarItem(request, family.coach.token, sessionId, 'as=coach')
    expect(still.body?.occurrence.status).toBe('planned')

    // --- Marek on the phone: M-04 and M-05 offer no "Cancel session" ---
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto(`/club/occurrences/${sessionId}?as=coach`)
    await expect(page.getByTestId('club-session-coach')).toBeVisible()
    await expect(page.getByTestId('club-session-attendance')).toBeVisible()
    await expect(page.getByTestId('club-session-cancel')).toHaveCount(0)
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/occurrences/[id] coach without cancel',
      async () => {
        await expect(page.getByTestId('club-session-coach')).toBeVisible()
      },
      { platformBaseline: true },
    )
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/club/occurrences/${sessionId}/attendance`)
    await expect(page.getByTestId('club-attendance-title')).toBeVisible()
    await expect(page.getByTestId('club-attendance-cancel-section')).toHaveCount(0)

    // --- Krystyna coordinates the section and also coaches Żaki: she still cancels, as the coordinator ---
    await addMembership(request, club.adminToken, {
      groupId: family.zaki,
      personId: coordinator.personId,
      role: 'coach',
      validFrom: addDays(calendarDate(), -30),
    })
    const coordinatorList = await readAttendanceList(request, coordinator.token, sessionId)
    expect(coordinatorList.body).toMatchObject({ mayCancel: true })
    const cancelled = await cancelOccurrence(
      request,
      coordinator.token,
      sessionId,
      'Boisko zamknięte',
      created.session.updatedAt,
    )
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    expect(cancelled.body).toMatchObject({ status: 'cancelled', actingRole: 'coordinator' })
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
