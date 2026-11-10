import { expect, test, type APIRequestContext } from '@playwright/test'
import { addDays, createActivity, juneThirtiethNextYear, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow } from '../_fixtures/axe'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import {
  type CodedError,
  phoneRental,
  postInternalBooking,
  postRental,
  rentalAction,
  rentalPitch,
} from '../_fixtures/facilities'
import { completeMaintenance, listMaintenance, postMaintenance } from '../_fixtures/maintenance'

// Issue #127 (E08-S07), facilities spec REQ-015, TEST-025, AC-015; README B-28, flow F-12: the municipality report of
// Boisko A for a period of 15 days around today (incidents can only be past, rentals only future). Every figure is
// checked against a count made here from the test data: the scheduled zone hours (club training Mon–Fri 16:00–19:30,
// bookable Mon–Fri 08:00–16:00 and 19:30–22:00, Sat–Sun 09:00–20:30, all from today), the club time (the Tuesday
// training sessions and a 2-hour internal booking, by zone), two billable rentals (a confirmed one and a requested
// one; a free cancellation and a rental after the period do not count), the payments from the rental register (only
// the confirmed rental — `payments` reports no rental charges, DD-19), one incident and one maintenance task done with
// its cost. A period of a year answers 422, an inverted one 422, a caller without `facilities.reports.view` 403. The
// CSV has the same figures. A period with nothing in it reports zeros. The page shows the KPIs at 375 px.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type Report = CodedError & {
  place: { id: string; name: string }
  from: string
  to: string
  currency: string
  zoneHours: Record<string, number>
  clubTime: { total: number; sessions: number; bookings: number; byZone: Record<string, number> }
  rentals: { count: number; value: number; items: Array<{ id: string; amount: number; status: string }> }
  payments: { amount: number; count: number; source: string }
  incidents: { count: number }
  maintenance: { done: number; cost: number }
}

function readReport(request: APIRequestContext, token: string, query: string) {
  return call<Report>(request, 'GET', `/api/facilities/reports/owner?${query}`, token)
}

