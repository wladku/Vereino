import { expect, test, type Page, type Response } from '@playwright/test'
import { addDays, createActivity, mondayOf, showCalendarWeekOf } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor, sessionsOf } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'

// E06-S18 (#100, epic #82; README M-03; club spec REQ-006, UI row `/club/calendar` "week/month calendar"): a guardian
// with a ward in the academy and the pool reads the calendar on a phone. The week shows a legend of both sections, and
// each card carries its section's marker with the section's name and the coach; an empty week says "No sessions this
// week" and its "Next week" loads the next week; the Week/Month switch (owner, Q1) lists only the days of the month
// that have sessions and moves by months; a link asking for more than 62 days is answered 400 by the API and the page
// reads the range again trimmed, with a notice; a failed read offers "Try again". Every date is relative to next
// Monday, so the test passes on any weekday and at any hour (all sessions are in the future). Axe in light and dark at
// 375 px and the 320 px reflow on the linked range and on the month list.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const ACADEMY = 'Akademia piłkarska'
const POOL = 'Basen'
const TRAINING = 'Trening Żaków'
const POOL_CLASS = 'Nauka pływania'
const EXTRA_CLASS = 'Basen — zajęcia dodatkowe'

/** Whole calendar months from the month of `from` to the month of `to`. */
function monthsBetween(from: string, to: string): number {
  const months = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
  return months(to) - months(from)
}

/** Switches to the month list and moves forward to the month of `date`. */
async function showMonthOf(page: Page, date: string): Promise<void> {
  await page.getByTestId('club-calendar-view-month').click()
  await expect(page.getByTestId('club-calendar-view-month')).toHaveAttribute('aria-checked', 'true')
  const range = page.getByTestId('club-calendar-range')
  for (let step = 0; step < monthsBetween(calendarDate(), date); step += 1) {
    const shown = String(await range.textContent())
    await page.getByTestId('club-calendar-next').click()
    await expect(range).not.toHaveText(shown)
  }
}

