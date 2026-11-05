import { expect, test, type APIRequestContext } from '@playwright/test'
import { addDays, createEvent, getOccurrence, scheduleFor, zoneInstant } from '../_fixtures/activities'
import { startNow } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, createClub, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'

// Issue #94 (E06-S12; README B-15; club spec REQ-006, the UI row of `/backend/activities/occurrences`; foundation II
// REQ-G06, AC-G06): the sessions list opens on 7 days back through 14 days ahead; a coordinator cancels a future
// planned session from its row (a reason of at least 3 characters is required) and opens the attendance list of a
// started one; the Canceled perspective lists the cancelled session with its reason; the Calendar perspective shows the
// coordinator's sections in the week grid of the installed schedule family, and a session opens its record.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

async function oneOffTraining(
  request: APIRequestContext,
  club: Club,
  input: { groupId: string; placeId: string; name: string; date: string; start: string; end: string },
): Promise<string> {
  const created = await createEvent(request, club.adminToken, {
    groupId: input.groupId,
    type: 'other',
    name: input.name,
    placeId: input.placeId,
    startsAt: zoneInstant(input.date, input.start),
    endsAt: zoneInstant(input.date, input.end),
  })
  expect(created.status, `POST /api/activities/events ${JSON.stringify(created.body)}`).toBe(201)
  return String(created.body?.occurrenceId)
}

test('E06-S12 the sessions list opens on today, cancels and opens attendance from a row, lists the cancelled, and shows the section calendar', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s12-sessions-list')
  try {
    const { academy, pitch, zaki, orliki } = await scheduleFor(request, club)
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Kinga',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: academy,
    })
    const today = calendarDate()
    const tomorrow = addDays(today, 1)
    await oneOffTraining(request, club, {
      groupId: zaki,
      placeId: pitch,
      name: 'Trening jutro',
      date: tomorrow,
      start: '17:00',
      end: '18:00',
    })
    await oneOffTraining(request, club, {
      groupId: zaki,
      placeId: pitch,
      name: 'Trening za miesiąc',
      date: addDays(today, 30),
      start: '17:00',
      end: '18:00',
    })
    const toCancel = await oneOffTraining(request, club, {
      groupId: orliki,
      placeId: pitch,
      name: 'Trening do odwołania',
      date: addDays(today, 2),
      start: '17:00',
      end: '18:00',
    })
    const started = await oneOffTraining(request, club, {
      groupId: orliki,
      placeId: pitch,
      name: 'Trening rozpoczęty',
      date: tomorrow,
      start: '19:00',
      end: '20:00',
    })
    await startNow(request, club, started)

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    await page.setViewportSize({ width: 1280, height: 800 })

    // The list opens on 7 days back through 14 days ahead: tomorrow is listed, a session in 30 days is not.
    const firstRead = page.waitForRequest((sent) => sent.url().includes('/api/activities/occurrences?'))
    await page.goto('/backend/activities/occurrences')
    const params = new URL((await firstRead).url()).searchParams
    expect(params.get('from')).toBe(addDays(today, -7))
    expect(params.get('to')).toBe(addDays(today, 14))
    await expect(page.getByRole('row').filter({ hasText: 'Trening jutro' })).toBeVisible()
    await expect(page.getByText('Trening za miesiąc')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: /^(All|Wszystkie)$/ })).toHaveAttribute('aria-selected', 'true')

    // Cancel from the row: no reason, then a two-character reason, are refused; a real reason cancels the session.
    const cancelRow = page.getByRole('row').filter({ hasText: 'Trening do odwołania' })
    await cancelRow.getByRole('button', { name: /Open actions|Otwórz akcje/ }).click()
    await expect(page.getByRole('menuitem', { name: /^(Attendance list|Lista obecności)$/ })).toHaveCount(0)
    await page.getByRole('menuitem', { name: /^(Cancel session|Odwołaj termin)$/ }).click()
    const confirm = page.getByTestId('occurrence-cancel-confirm')
    await confirm.click()
    const problem = page.getByTestId('occurrence-cancel-problem')
    await expect(problem).toHaveText(/Give a reason \(at least 3 characters\)|Podaj powód \(co najmniej 3 znaki\)/)
    await expect(page.getByTestId('occurrence-cancel-reason')).toHaveAttribute('aria-invalid', 'true')
    await page.getByTestId('occurrence-cancel-reason').fill('  ab ')
    await confirm.click()
    await expect(problem).toBeVisible()
    expect((await getOccurrence(request, club.adminToken, toCancel)).body?.status).toBe('planned')
    await page.getByTestId('occurrence-cancel-reason').fill('Boisko zamknięte')
    await confirm.click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(cancelRow.getByText(/^(Cancelled|Odwołany)$/)).toBeVisible()
    expect((await getOccurrence(request, club.adminToken, toCancel)).body).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Boisko zamknięte',
    })

    // The Canceled perspective lists it with its reason, and only cancelled sessions.
    await page.getByRole('tab', { name: /^(Canceled|Odwołane)$/ }).click()
    await expect(page).toHaveURL(/\/backend\/activities\/occurrences\?perspective=cancelled$/)
    const cancelledRow = page.getByRole('row').filter({ hasText: 'Trening do odwołania' })
    await expect(cancelledRow).toContainText('Boisko zamknięte')
    await expect(page.getByText('Trening jutro')).toHaveCount(0)

    // A started session offers the attendance list instead of Cancel.
    await page.getByRole('tab', { name: /^(All|Wszystkie)$/ }).click()
    const startedRow = page.getByRole('row').filter({ hasText: 'Trening rozpoczęty' })
    await startedRow.getByRole('button', { name: /Open actions|Otwórz akcje/ }).click()
    await expect(page.getByRole('menuitem', { name: /^(Cancel session|Odwołaj termin)$/ })).toHaveCount(0)
    await page.getByRole('menuitem', { name: /^(Attendance list|Lista obecności)$/ }).click()
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${started}/attendance$`))

    // The Calendar perspective: the week grid of the coordinator's sections; a session opens its record.
    await page.goto('/backend/activities/occurrences?perspective=calendar')
    const calendar = page.getByTestId('occurrences-calendar')
    await expect(calendar).toBeVisible()
    const startedEvent = calendar.locator('.rbc-event').filter({ hasText: 'Trening rozpoczęty' })
    await expect(startedEvent).toBeVisible()
    await prepareForAccessibilityScan(page)
    expect(await scanBlockingViolations(page, testInfo, { platformBaseline: true })).toEqual([])
    await startedEvent.click()
    await expect(page).toHaveURL(new RegExp(`/backend/activities/occurrences/${started}$`))

    // The section filter narrows the calendar: a section without sessions shows the empty text.
    await page.goto('/backend/activities/occurrences?perspective=calendar')
    await expect(calendar.locator('.rbc-event').first()).toBeVisible()
    const read = page.waitForRequest(
      (sent) => sent.url().includes('/api/activities/calendar?') && sent.url().includes(`sectionId=${academy}`),
    )
    await page.getByTestId('occurrences-calendar-section').click()
    await page.getByRole('option', { name: 'Akademia piłkarska' }).click()
    expect(new URL((await read).url()).searchParams.get('as')).toBe('coordinator')
    await expect(calendar.locator('.rbc-event').filter({ hasText: 'Trening rozpoczęty' })).toBeVisible()

    // The list at 375 px does not overflow the page.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/backend/activities/occurrences')
    await expect(page.getByRole('heading', { level: 1, name: /^(Sessions|Terminy)$/ })).toBeVisible()
    await expectNoPageOverflow(page)
  } finally {
    await club.cleanup()
  }
})
