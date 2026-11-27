import { expect, test } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { addDays, createEvent, nextWeekday, readNotifications, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createStaff } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import {
  confirmRental,
  phoneRental,
  postInternalBooking,
  postRental,
  rentalPitch,
  runRentalLifecycle,
  staffCalendar,
} from '../_fixtures/facilities'
import {
  completeMaintenance,
  listMaintenance,
  makeMaintainer,
  postMaintenance,
  putMaintenance,
  runMaintenanceReminders,
} from '../_fixtures/maintenance'
import { getMe, putMe } from '../_fixtures/members'
import { uiText } from '../_fixtures/ui-text'

// Issue #283 (E11-S09), facilities parity spec phase 9, TEST-R15 (REQ-R15, J-R07, AC-R11): Zbyszek maintains Boisko A,
// not the hall. A yearly inspection due in three days and a brushing task every 10 hours of use are planned on the
// pitch, an inspection on the hall. Once the rental and the internal booking reach 10 hours, the reminder job sends
// him both reminders linking to `/club/places/maintenance` and the administrator hers linking to the panel's
// Maintenance tab. At 375 px he follows the link from "Facilities": the list shows only the pitch's tasks under Due and
// Planned. On Friday's redacted day of the pitch ("Zajęte przez klub", no names) he plans brushing over the 08:00
// session, which is flagged. He marks the inspection done: it moves to Done and next year's instance is planned.
// Completing it again answers 409 `maintenance_task_closed`; the hall answers 403. Polish and English, light and dark.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const CLUB_MAINTENANCE = '/club/places/maintenance'