test('E06-S18 a guardian on a phone: section legend and markers with the coach, an empty week with Next week, the month list, a trimmed range, Try again, axe in both schemes', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s18')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const today = calendarDate()
    const nextMonday = addDays(mondayOf(today), 7)
    // Week 1: the Żaki training (academy, coach Marek) on Tuesday and the pool class (instructor Irena) on Thursday.
    // Week 2 is empty. Week 3: one pool session on Wednesday.
    const tuesday = addDays(nextMonday, 1)
    const thursday = addDays(nextMonday, 3)
    const laterWednesday = addDays(nextMonday, 16)
    const oneOffs = [
      { groupId: family.zaki, placeId: family.pitch, name: TRAINING, date: tuesday, coach: family.coach.personId },
      {
        groupId: family.poolGroup,
        placeId: family.poolPlace,
        name: POOL_CLASS,
        date: thursday,
        coach: family.instructor.personId,
      },
      {
        groupId: family.poolGroup,
        placeId: family.poolPlace,
        name: EXTRA_CLASS,
        date: laterWednesday,
        coach: family.instructor.personId,
      },
    ]
    for (const entry of oneOffs) {
      const { id } = await createActivity(request, admin, {
        groupId: entry.groupId,
        placeId: entry.placeId,
        name: entry.name,
        type: 'training',
        startsOn: entry.date,
        startTime: '17:00',
        endTime: '18:00',
        coachPersonId: entry.coach,
      })
      const sessions = await sessionsOf(request, club, id)
      expect(sessions.map((session) => session.occurrenceDate)).toEqual([entry.date])
    }

    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}

    // The week of both sections: the legend lists both once; each card carries its section's marker with the name, in
    // the colour of its legend entry, and the coach's name.
    await page.goto('/club/calendar')
    await expect(page.getByTestId('club-calendar-view-week')).toHaveAttribute('aria-checked', 'true')
    await showCalendarWeekOf(page, tuesday)
    const training = page.getByTestId('calendar-item').filter({ hasText: TRAINING })
    const poolClass = page.getByTestId('calendar-item').filter({ hasText: POOL_CLASS })
    await expect(training).toHaveCount(1)
    await expect(poolClass).toHaveCount(1)
    const legend = page.getByTestId('calendar-legend')
    await expect(legend).toHaveAccessibleName(/^(Sections|Sekcje)$/)
    await expect(legend.getByTestId('calendar-legend-section')).toHaveText([ACADEMY, POOL])
    const colours: string[] = []
    for (const [item, section, sectionId, coach] of [
      [training, ACADEMY, family.academy, 'Marek Trener'],
      [poolClass, POOL, family.pool, 'Irena Instruktor'],
    ] as const) {
      const marker = item.getByTestId('calendar-item-section')
      await expect(marker).toHaveText(section)
      await expect(marker).toHaveAttribute('data-section-id', sectionId)
      const colour = String(await marker.locator('[data-slot="chart-legend-dot"]').getAttribute('data-color'))
      const entry = legend.locator(`[data-section-id="${sectionId}"]`)
      await expect(entry.locator('[data-slot="chart-legend-dot"]')).toHaveAttribute('data-color', colour)
      colours.push(colour)
      await expect(item.getByTestId('calendar-item-coach')).toHaveText(new RegExp(`^(Coach|Trener): ${coach}$`))
    }
    expect(new Set(colours).size).toBe(2)
    // The other family's child is not on the guardian's cards (R15): the cards name the guardian's ward only.
    await expect(training).not.toContainText(family.other.child.firstName)

    // The empty week: the message and "Next week", operated from the keyboard, loads week 3.
    await page.getByTestId('club-calendar-next').click()
    await expect(page.getByTestId('calendar-item')).toHaveCount(0)
    await expect(page.getByTestId('calendar-empty')).toHaveText(
      /^(No sessions this week\.|Brak zajęć w tym tygodniu\.)$/,
    )
    await expect(page.getByTestId('calendar-legend')).toHaveCount(0)
    const emptyWeekLabel = String(await page.getByTestId('club-calendar-range').textContent())
    const emptyNext = page.getByTestId('club-calendar-empty-next')
    await expect(emptyNext).toHaveText(/^(Next week|Następny tydzień)$/)
    await emptyNext.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('club-calendar-range')).not.toHaveText(emptyWeekLabel)
    await expect(page.getByTestId('calendar-item').filter({ hasText: EXTRA_CLASS })).toHaveCount(1)
    await expect(page.getByTestId('calendar-day')).toHaveAttribute('data-date', laterWednesday)

    // The month list: only the days of the month that have sessions, the same cards; previous and next month.
    await page.reload()
    await showMonthOf(page, tuesday)
    const monthOfTuesday = tuesday.slice(0, 7)
    const expectedDays = [tuesday, thursday, laterWednesday].filter((day) => day.startsWith(monthOfTuesday))
    await expect(page.getByTestId('calendar-day')).toHaveCount(expectedDays.length)
    const listedDays = await page
      .getByTestId('calendar-day')
      .evaluateAll((sections) => sections.map((section) => section.getAttribute('data-date')))
    expect(listedDays).toEqual(expectedDays)
    for (const day of expectedDays) {
      await expect(
        page.locator(`[data-testid="calendar-day"][data-date="${day}"] [data-testid="calendar-item"]`),
      ).toHaveCount(1)
    }
    await expect(
      page.getByTestId('calendar-item').filter({ hasText: TRAINING }).getByTestId('calendar-item-section'),
    ).toHaveText(ACADEMY)
    await expect(page.getByTestId('club-calendar-next')).toHaveText(/^(Next month|Następny miesiąc)$/)
    const monthLabel = String(await page.getByTestId('club-calendar-range').textContent())
    await page.getByTestId('club-calendar-next').click()
    await expect(page.getByTestId('club-calendar-range')).not.toHaveText(monthLabel)
    await page.getByTestId('club-calendar-previous').click()
    await expect(page.getByTestId('club-calendar-range')).toHaveText(monthLabel)
    await expect(page.getByTestId('calendar-day')).toHaveCount(expectedDays.length)
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.reload()
      await showMonthOf(page, tuesday)
      await expect(page.getByTestId('calendar-day')).toHaveCount(expectedDays.length)
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (found.length > 0) violations[`/club/calendar month (${colorScheme})`] = found
    }
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // The switch from the keyboard: the arrow moves between Week and Month, Space selects.
    await page.reload()
    // (Whether Radix also selects on the arrow depends on key timing — Playwright's instant press only moves the focus.)
    await expect(page.getByTestId('club-calendar-view-week')).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('club-calendar-view-week').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('club-calendar-view-month')).toBeFocused()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('club-calendar-view-month')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('club-calendar-previous')).toHaveText(/^(Previous month|Poprzedni miesiąc)$/)

    // A link asking for 90 days: the API answers 400 `calendar_range_invalid`, the page reads the first 62 days instead
    // of failing, says so, and lists all three sessions with the legend.
    const linkTo = addDays(nextMonday, 89)
    const trimmedTo = addDays(nextMonday, 61)
    const reads: { status: number; to: string | null }[] = []
    const onResponse = (response: Response) => {
      const url = new URL(response.url())
      if (url.pathname === '/api/activities/calendar')
        reads.push({ status: response.status(), to: url.searchParams.get('to') })
    }
    page.on('response', onResponse)
    const linked = `/club/calendar?from=${nextMonday}&to=${linkTo}`
    await page.goto(linked)
    await expect(page.getByTestId('club-calendar-trimmed')).toBeVisible()
    await expect(page.getByTestId('club-calendar-trimmed')).toContainText(/62/)
    await expect(page.getByTestId('calendar-item')).toHaveCount(3)
    await expect(page.getByTestId('calendar-legend').getByTestId('calendar-legend-section')).toHaveText([ACADEMY, POOL])
    await expect(page.getByTestId('club-calendar-view-week')).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('club-calendar-view-month')).toHaveAttribute('aria-checked', 'false')
    page.off('response', onResponse)
    expect(reads).toEqual(
      expect.arrayContaining([
        { status: 400, to: linkTo },
        { status: 200, to: trimmedTo },
      ]),
    )
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.reload()
      await expect(page.getByTestId('calendar-item')).toHaveCount(3)
      await expect(page.getByTestId('club-calendar-trimmed')).toBeVisible()
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (found.length > 0) violations[`/club/calendar linked range (${colorScheme})`] = found
    }
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    // A failed read: the error and "Try again", which loads the range once the API answers again.
    await page.route('**/api/activities/calendar?*', (route) => route.abort())
    await page.reload()
    await expect(page.getByText(/calendar could not be loaded|Nie udało się wczytać kalendarza/)).toBeVisible()
    await page.unroute('**/api/activities/calendar?*')
    await page.getByRole('button', { name: /^(Try again|Spróbuj ponownie)$/ }).click()
    await expect(page.getByTestId('calendar-item')).toHaveCount(3)

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
