import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, readNotifications, zoneInstant } from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import {
  phoneRental,
  postInternalBooking,
  postRental,
  rentalAction,
  rentalPitch,
  runRentalLifecycle,
} from '../_fixtures/facilities'
import {
  completeMaintenance,
  listMaintenance,
  postMaintenance,
  runMaintenanceReminders,
} from '../_fixtures/maintenance'

// Issue #128 (E08-S08), facilities spec REQ-022, DD-36, DD-46, TEST-031: a yearly inspection by date and a brushing
// task every 10 hours of use on the pitch. The daily reminder job, driven through the CLI with `--now`, reminds 14
// days and 1 day before the due date and once the done rental (6 h) and the ended internal booking (4 h) reach the
// 10-hour threshold — each reminder once (the dispatch key), in-app to the club administrator. Completing the
// inspection creates next year's instance; completing the brushing task starts a new instance counting from the
// completion, so the counter is reset.
test.describe.configure({ timeout: 300_000 })

test('TEST-031 reminders by date and by hours of use; completion continues the series', async ({ request }) => {
  const club = await createClub(request, 'test-031-reminders')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const saturday = nextWeekday(addDays(calendarDate(), 7), 'SA')
    const dueDate = addDays(saturday, 31)

    const inspection = await postMaintenance(request, admin, {
      placeId: setup.pitch,
      kind: 'inspection',
      responsible: 'owner',
      scheduleType: 'date_recurring',
      dueDate,
      recurrenceRule: 'FREQ=YEARLY',
    })
    expect(inspection.status, JSON.stringify(inspection.body)).toBe(201)
    const brushing = await postMaintenance(request, admin, {
      placeId: setup.pitch,
      kind: 'brushing',
      scheduleType: 'usage_hours',
      usageHoursThreshold: 10,
    })
    expect(brushing.status, JSON.stringify(brushing.body)).toBe(201)
    const invalid = await postMaintenance(request, admin, {
      placeId: setup.pitch,
      kind: 'brushing',
      scheduleType: 'usage_hours',
      usageHoursThreshold: 0,
    })
    expect(invalid.status, JSON.stringify(invalid.body)).toBe(422)
    expect(invalid.body?.code).toBe('maintenance_usage_threshold_invalid')

    // Saturday: a 6-hour rental (4 units, confirmed, then done) and a 4-hour internal booking — 10 hours of use.
    const rental = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(saturday, '09:00'), 4),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)
    const confirmed = await rentalAction(request, admin, String(rental.body?.id), 'confirm')
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
    const booking = await postInternalBooking(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(saturday, '15:00'),
      endsAt: zoneInstant(saturday, '19:00'),
      sectionId: setup.academy,
      purpose: 'Obóz bramkarzy',
    })
    expect(booking.status, JSON.stringify(booking.body)).toBe(201)

    // Before Saturday: nothing is due and nothing was used.
    expect(runMaintenanceReminders(club, zoneInstant(saturday, '06:00'))).toMatchObject({ sent: 0, failed: 0 })

    // Sunday: the rental is done and the booking has ended — 10 hours: the usage reminder, once.
    const sunday = zoneInstant(addDays(saturday, 1), '12:00')
    expect(runRentalLifecycle(club, sunday).changedIds).toContain(String(rental.body?.id))
    const listed = await listMaintenance(request, admin, `&placeId=${setup.pitch}&status=planned`)
    expect(listed.find((task) => task.id === brushing.body?.id)?.scheduleType).toBe('usage_hours')
    expect(runMaintenanceReminders(club, sunday)).toMatchObject({ sent: 1, skipped: 0, failed: 0 })
    expect(runMaintenanceReminders(club, sunday)).toMatchObject({ sent: 0, skipped: 1, failed: 0 })

    // 14 days before the due date, then 1 day before: one reminder each (the usage one is not repeated).
    expect(runMaintenanceReminders(club, zoneInstant(addDays(dueDate, -10), '06:00'))).toMatchObject({
      sent: 1,
      skipped: 1,
    })
    expect(runMaintenanceReminders(club, zoneInstant(addDays(dueDate, -1), '06:00'))).toMatchObject({
      sent: 1,
      skipped: 1,
    })
    await expect
      .poll(
        async () =>
          (await readNotifications(request, admin)).filter(
            (item) => item.type === 'facilities.maintenance_due' && item.sourceEntityId === inspection.body?.id,
          ).length,
        { timeout: 60_000 },
      )
      .toBeGreaterThanOrEqual(1)
    await expect
      .poll(
        async () =>
          (await readNotifications(request, admin)).some(
            (item) => item.type === 'facilities.maintenance_due' && item.sourceEntityId === brushing.body?.id,
          ),
        { timeout: 60_000 },
      )
      .toBe(true)

    // Completing the inspection creates next year's instance in the same series.
    const tasks = await listMaintenance(request, admin, `&placeId=${setup.pitch}`)
    const inspectionRow = tasks.find((task) => task.id === inspection.body?.id)
    const inspectionDone = await completeMaintenance(
      request,
      admin,
      String(inspection.body?.id),
      inspectionRow?.updatedAt,
    )
    expect(inspectionDone.status, JSON.stringify(inspectionDone.body)).toBe(200)
    const nextInspection = (await listMaintenance(request, admin, `&placeId=${setup.pitch}&status=planned`)).find(
      (task) => task.id === inspectionDone.body?.nextTaskId,
    )
    expect(nextInspection).toMatchObject({
      kind: 'inspection',
      dueDate: `${String(Number(dueDate.slice(0, 4)) + 1)}${dueDate.slice(4)}`,
      seriesId: inspection.body?.id,
    })

    // Completing the brushing resets the counter: the next instance counts from the completion, so no reminder.
    const doneAt = zoneInstant(addDays(saturday, 2), '08:00')
    const brushingRow = tasks.find((task) => task.id === brushing.body?.id)
    const brushingDone = await completeMaintenance(request, admin, String(brushing.body?.id), brushingRow?.updatedAt, {
      doneAt,
    })
    expect(brushingDone.status, JSON.stringify(brushingDone.body)).toBe(200)
    const nextBrushing = (await listMaintenance(request, admin, `&placeId=${setup.pitch}&status=planned`)).find(
      (task) => task.id === brushingDone.body?.nextTaskId,
    )
    expect(nextBrushing?.usageCountedFrom).toBe(new Date(doneAt).toISOString())
    expect(runMaintenanceReminders(club, zoneInstant(addDays(saturday, 3), '06:00'))).toMatchObject({
      sent: 0,
      failed: 0,
    })

    // A done task is final: completing it again is 409.
    const again = await completeMaintenance(request, admin, String(inspection.body?.id), inspectionRow?.updatedAt)
    expect(again.status, JSON.stringify(again.body)).toBe(409)
  } finally {
    await club.cleanup()
  }
})
