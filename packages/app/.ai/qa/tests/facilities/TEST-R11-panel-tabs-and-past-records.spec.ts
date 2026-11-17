import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { addDays, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan } from '../_fixtures/axe'
import { calendarDate, call, createClub } from '../_fixtures/club'
import {
  type BookingCreated,
  type CodedError,
  postInternalBooking,
  rentalPitch,
  runRequestProbe,
} from '../_fixtures/facilities'
import { requestRow } from '../_fixtures/facility-requests'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// Issue #281 (E11-S07), facilities parity spec phase 7, TEST-R11 (REQ-R09, REQ-R10, AC-R07): the tabs of B-26 and B-27
// as the mockup's `screenZones` and `screenLogs`, and the records an administrator adds from the panel. The zones tab
// shows the mockup's columns, links the place to its calendar and saves "Set booking availability"; the administrator
// adds a log entry for last week from the Log tab while the attendant's same write answers 403 `log_edit_closed`;
// an incident reported from the panel is listed; "Issue ban" on an incident that asks for one saves a ban with the
// incident's id, and the incident leaves the "Ban request" filter and shows "ban issued". A club booking for yesterday
// by the administrator answers 201 and supersedes no held request (DD-R17), the coach's 422 `booking_start_past`, 100
// days back 422 `booking_too_old`; B-23 opens a past hour for the administrator with the general kind alone.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type IncidentItem = { id: string; description: string | null; banIssued: boolean }
type BanItem = { id: string; incidentId: string | null; subjectName: string | null }
type LogItem = { id: string; logDate: string; placeId: string }