function weekdayOf(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

test('TEST-025 owner report: every figure matches the test data, CSV the same, 422 over a year', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-025-owner-report')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()
    const from = addDays(today, -1)
    const to = addDays(today, 13)
    const query = `placeId=${setup.pitch}&from=${from}&to=${to}`

    // Club time: training on Tuesdays 17:00–18:30 from today, and a 2-hour internal booking in the bookable zone.
    await createActivity(request, setup.coordinator, {
      groupId: setup.orliki,
      name: 'Trening Orlików',
      type: 'training',
      placeId: setup.pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    })
    const wednesday = nextWeekday(addDays(today, 1), 'WE')
    const booking = await postInternalBooking(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(wednesday, '10:00'),
      endsAt: zoneInstant(wednesday, '12:00'),
      sectionId: setup.academy,
      purpose: 'Obóz bramkarzy',
    })
    expect(booking.status, JSON.stringify(booking.body)).toBe(201)

    // Rentals (external rate 250 zł per 90 min): confirmed 2 units, requested 1 unit, one cancelled free of charge,
    // one after the period.
    const thursday = nextWeekday(addDays(today, 1), 'TH')
    const confirmed = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(thursday, '08:00'), 2),
    )
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(201)
    const confirmAction = await rentalAction(request, admin, String(confirmed.body?.id), 'confirm')
    expect(confirmAction.status, JSON.stringify(confirmAction.body)).toBe(200)
    const saturday = nextWeekday(addDays(today, 1), 'SA')
    const requested = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(saturday, '10:00')),
    )
    expect(requested.status, JSON.stringify(requested.body)).toBe(201)
    const friday = nextWeekday(addDays(today, 2), 'FR')
    const cancelled = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(friday, '10:00')),
    )
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(201)
    const cancelAction = await rentalAction(request, admin, String(cancelled.body?.id), 'cancel', {
      reason: 'Drużyna zrezygnowała',
    })
    expect(cancelAction.status, JSON.stringify(cancelAction.body)).toBe(200)
    const later = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(nextWeekday(addDays(today, 15), 'TH'), '08:00')),
    )
    expect(later.status, JSON.stringify(later.body)).toBe(201)

    // An incident ten minutes ago and a maintenance task done with its cost.
    const incident = await call<CodedError & { id?: string }>(request, 'POST', '/api/facilities/incidents', admin, {
      data: {
        placeId: setup.pitch,
        occurredAt: new Date(Date.now() - 600_000).toISOString(),
        kind: 'damage',
        description: 'Zawodnik wyrwał siatkę z bramki po końcowym gwizdku.',
        actionTaken: ['owner_notified'],
      },
    })
    expect(incident.status, JSON.stringify(incident.body)).toBe(201)
    const task = await postMaintenance(request, admin, {
      placeId: setup.pitch,
      kind: 'line_marking',
      scheduleType: 'one_off',
      dueDate: today,
    })
    expect(task.status, JSON.stringify(task.body)).toBe(201)
    const taskRow = (await listMaintenance(request, admin, `&placeId=${setup.pitch}`)).find(
      (row) => row.id === task.body?.id,
    )
    const done = await completeMaintenance(request, admin, String(task.body?.id), taskRow?.updatedAt, { cost: 12_050 })
    expect(done.status, JSON.stringify(done.body)).toBe(200)

    // The count by hand: the rules apply from today; Tuesdays from today carry a 1.5-hour session.
    const dates = Array.from({ length: 15 }, (_, index) => addDays(from, index)).filter((date) => date >= today)
    const weekdays = dates.filter((date) => weekdayOf(date) <= 5).length
    const weekends = dates.length - weekdays
    const tuesdays = dates.filter((date) => weekdayOf(date) === 2).length
    const expected = {
      zoneHours: {
        public_free: 0,
        club_training: weekdays * 3.5,
        reservable_paid: weekdays * 10.5 + weekends * 11.5,
        closed: 0,
      },
      clubTime: {
        total: tuesdays * 1.5 + 2,
        sessions: tuesdays * 1.5,
        bookings: 2,
        byZone: { public_free: 0, club_training: tuesdays * 1.5, reservable_paid: 2, closed: 0, none: 0 },
      },
    }

    const report = await readReport(request, admin, query)
    expect(report.status, JSON.stringify(report.body)).toBe(200)
    expect(report.body).toMatchObject({
      place: { id: setup.pitch, name: 'Boisko A' },
      from,
      to,
      ...expected,
      rentals: { count: 2, value: 75_000 },
      payments: { amount: 50_000, count: 1, source: 'rental_register' },
      incidents: { count: 1 },
      maintenance: { done: 1, cost: 12_050 },
    })
    expect(report.body?.rentals.items.map((item) => [item.id, item.amount, item.status]).sort()).toEqual(
      [
        [String(confirmed.body?.id), 50_000, 'confirmed'],
        [String(requested.body?.id), 25_000, 'requested'],
      ].sort(),
    )

    // The CSV has the same figures as the screen.
    const csvResponse = await request.get(`/api/facilities/reports/owner?${query}&format=csv`, {
      headers: { authorization: `Bearer ${admin}` },
    })
    expect(csvResponse.status()).toBe(200)
    expect(csvResponse.headers()['content-type']).toContain('text/csv')
    const lines = (await csvResponse.text()).split('\r\n')
    const summary = new Map(
      lines
        .filter((line) => line.split(',').length === 3)
        .map((line) => {
          const [section, item, value] = line.split(',')
          return [`${section}.${item}`, value]
        }),
    )
    for (const [zone, hours] of Object.entries(expected.zoneHours)) {
      expect(summary.get(`zone_hours.${zone}`)).toBe(hours.toFixed(2))
    }
    expect(summary.get('club_time.total')).toBe(expected.clubTime.total.toFixed(2))
    expect(summary.get('club_time_by_zone.club_training')).toBe(expected.clubTime.sessions.toFixed(2))
    expect(summary.get('rentals.count')).toBe('2')
    expect(summary.get('rentals.value')).toBe('750.00')
    expect(summary.get('payments.amount')).toBe('500.00')
    expect(summary.get('payments.source')).toBe('rental_register')
    expect(summary.get('incidents.count')).toBe('1')
    expect(summary.get('maintenance.done')).toBe('1')
    expect(summary.get('maintenance.cost')).toBe('120.50')
    const rentalLines = lines.slice(lines.indexOf('date,from,to,renter,units,amount,status') + 1).filter(Boolean)
    expect(rentalLines).toHaveLength(2)
    expect(rentalLines.some((line) => line.endsWith(',2,500.00,confirmed'))).toBe(true)

    // A period with nothing in it reports zeros (the screen's "No data for this period").
    const quiet = await readReport(
      request,
      admin,
      `placeId=${setup.pitch}&from=${addDays(today, 200)}&to=${addDays(today, 229)}`,
    )
    expect(quiet.status, JSON.stringify(quiet.body)).toBe(200)
    expect(quiet.body).toMatchObject({
      clubTime: { total: 0 },
      rentals: { count: 0, value: 0, items: [] },
      payments: { amount: 0, count: 0 },
      incidents: { count: 0 },
      maintenance: { done: 0 },
    })

    // Negative cases: a year or more, an inverted period, a bad query, an unknown place, a caller without the feature.
    const year = await readReport(request, admin, `placeId=${setup.pitch}&from=${today}&to=${addDays(today, 366)}`)
    expect(year.status, JSON.stringify(year.body)).toBe(422)
    expect(year.body?.code).toBe('report_period_too_long')
    const inverted = await readReport(request, admin, `placeId=${setup.pitch}&from=${to}&to=${from}`)
    expect(inverted.status, JSON.stringify(inverted.body)).toBe(422)
    expect(inverted.body?.code).toBe('report_period_order')
    const malformed = await readReport(request, admin, `placeId=${setup.pitch}&from=2026-13-01&to=${to}`)
    expect(malformed.status).toBe(400)
    const unknown = await readReport(
      request,
      admin,
      `placeId=00000000-0000-4000-8000-000000000000&from=${from}&to=${to}`,
    )
    expect(unknown.status).toBe(404)
    const coordinator = await readReport(request, setup.coordinator, query)
    expect(coordinator.status).toBe(403)

    // The page: the facility's current month with the KPIs and the CSV link, at 375 px, without console errors.
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/backend/facilities/reports/owner')
    await expect(page.getByTestId('owner-report-kpis')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('owner-report-zone-club_training-value')).toBeVisible()
    await expect(page.getByTestId('owner-report-export')).toHaveAttribute(
      'href',
      new RegExp(`placeId=${setup.pitch}.*format=csv`),
    )
    await expectNoPageOverflow(page)
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
