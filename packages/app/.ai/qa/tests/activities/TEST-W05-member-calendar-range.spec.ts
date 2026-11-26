import { expect, test } from '@playwright/test'
import { addDays, createActivity, mondayOf } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor, sessionsOf } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { uiText } from '../_fixtures/ui-text'

// TEST-W05 (calendar range switch spec REQ-W06, DD-W02, DD-W03, DD-W08, AC-W01, AC-W05; #784): the member calendar
// M-03 offers Upcoming · Day · Week · Month on the shared switch. A guardian on a phone opens on Day; Day shows the
// day's cards, an empty day says so and offers "Next day"; Week and Month move by their unit; the view and the day
// live in the address, so a reload and a copied link reopen them; a link range `?from=&to=` still opens its dates
// (#493). On a desktop the calendar opens on Week. Axe at 375 px in light and dark; no sideways scrolling.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const TRAINING = 'Trening Żaków W05'

test('TEST-W05 M-03 Upcoming / Day / Week / Month: phone Day, desktop Week, address state, empty day, link range', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-w05-member-range')
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

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const switcher = page.getByTestId('club-calendar')

    // A phone opens on Day, today; the tabs in their order with the shared labels.
    await page.goto('/club/calendar')
    await expect(switcher).toHaveAttribute('data-range', 'day')
    await expect(switcher).toHaveAttribute('data-date', today)
    const order = await switcher
      .locator('[data-testid^="club-calendar-view-"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('data-testid')))
    expect(order).toEqual(['upcoming', 'day', 'week', 'month'].map((view) => `club-calendar-view-${view}`))
    await expect(page.getByTestId('club-calendar-view-day')).toHaveText(uiText('activities.rangeSwitch.day'))

    // The training's day from a copied link: the card; the next day is empty and offers "Next day".
    await page.goto(`/club/calendar?range=day&date=${tuesday}`)
    await expect(page.getByTestId('calendar-item').filter({ hasText: TRAINING })).toHaveCount(1)
    await expect(page.getByTestId('club-calendar-range')).not.toBeEmpty()
    await page.getByTestId('club-calendar-next').click()
    await expect(switcher).toHaveAttribute('data-date', addDays(tuesday, 1))
    await expect(page.getByTestId('calendar-empty')).toHaveText(
      uiText('activities.club.calendar.emptyDay', { exact: true }),
    )
    await page.getByTestId('club-calendar-next-day').click()
    await expect(switcher).toHaveAttribute('data-date', addDays(tuesday, 2))
    await page.getByTestId('club-calendar-previous').click()
    await page.getByTestId('club-calendar-previous').click()
    await expect(page.getByTestId('calendar-item').filter({ hasText: TRAINING })).toHaveCount(1)
    const dayViolations = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
    expect(dayViolations).toEqual([])
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    expect(await scanBlockingViolations(page, testInfo, { platformBaseline: true })).toEqual([])
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // Week keeps the day; a reload keeps the view; Today returns to today's week.
    await page.getByTestId('club-calendar-view-week').click()
    await expect(page).toHaveURL(new RegExp(`range=week&date=${tuesday}`))
    await expect(page.getByTestId('calendar-item').filter({ hasText: TRAINING })).toHaveCount(1)
    await page.reload()
    await expect(switcher).toHaveAttribute('data-range', 'week')
    await expect(page.getByTestId('calendar-item').filter({ hasText: TRAINING })).toHaveCount(1)
    await page.getByTestId('club-calendar-today').click()
    await expect(switcher).toHaveAttribute('data-date', today)
    await expect(page.getByTestId('club-calendar-today')).toHaveCount(0)

    // Month and Upcoming.
    await page.goto(`/club/calendar?range=month&date=${tuesday}`)
    await expect(page.locator(`[data-testid="calendar-day"][data-date="${tuesday}"]`)).toBeVisible()
    await page.getByTestId('club-calendar-view-upcoming').click()
    await expect(page.getByTestId('club-calendar-view-upcoming')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('club-calendar-previous')).toHaveCount(0)
    await expect(page.getByTestId('calendar-item').filter({ hasText: TRAINING })).toHaveCount(1)
    await expectNoPageOverflow(page)

    // A link range (#493) still opens its dates; picking a view leaves it.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/club/calendar?from=${tuesday}&to=${tuesday}`)
    await expect(page.getByTestId('calendar-item').filter({ hasText: TRAINING })).toHaveCount(1)
    for (const view of ['upcoming', 'day', 'week', 'month']) {
      await expect(page.getByTestId(`club-calendar-view-${view}`)).not.toHaveAttribute('aria-current', 'page')
    }
    await page.getByTestId('club-calendar-view-week').click()
    await expect(page).not.toHaveURL(/from=/)
    await expect(switcher).toHaveAttribute('data-range', 'week')

    // A desktop opens on Week.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/club/calendar')
    await expect(switcher).toHaveAttribute('data-range', 'week')
    await expect(page.getByTestId('club-calendar-view-week')).toHaveAttribute('aria-current', 'page')
  } finally {
    await club.cleanup()
  }
})