async function items<T>(request: APIRequestContext, token: string, path: string): Promise<T[]> {
  const result = await call<{ items?: T[] }>(request, 'GET', path, token)
  expect(result.status, `GET ${path} ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}

async function choose(page: Page, trigger: Locator, name: string | RegExp): Promise<void> {
  await trigger.click()
  await page.getByRole('option', { name }).click()
}

test('TEST-R11 panel tabs: zones, a past log entry, an incident, a ban from its request and a past club booking', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-r11-panel-tabs')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const pitch = setup.pitch
    const today = calendarDate()
    const yesterday = addDays(today, -1)
    const lastWeek = addDays(today, -7)

    // DD-R17: the administrator records yesterday's club booking over a request still held; the request stays held.
    const held = String(
      runRequestProbe(club, {
        op: 'seed',
        placeId: pitch,
        startsAt: zoneInstant(yesterday, '11:00'),
        endsAt: zoneInstant(yesterday, '12:30'),
      }).id,
    )
    const pastBooking = {
      placeId: pitch,
      startsAt: zoneInstant(yesterday, '11:00'),
      endsAt: zoneInstant(yesterday, '12:30'),
      sectionId: setup.academy,
      purpose: 'Sparing wpisany po fakcie',
    }
    const past = await postInternalBooking(request, admin, pastBooking)
    expect(past.status, JSON.stringify(past.body)).toBe(201)
    expect((past.body as BookingCreated | null)?.supersededRequestIds ?? []).toEqual([])
    expect((await requestRow(held))?.status).toBe('pending_approval')
    // The occupancy check still runs for a past booking.
    const twice = await postInternalBooking(request, admin, pastBooking)
    expect(twice.status, JSON.stringify(twice.body)).toBe(409)
    expect(twice.body?.code).toBe('rental_conflict')
    // Negative: a coach's past booking, and the administrator's 100 days back.
    const coach = await signedInStaff(request, club, { firstName: 'Wojtek', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, {
      groupId: setup.zaki,
      personId: coach.personId,
      role: 'coach',
      validFrom: addDays(today, -30),
    })
    const coachPast = await postInternalBooking(request, coach.token, {
      ...pastBooking,
      startsAt: zoneInstant(yesterday, '14:00'),
      endsAt: zoneInstant(yesterday, '15:30'),
    })
    expect(coachPast.status, JSON.stringify(coachPast.body)).toBe(422)
    expect(coachPast.body?.code).toBe('booking_start_past')
    const tooOld = await postInternalBooking(request, admin, {
      ...pastBooking,
      startsAt: zoneInstant(addDays(today, -100), '10:00'),
      endsAt: zoneInstant(addDays(today, -100), '11:30'),
    })
    expect(tooOld.status, JSON.stringify(tooOld.body)).toBe(422)
    expect(tooOld.body?.code).toBe('booking_too_old')

    // Negative: the attendant's log entry for last week is past their edit window.
    const attendant = await signedInStaff(request, club, {
      firstName: 'Adam',
      lastName: 'Animator',
      role: 'facility_operator',
      placeId: pitch,
    })
    const attendantLog = await call<CodedError>(request, 'POST', '/api/facilities/logs', attendant.token, {
      data: { placeId: pitch, logDate: lastWeek, openedAt: zoneInstant(lastWeek, '16:00'), conditionBefore: 'Ok' },
    })
    expect(attendantLog.status, JSON.stringify(attendantLog.body)).toBe(403)
    expect(attendantLog.body?.code).toBe('log_edit_closed')

    // The attendant asks for an entry ban: the incident is in the "Ban request" filter, no ban issued yet.
    const requested = await call<{ id?: string }>(request, 'POST', '/api/facilities/incidents', attendant.token, {
      data: {
        placeId: pitch,
        occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
        kind: 'rules_violation',
        description: 'Drużyna gości zniszczyła siatkę i odmówiła opuszczenia boiska.',
        actionTaken: ['entry_ban_requested'],
      },
    })
    expect(requested.status, JSON.stringify(requested.body)).toBe(201)
    const requestedId = String(requested.body?.id)
    const open = await items<IncidentItem>(request, admin, '/api/facilities/incidents?banRequest=open')
    expect(open.map((item) => item.id)).toEqual([requestedId])
    expect(open[0]?.banIssued).toBe(false)

    // The panel, as the club administrator.
    page.setDefaultTimeout(30_000)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)
    const login = await page.request.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password },
    })
    expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
    await page.setViewportSize({ width: 1280, height: 900 })

    // B-26 Zones: the mockup's columns in its order, the place linking to its calendar, "Set booking availability".
    await page.goto('/backend/facilities/zones')
    await expect(page.getByRole('columnheader')).toContainText([
      uiText('facilities.fields.place'),
      uiText('facilities.zones.columns.weekdays'),
      uiText('facilities.zones.columns.times'),
      uiText('facilities.zones.columns.zone'),
      uiText('facilities.zones.columns.priority'),
      uiText('facilities.columns.validity'),
      uiText('facilities.zones.columns.source'),
    ])
    await expect(page.getByTestId('facilities-place-calendar-link').first()).toHaveAttribute(
      'href',
      `/backend/facilities/calendar?place=${pitch}`,
    )
    await choose(page, page.getByTestId('facilities-zones-place'), 'Boisko A')
    await page.getByTestId('facilities-zones-availability').click()
    const availability = page.getByTestId('facilities-availability-dialog')
    await expect(availability).toBeVisible()
    await availability.getByTestId('facilities-availability-workdays').click()
    await availability.getByTestId('facilities-availability-all-from').fill('08:00')
    await availability.getByTestId('facilities-availability-all-to').fill('16:00')
    await availability.getByTestId('facilities-availability-save').click()
    await expect(page.getByTestId('facilities-availability-result')).toBeVisible()
    await expect(availability).toBeHidden()

    // B-27 Log: "Add entry" for last week, after the attendant's window has closed.
    await page.goto('/backend/facilities/logs')
    await page.getByTestId('facilities-logs-create').click()
    const logDialog = page.getByTestId('facilities-log-create-dialog')
    await expect(logDialog).toBeVisible()
    await choose(page, logDialog.getByTestId('facilities-log-create-place'), 'Boisko A')
    await logDialog.getByTestId('facilities-log-create-date').fill(lastWeek)
    await logDialog.getByTestId('facilities-log-create-opened').fill('16:00')
    await logDialog.getByTestId('facilities-log-create-closed').fill('21:30')
    await logDialog.getByTestId('facilities-log-create-before').fill('Murawa sucha')
    await logDialog.getByTestId('facilities-log-create-after').fill('Bez zmian')
    await logDialog.getByTestId('facilities-log-create-save').click()
    await expect(logDialog).toBeHidden()
    await expect(page.getByTestId('facilities-logs-table')).toContainText(lastWeek)
    const logs = await items<LogItem>(request, admin, `/api/facilities/logs?placeId=${pitch}`)
    expect(logs).toEqual([expect.objectContaining({ logDate: lastWeek, placeId: pitch })])

    // B-27 Incidents: an incident reported from the panel is listed.
    await page.goto('/backend/facilities/incidents')
    await expect(page.getByTestId('facilities-incidents-table')).toBeVisible()
    await page.getByTestId('facilities-incidents-report').click()
    const report = page.getByTestId('club-facility-incident-dialog')
    await expect(report).toBeVisible()
    await choose(page, report.getByTestId('club-facility-incident-place'), 'Boisko A')
    await report.getByTestId('club-facility-incident-date').fill(yesterday)
    await choose(
      page,
      report.getByTestId('club-facility-incident-kind'),
      uiText('facilities.records.incidentKind.damage', { exact: true }),
    )
    await report.getByTestId('club-facility-incident-time').fill('18:00')
    const panelDescription = 'Wyrwana siatka bramki po treningu, zgłoszona z panelu.'
    await report.getByTestId('club-facility-incident-description').fill(panelDescription)
    await report.getByTestId('club-facility-incident-submit').click()
    await expect(report).toBeHidden()
    await expect(page.getByTestId('facilities-incidents-table')).toContainText(panelDescription)

    // "Issue ban" on the requested incident: the place, the incident and the reason are filled in.
    await page.waitForLoadState('networkidle')
    await page.getByTestId(`facilities-incident-actions-${requestedId}`).getByRole('button').click()
    await page
      .getByRole('menuitem', { name: uiText('facilities.records.incidents.actions.issueBan', { exact: true }) })
      .click()
    const banDialog = page.getByTestId('facilities-ban-dialog')
    await expect(banDialog).toBeVisible()
    await expect(banDialog.getByTestId('facilities-ban-place')).toContainText('Boisko A')
    await expect(banDialog.getByTestId('facilities-ban-reason')).toHaveValue(/zniszczyła siatkę/)
    await banDialog.getByPlaceholder(uiText('facilities.rentals.renter.search')).fill('Zak')
    await page.getByRole('option', { name: /FC Zakazani/ }).click()
    await banDialog.getByTestId('facilities-ban-save').click()
    await expect(banDialog).toBeHidden()
    const bans = await items<BanItem>(request, admin, '/api/facilities/entry-bans')
    expect(bans).toEqual([expect.objectContaining({ incidentId: requestedId, subjectName: 'FC Zakazani' })])
    expect(await items<IncidentItem>(request, admin, '/api/facilities/incidents?banRequest=open')).toEqual([])
    const all = await items<IncidentItem>(request, admin, '/api/facilities/incidents')
    expect(all.find((item) => item.id === requestedId)?.banIssued).toBe(true)
    expect(all.map((item) => item.description)).toContain(panelDescription)
    await expect(page.getByTestId('facilities-incidents-table')).toContainText(
      uiText('facilities.records.incidents.banIssued'),
    )
    await page.setViewportSize({ width: 375, height: 812 })
    await expectNoPageOverflow(page)

    // B-23: yesterday's free hour opens the slot dialog for the administrator with the general kind alone.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/backend/facilities/calendar?place=${pitch}&date=${yesterday}`)
    await page.getByTestId('facilities-axis-hour-14:00').click()
    const slot = page.getByTestId('facilities-slot-dialog')
    await expect(slot).toBeVisible()
    await expect(slot.getByTestId('facilities-slot-kind')).toContainText(
      uiText('facilities.slot.kind.general', { exact: true }),
    )
    await expect(slot.getByTestId('facilities-slot-kind')).toBeDisabled()
    await page.keyboard.press('Escape')

    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
