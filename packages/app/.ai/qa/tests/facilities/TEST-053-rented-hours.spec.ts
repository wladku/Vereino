import { expect, test, type APIRequestContext } from '@playwright/test'
import { createActivity, getOccurrence, moveOccurrence, zoneInstant } from '../_fixtures/activities'
import { familyFor, saveAttendanceList, sessionsOf } from '../_fixtures/attendance'
import { expectNoPageOverflow } from '../_fixtures/axe'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub, type Club } from '../_fixtures/club'
import { getOne, signInBrowser } from '../_fixtures/club-structure'
import type { CodedError } from '../_fixtures/facilities'

// Issue #129 (E08-S09), facilities spec REQ-038, TEST-053, AC-038: the hours the club uses on a place it rents from its
// owner. The municipal pool is flagged `rented_by_club`; the pitch is not. Last month the pool group holds 8 sessions of
// 90 minutes on the pool (Irena) — 12 hours —, Żaki hold one 60-minute session there (Marek), and a ninth pool session
// stays planned (not done, so not counted); the month before, one more 90-minute pool session. Żaki's done session on
// the pitch is absent (negative case). Totals per place and month, rows per group and coach; the CSV has the same
// figures. Before the flag there is no rented place; one rented place is chosen with `placeId`; 422 over a year; 403
// without `facilities.reports.view`. The page shows last month's hours at 375 px.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type Report = CodedError & {
  from: string
  to: string
  places: Array<{ id: string; name: string }>
  totals: Array<{ placeId: string; month: string; sessions: number; hours: number }>
  rows: Array<{
    placeId: string
    month: string
    groupName: string | null
    coachName: string | null
    sessions: number
    hours: number
  }>
}

function readReport(request: APIRequestContext, token: string, query: string) {
  return call<Report>(request, 'GET', `/api/facilities/reports/rented-hours?${query}`, token)
}

/** The first day of the month `offset` months from the month of `date`, and that month's `YYYY-MM`. */
function monthStart(date: string, offset: number): { first: string; month: string } {
  const [year, month] = date.split('-').map(Number)
  const first = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10)
  return { first, month: first.slice(0, 7) }
}

function dayOf(first: string, day: number): string {
  return `${first.slice(0, 8)}${String(day).padStart(2, '0')}`
}

/** Moves a session to `date` `from`–`to` (club zone) as the administrator; returns the new version. */
async function moveTo(request: APIRequestContext, club: Club, id: string, date: string, from: string, to: string) {
  const current = await getOccurrence(request, club.adminToken, id)
  expect(current.status).toBe(200)
  const moved = await moveOccurrence(
    request,
    club.adminToken,
    id,
    { startAt: zoneInstant(date, from), endAt: zoneInstant(date, to) },
    current.body?.updatedAt,
  )
  expect(moved.status, JSON.stringify(moved.body)).toBe(200)
  return String(moved.body?.updatedAt)
}

async function close(request: APIRequestContext, token: string, id: string, version: string) {
  const closed = await saveAttendanceList(request, token, id, { entries: [], complete: true }, version)
  expect(closed.status, JSON.stringify(closed.body)).toBe(200)
}

