import { expect, test } from '@playwright/test'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { makePublic, partFamily } from '../_fixtures/club-events'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { passDeadline } from '../_fixtures/declaration-links'
import { publish } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// Club events spec TEST-T13 (REQ-T03, AC-T04, J-T03, J-T06; M-02, M-03, M-04; #382): on a phone at 375 px, in both
// locales, light and dark. While the club event is not public its part's card on Today shows the line
// "PRZYKŁAD CUP 2026" without a link; once public, Today, the calendar and the session page link the line to the
// public page and the session page lists the visiting teams; the Trampkarz part of the same event shows nowhere. After
// the deadline the controls close with "Deadline passed". The group's coach opens the part's session page: Attendance
// list and Message the group are there, Edit and Cancel are not.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const EVENT = 'PRZYKŁAD CUP 2026'

test('TEST-T13 the part of a club event on the family’s phone: the event line with its public link, the visiting teams, the deadline; the coach runs it without Edit and Cancel', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-t13')
  try {
    const family = await familyFor(request, club)
    const { eventId, day, zakiPart, trampkarzPart } = await partFamily(request, club, family)
    const session = String(zakiPart.occurrenceId)
    const todayCard = page.locator(`[data-testid="club-today-card"][data-occurrence-id="${session}"]`)
    const calendarCard = page.locator(`[data-testid="calendar-item"][data-item-id="${session}"]`)

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)

    // --- Not public: the line without a link ---
    await page.goto('/club')
    await expect(todayCard.getByTestId('session-facts-club-event')).toHaveText(EVENT)
    await expect(todayCard.getByTestId('session-facts-club-event').locator('a')).toHaveCount(0)

    // --- Public: the line links the public page ---
    const eventSlug = await makePublic(request, family.academyCoordinator.token, eventId)
    const settings = await publish(request, club.adminToken, `t13-${Date.now().toString(36)}`, ['events'])
    const publicPath = `/p/${String(settings.publicSlug)}/events/${eventSlug}`
    const violations: Record<string, unknown> = {}
    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        const label = `${locale}, ${colorScheme}`

        // M-02: Today.
        await page.goto('/club')
        await expect(todayCard.getByRole('link', { name: EVENT }), label).toHaveAttribute('href', publicPath)
        await expect(
          page.locator(`[data-testid="club-today-card"][data-occurrence-id="${String(trampkarzPart.occurrenceId)}"]`),
          label,
        ).toHaveCount(0)
        await expectNoPageOverflow(page)

        // M-03: the calendar.
        await page.goto(`/club/calendar?from=${calendarDate()}&to=${day}`)
        await expect(calendarCard.getByTestId('calendar-item-part-of').getByRole('link'), label).toHaveAttribute(
          'href',
          publicPath,
        )
        await expect(calendarCard.getByTestId('calendar-item-part-of'), label).toHaveText(EVENT)
        await expect(
          page.locator(`[data-testid="calendar-item"][data-item-id="${String(trampkarzPart.occurrenceId)}"]`),
          label,
        ).toHaveCount(0)
        await expectNoPageOverflow(page)

        // M-04: the session page with the visiting teams.
        await page.goto(`/club/occurrences/${session}?as=guardian`)
        await expect(page.getByTestId('session-facts-club-event').getByRole('link'), label).toHaveAttribute(
          'href',
          publicPath,
        )
        const teams = page.getByTestId('club-session-invited-teams')
        await expect(teams.getByRole('listitem'), label).toHaveText([
          'Wisła Brzezie',
          'Orzeł Brzozów',
          'UKS Sąsiedni',
        ])
        await expect(
          page.getByText(uiText('activities.club.session.visitingTeams', { exact: true })),
          label,
        ).toBeVisible()
        await expect(page.locator('[data-declared]').first(), label).toBeVisible()
        await expectNoPageOverflow(page)
        const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
        if (found.length > 0) violations[`/club/occurrences/[id] part as guardian (${label})`] = found
      }
    }

    // --- After the deadline the controls close (REQ-A07) ---
    await passDeadline(session)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(`/club/occurrences/${session}?as=guardian`)
    await expect(page.getByTestId('club-session-deadline')).toHaveAttribute('data-passed', 'true')
    await expect(page.getByTestId('club-session-deadline-passed')).toBeVisible()
    await expect(page.locator('[data-declared]')).toHaveCount(0)

    // --- The group's coach: attendance and the message, no Edit and no Cancel ---
    await switchBrowserUser(page, request, club, family.coach.userId, family.coach.email)
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.goto(`/club/occurrences/${session}?as=coach`)
      const block = page.getByTestId('club-session-coach')
      await expect(block.getByTestId('club-session-attendance'), colorScheme).toBeVisible()
      await expect(block.getByTestId('club-session-message-group'), colorScheme).toBeVisible()
      await expect(block.getByTestId('club-session-edit'), colorScheme).toHaveCount(0)
      await expect(block.getByTestId('club-session-cancel'), colorScheme).toHaveCount(0)
      await expect(page.getByTestId('session-facts-club-event'), colorScheme).toHaveText(EVENT)
      await expectNoPageOverflow(page)
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (found.length > 0) violations[`/club/occurrences/[id] part as coach (${colorScheme})`] = found
    }
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
