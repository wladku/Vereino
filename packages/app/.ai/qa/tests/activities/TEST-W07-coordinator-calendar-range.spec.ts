import { expect, test } from '@playwright/test'
import { addDays, createActivity, mondayOf } from '../_fixtures/activities'
import { prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor, sessionsOf } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { uiText } from '../_fixtures/ui-text'

// TEST-W07 (calendar range switch spec REQ-W07, DD-W02, A-W02, A-W03, AC-W01, AC-W06; #784): the coordinator calendar
// B-15 has the shared switch "Day · Week · Month · Agenda" above the installed grid, which no longer shows its own
// toolbar. The view, its day and the section filter live in the address, so a reload and a copied link reopen the same
// week, view and section; Agenda lists the next 14 days without arrows. Axe on the week grid.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const TRAINING = 'Trening W07'

test('TEST-W07 B-15 view, day and section in the address; Agenda; no installed toolbar', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-w07-coordinator-range')
  try {
    const family = await familyFor(request, club)
    const today = calendarDate()
    const tuesday = addDays(addDays(mondayOf(today), 7), 1)
    const { id } = await createActivity(request, club.adminToken, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: TRAINING,
      type: 'training',
      startsOn: tuesday,
      startTime: '17:00',
      endTime: '18:00',
      coachPersonId: family.coach.personId,
    })
    expect((await sessionsOf(request, club, id)).map((session) => session.occurrenceDate)).toEqual([tuesday])

    const login = await page.request.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password },
    })
    expect(login.ok()).toBe(true)
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    const calendar = page.getByTestId('occurrences-calendar')
    const range = page.getByTestId('occurrences-calendar-range')
    const event = calendar.locator('.rbc-event').filter({ hasText: TRAINING })

    // A desktop opens on Week; the switch replaces the installed toolbar.
    await page.goto('/backend/activities/occurrences?perspective=calendar')
    await expect(range).toHaveAttribute('data-range', 'week')
    await expect(page.getByTestId('occurrences-calendar-range-view-agenda')).toHaveText(
      uiText('activities.occurrences.calendar.agenda'),
    )
    await expect(calendar.getByRole('button', { name: uiText('schedule.range.next', { exact: true }) })).toHaveCount(0)
    // Next week holds the training; the address names the view and the day.
    await page.getByTestId('occurrences-calendar-range-next').click()
    await expect(page).toHaveURL(/range=week&date=/)
    await expect(event).toBeVisible()
    // The grid's week starts on Monday in every language, like the heading (DD-W04).
    await expect(calendar.locator('.rbc-time-header .rbc-header time').first()).toHaveAttribute(
      'datetime',
      addDays(tuesday, -1),
    )
    expect(await scanBlockingViolations(page, testInfo, { platformBaseline: true })).toEqual([])

    // The section filter joins the address; a reload keeps the week, the view and the section.
    await page.getByTestId('occurrences-calendar-section').click()
    await page.getByRole('option', { name: 'Akademia piłkarska' }).click()
    await expect(page).toHaveURL(new RegExp(`section=${family.academy}`))
    const shared = page.url()
    await page.reload()
    await expect(range).toHaveAttribute('data-range', 'week')
    await expect(event).toBeVisible()
    await expect(page.getByTestId('occurrences-calendar-section')).toContainText('Akademia piłkarska')

    // A copied link of the day opens Day with the training.
    await page.goto(`/backend/activities/occurrences?perspective=calendar&range=day&date=${tuesday}`)
    await expect(range).toHaveAttribute('data-range', 'day')
    await expect(event).toBeVisible()

    // Month and Agenda; Agenda has no arrows.
    await page.getByTestId('occurrences-calendar-range-view-month').click()
    await expect(range).toHaveAttribute('data-range', 'month')
    await page.getByTestId('occurrences-calendar-range-view-agenda').click()
    await expect(range).toHaveAttribute('data-range', 'agenda')
    await expect(page.getByTestId('occurrences-calendar-range-previous')).toHaveCount(0)
    await expect(calendar.locator('.rbc-agenda-view')).toBeVisible()

    // The shared link in a fresh page: the same week, view and section.
    await page.goto(shared)
    await expect(range).toHaveAttribute('data-range', 'week')
    await expect(event).toBeVisible()
  } finally {
    await club.cleanup()
  }
})