test('TEST-053 rented-hours report: done sessions on rented places per month, group and coach, CSV the same', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-053-rented-hours')
  try {
    const admin = club.adminToken
    const family = await familyFor(request, club)
    const today = calendarDate()
    const last = monthStart(today, -1)
    const before = monthStart(today, -2)
    const from = before.first
    const to = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 0))
      .toISOString()
      .slice(0, 10)
    const query = `from=${from}&to=${to}`

    // No place is rented yet: the report lists no places ("No places flagged as rented").
    const none = await readReport(request, admin, query)
    expect(none.status, JSON.stringify(none.body)).toBe(200)
    expect(none.body).toMatchObject({ places: [], totals: [], rows: [] })

    // The municipal pool is rented from the city.
    const poolNow = await getOne(request, admin, 'places', family.poolPlace)
    const flagged = await call(request, 'PUT', '/api/club_core/places', admin, {
      data: { id: family.poolPlace, rentedByClub: true },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(poolNow?.updatedAt) },
    })
    expect(flagged.status, JSON.stringify(flagged.body)).toBe(200)

    // The pool group's weekly sessions (16:00–17:30), moved into the past and closed by Irena.
    const series = await createActivity(request, admin, {
      groupId: family.poolGroup,
      name: 'Nauka pływania',
      type: 'training',
      placeId: family.poolPlace,
      coachPersonId: family.instructor.personId,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=MO;UNTIL=${String(Number(today.slice(0, 4)) + 1)}0630`,
      startsOn: today,
      startTime: '16:00',
      endTime: '17:30',
    })
    const poolSessions = (await sessionsOf(request, club, series.id)).slice(0, 10)
    expect(poolSessions).toHaveLength(10)
    const lastMonthDays = [2, 5, 8, 11, 14, 17, 20, 23]
    for (const [index, day] of lastMonthDays.entries()) {
      const id = poolSessions[index].id
      await close(
        request,
        family.instructor.token,
        id,
        await moveTo(request, club, id, dayOf(last.first, day), '16:00', '17:30'),
      )
    }
    const earlier = poolSessions[8].id
    await close(
      request,
      family.instructor.token,
      earlier,
      await moveTo(request, club, earlier, dayOf(before.first, 10), '16:00', '17:30'),
    )
    // Planned, not done: not counted.
    await moveTo(request, club, poolSessions[9].id, dayOf(last.first, 24), '16:00', '17:30')

    // Żaki: one hour on the pool (counted) and one on the pitch, which is not rented (absent).
    for (const [placeId, day] of [
      [family.poolPlace, 26],
      [family.pitch, 27],
    ] as const) {
      const activity = await createActivity(request, admin, {
        groupId: family.zaki,
        name: 'Trening Żaków',
        type: 'training',
        placeId,
        coachPersonId: family.coach.personId,
        startsOn: today,
        startTime: '20:00',
        endTime: '21:00',
      })
      const session = (await sessionsOf(request, club, activity.id))[0]
      await close(
        request,
        family.coach.token,
        session.id,
        await moveTo(request, club, session.id, dayOf(last.first, day), '16:00', '17:00'),
      )
    }

    const report = await readReport(request, admin, query)
    expect(report.status, JSON.stringify(report.body)).toBe(200)
    expect(report.body?.places).toEqual([{ id: family.poolPlace, name: 'Pływalnia miejska' }])
    expect(report.body?.totals).toEqual([
      { placeId: family.poolPlace, placeName: 'Pływalnia miejska', month: before.month, sessions: 1, hours: 1.5 },
      { placeId: family.poolPlace, placeName: 'Pływalnia miejska', month: last.month, sessions: 9, hours: 13 },
    ])
    expect(
      report.body?.rows.map((row) => [row.placeId, row.month, row.groupName, row.coachName, row.sessions, row.hours]),
    ).toEqual([
      [family.poolPlace, before.month, 'Basen — początkujący', 'Irena Instruktor', 1, 1.5],
      [family.poolPlace, last.month, 'Basen — początkujący', 'Irena Instruktor', 8, 12],
      [family.poolPlace, last.month, 'Żaki', 'Marek Trener', 1, 1],
    ])
    expect(report.body?.rows.some((row) => row.placeId === family.pitch)).toBe(false)

    // The CSV has the same figures as the screen.
    const csvResponse = await request.get(`/api/facilities/reports/rented-hours?${query}&format=csv`, {
      headers: { authorization: `Bearer ${admin}` },
    })
    expect(csvResponse.status()).toBe(200)
    expect(csvResponse.headers()['content-type']).toContain('text/csv')
    expect(await csvResponse.text()).toBe(
      [
        'place,month,sessions,hours',
        `Pływalnia miejska,${before.month},1,1.50`,
        `Pływalnia miejska,${last.month},9,13.00`,
        '',
        'place,month,group,coach,sessions,hours',
        `Pływalnia miejska,${before.month},Basen — początkujący,Irena Instruktor,1,1.50`,
        `Pływalnia miejska,${last.month},Basen — początkujący,Irena Instruktor,8,12.00`,
        `Pływalnia miejska,${last.month},Żaki,Marek Trener,1,1.00`,
        '',
      ].join('\r\n'),
    )

    // One place: the pool alone gives the same rows; the pitch, not rented, gives none.
    const pool = await readReport(request, admin, `${query}&placeId=${family.poolPlace}`)
    expect(pool.body?.rows).toHaveLength(3)
    const pitch = await readReport(request, admin, `${query}&placeId=${family.pitch}`)
    expect(pitch.status).toBe(200)
    expect(pitch.body).toMatchObject({ totals: [], rows: [] })

    // Negative cases: a year or more, an inverted period, a bad query, a caller without the feature.
    const year = await readReport(request, admin, `from=${from}&to=${monthStart(from, 12).first}`)
    expect(year.status, JSON.stringify(year.body)).toBe(422)
    expect(year.body?.code).toBe('report_period_too_long')
    const inverted = await readReport(request, admin, `from=${to}&to=${from}`)
    expect(inverted.status).toBe(422)
    expect(inverted.body?.code).toBe('report_period_order')
    const malformed = await readReport(request, admin, `from=2026-13-01&to=${to}`)
    expect(malformed.status).toBe(400)
    const coordinator = await readReport(request, family.poolCoordinator.token, query)
    expect(coordinator.status).toBe(403)

    // The page: last month (one step back) with the totals and the CSV link, at 375 px, without console errors.
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/backend/facilities/reports/rented-hours')
    await expect(page.getByTestId('rented-hours-report')).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: /Previous period|Poprzedni okres/ }).click()
    await expect(page.getByTestId('rented-hours-totals')).toContainText('Pływalnia miejska', { timeout: 30_000 })
    await expect(page.getByTestId('rented-hours-totals')).toContainText(/13\s?h/)
    await expect(page.getByTestId('rented-hours-rows')).toContainText('Marek Trener')
    await expect(page.getByTestId('rented-hours-export')).toHaveAttribute(
      'href',
      new RegExp(`from=${last.first}.*format=csv`),
    )
    await expectNoPageOverflow(page)
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