test('TEST-R15 the maintainer on the phone: reminder link, own tasks, a window from the axis, done and the next one', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r15-maintainer')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const pitch = setup.pitch
    const hall = await createStructure(request, admin, 'places', { name: 'Hala sportowa', kind: 'hall' })
    const today = calendarDate()
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const friday = nextWeekday(addDays(today, 1), 'FR')
    const dueDate = addDays(today, 3)

    const groundsman = await createStaff(request, club, {
      firstName: 'Zbyszek',
      lastName: 'Gospodarz',
      birthDate: birthDateTurning(55),
    })
    const { token } = await makeMaintainer(request, club, groundsman, pitch)

    // The pitch: a yearly inspection due in three days and brushing every 10 hours of use; the hall: an inspection.
    const inspection = await postMaintenance(request, admin, {
      placeId: pitch,
      kind: 'inspection',
      scheduleType: 'date_recurring',
      dueDate,
      recurrenceRule: 'FREQ=YEARLY',
    })
    expect(inspection.status, JSON.stringify(inspection.body)).toBe(201)
    const inspectionId = String(inspection.body?.id)
    const brushing = await postMaintenance(request, admin, {
      placeId: pitch,
      kind: 'brushing',
      scheduleType: 'usage_hours',
      usageHoursThreshold: 10,
    })
    expect(brushing.status, JSON.stringify(brushing.body)).toBe(201)
    const brushingId = String(brushing.body?.id)
    const onHall = await postMaintenance(request, admin, {
      placeId: hall,
      kind: 'inspection',
      scheduleType: 'one_off',
      dueDate,
    })
    expect(onHall.status, JSON.stringify(onHall.body)).toBe(201)
    const hallTaskId = String(onHall.body?.id)

    // Saturday: a 6-hour rental (confirmed, then done) and a 4-hour internal booking — 10 hours of use.
    const rental = await postRental(
      request,
      admin,
      phoneRental(pitch, setup.neighbours, zoneInstant(saturday, '09:00'), 4),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)
    await confirmRental(request, admin, String(rental.body?.id))
    const booking = await postInternalBooking(request, admin, {
      placeId: pitch,
      startsAt: zoneInstant(saturday, '15:00'),
      endsAt: zoneInstant(saturday, '19:00'),
      sectionId: setup.academy,
      purpose: 'Obóz bramkarzy',
    })
    expect(booking.status, JSON.stringify(booking.body)).toBe(201)

    // Sunday's reminder run: the inspections are overdue, the brushing reached 10 hours — each reminder once.
    const sunday = zoneInstant(addDays(saturday, 1), '12:00')
    expect(runRentalLifecycle(club, sunday).changedIds).toContain(String(rental.body?.id))
    expect(runMaintenanceReminders(club, sunday)).toMatchObject({ sent: 3, skipped: 0, failed: 0 })
    expect(runMaintenanceReminders(club, sunday)).toMatchObject({ sent: 0, skipped: 3, failed: 0 })

    // The maintainer's reminders link to his phone page; the administrator's to the panel's Maintenance tab.
    const maintenanceNotices = async (who: string) =>
      (await readNotifications(request, who)).filter((item) => item.type.startsWith('facilities.maintenance_due'))
    await expect
      .poll(async () => (await maintenanceNotices(token)).length, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(2)
    const mine = await maintenanceNotices(token)
    expect(mine.map((item) => item.sourceEntityId).sort()).toEqual([inspectionId, brushingId].sort())
    for (const item of mine) {
      expect(item).toMatchObject({ type: 'facilities.maintenance_due_planner', linkHref: CLUB_MAINTENANCE })
    }
    await expect
      .poll(async () => (await maintenanceNotices(admin)).length, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(3)
    const theirs = await maintenanceNotices(admin)
    expect(theirs.map((item) => item.sourceEntityId).sort()).toEqual([inspectionId, brushingId, hallTaskId].sort())
    for (const item of theirs) {
      expect(item).toMatchObject({ type: 'facilities.maintenance_due', linkHref: '/backend/facilities/maintenance' })
    }

    // Friday 08:00–09:30 on the pitch, inside its opening hours: a session the window will cover.
    const session = await createEvent(request, admin, {
      groupId: setup.zaki,
      type: 'tournament',
      name: 'Sparing Żaków',
      placeId: pitch,
      startsAt: zoneInstant(friday, '08:00'),
      endsAt: zoneInstant(friday, '09:30'),
    })
    expect(session.status, JSON.stringify(session.body)).toBe(201)

    // Signing in the browser sets a new password, so his API calls below use a fresh token.
    const password = await signInBrowser(page, request, club, groundsman.userId, groundsman.email)
    const fresh = await getAuthToken(request, groundsman.email, password)
    const me = await getMe(request, fresh)
    const polish = await putMe(request, fresh, { preferredLocale: 'pl' }, me.body?.person.updatedAt)
    expect(polish.status, JSON.stringify(polish.body)).toBe(200)

    const consoleErrors: string[] = []
    page.on('console', (message) => {
      // The hall answers 403 on purpose; the browser logs it as a failed resource.
      if (message.type() === 'error' && !message.text().includes('status of 403')) consoleErrors.push(message.text())
    })
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // "Facilities" lists the pitch only and links to "Maintenance".
    await page.goto('/club/places')
    await expect(page.getByTestId(`club-places-card-${pitch}`)).toBeVisible()
    await expect(page.getByTestId(`club-places-card-${hall}`)).toHaveCount(0)
    await page.getByTestId('club-places-maintenance').click()
    await expect(page).toHaveURL(new RegExp(`${CLUB_MAINTENANCE}$`))

    // The reminder's link: the pitch's tasks only — the inspection under Due, the brushing under Planned.
    await page.goto(String(mine[0]?.linkHref))
    const due = page.getByTestId('club-maintenance-due')
    const planned = page.getByTestId('club-maintenance-planned')
    const done = page.getByTestId('club-maintenance-done')
    await expect(due.getByTestId(`club-maintenance-task-${inspectionId}`)).toBeVisible()
    await expect(planned.getByTestId(`club-maintenance-task-${brushingId}`)).toBeVisible()
    await expect(page.getByTestId(`club-maintenance-task-${hallTaskId}`)).toHaveCount(0)
    await expect(page.locator('[data-testid^="club-maintenance-task-"]')).toHaveCount(2)
    await expect(page.getByTestId('club-maintenance-empty')).toHaveCount(0)
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // Friday's day of the pitch, redacted: the session is "taken by the club", without its name.
    await page.goto(`/club/places/${pitch}?date=${friday}`)
    const entries = page.getByTestId('facilities-day-entries')
    await expect(entries).toContainText(uiText('facilities.places.redacted.club'))
    await expect(page.locator('body')).not.toContainText('Sparing Żaków')
    await page.getByTestId('club-place-plan-maintenance').click()
    const dialog = page.getByTestId('club-place-maintenance-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('club-place-maintenance-dialog-kind').click()
    await page.getByRole('option', { name: uiText('facilities.maintenance.kinds.brushing', { exact: true }) }).click()
    await dialog.getByTestId('club-place-maintenance-dialog-start').fill(`${friday}T08:00`)
    await dialog.getByTestId('club-place-maintenance-dialog-end').fill(`${friday}T10:00`)
    await dialog.getByTestId('club-place-maintenance-dialog-save').click()
    await expect(dialog).toBeHidden()
    await expect(
      page
        .getByText(uiText('facilities.maintenance.flash.flagged', { params: { sessions: 1, rentals: 0, bookings: 0 } }))
        .first(),
    ).toBeVisible()
    await expect(page.locator('[data-testid^="facilities-axis-entry-"][data-kind="maintenance"]')).toHaveCount(1)
    const fridayView = await staffCalendar(
      request,
      admin,
      `placeId=${pitch}&from=${zoneInstant(friday, '00:00')}&to=${zoneInstant(addDays(friday, 1), '00:00')}`,
    )
    expect(fridayView.status, JSON.stringify(fridayView.body)).toBe(200)
    const sessions = (fridayView.body?.entries ?? []).filter((entry) => entry.kind === 'session')
    expect(sessions.map((entry) => entry.needsReschedule)).toEqual([true])

    // Back on the list: the window is a planned task of the pitch; the inspection is marked done.
    await page.goto(CLUB_MAINTENANCE)
    await expect(page.locator('[data-testid^="club-maintenance-task-"]')).toHaveCount(3)
    await page.getByTestId(`club-maintenance-complete-${inspectionId}`).click()
    const complete = page.getByTestId('facilities-maintenance-complete-dialog')
    await expect(complete).toBeVisible()
    await complete.getByTestId('facilities-maintenance-complete-save').click()
    await expect(complete).toBeHidden()
    await expect(page.getByText(uiText('facilities.maintenance.flash.doneNext')).first()).toBeVisible()
    await expect(done.getByTestId(`club-maintenance-task-${inspectionId}`)).toBeVisible()
    const next = (await listMaintenance(request, fresh, '&status=planned')).find(
      (task) => task.seriesId === inspectionId && task.id !== inspectionId,
    )
    expect(next?.dueDate).toBe(`${String(Number(dueDate.slice(0, 4)) + 1)}${dueDate.slice(4)}`)
    await expect(planned.getByTestId(`club-maintenance-task-${String(next?.id)}`)).toBeVisible()

    // A done task is final: completing it again is 409 (the complete route's `invalid_transition`; a change of the
    // task is 409 `maintenance_task_closed`), and the done card offers neither "Done" nor "Plan".
    const doneRow = (await listMaintenance(request, fresh, '&status=done')).find((task) => task.id === inspectionId)
    const again = await completeMaintenance(request, fresh, inspectionId, doneRow?.updatedAt)
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body?.code).toBe('invalid_transition')
    const changed = await putMaintenance(request, fresh, { id: inspectionId, notes: 'Jeszcze raz' }, doneRow?.updatedAt)
    expect(changed.status, JSON.stringify(changed.body)).toBe(409)
    expect(changed.body?.code).toBe('maintenance_task_closed')
    await expect(page.getByTestId(`club-maintenance-complete-${inspectionId}`)).toHaveCount(0)
    await expect(page.getByTestId(`club-maintenance-plan-${inspectionId}`)).toHaveCount(0)

    // The hall he does not maintain: 403 from the API and a permission-denied state on its day.
    const hallView = await staffCalendar(
      request,
      fresh,
      `placeId=${hall}&from=${zoneInstant(friday, '00:00')}&to=${zoneInstant(addDays(friday, 1), '00:00')}`,
    )
    expect(hallView.status, JSON.stringify(hallView.body)).toBe(403)
    await page.goto(`/club/places/${hall}`)
    await expect(page.getByTestId('club-place-denied')).toBeVisible()

    // Light and dark, Polish then English, at 375 px.
    const ready = async () => {
      await expect(page.getByTestId('club-maintenance-due')).toBeVisible()
    }
    await page.goto(CLUB_MAINTENANCE)
    expect(await scanInColorSchemes(page, testInfo, '/club/places/maintenance (pl)', ready)).toEqual({})
    const now = await getMe(request, fresh)
    const english = await putMe(request, fresh, { preferredLocale: 'en' }, now.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)
    await page.goto(CLUB_MAINTENANCE)
    await expect(page.getByTestId('club-maintenance-due')).toContainText(
      uiText('facilities.places.maintenance.groups.due'),
    )
    expect(await scanInColorSchemes(page, testInfo, '/club/places/maintenance (en)', ready)).toEqual({})
    await expectNoPageOverflow(page)
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
