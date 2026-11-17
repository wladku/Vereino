import { expect, test } from '@playwright/test'
import { addDays, createActivity } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { declare, familyFor, sessionsOf } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { passDeadline } from '../_fixtures/declaration-links'
import { uiText } from '../_fixtures/ui-text'

// Groups and activities parity spec TEST-A10 (REQ-A07, M-02…M-05; #269): a guardian of two wards on a phone sees
// "Confirm by …" on Today, the calendar and the session page of a match before its deadline, and after it "Deadline
// passed …" with the hint to write to the coach, "No answer" for the unanswered child and no declaration buttons — in
// both locales, light and dark. The coach's attendance list states how many have not answered and lists them first.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

test('TEST-A10 the deadline on the phone: confirm by, then deadline passed with the hint and no answer; the coach sees the unanswered first; both locales, light and dark', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-a10')
  try {
    const family = await familyFor(request, club)
    const coordinator = family.academyCoordinator.token
    const tomorrow = addDays(calendarDate(), 1)
    const match = async (name: string, startTime: string, endTime: string) => {
      const created = await createActivity(request, coordinator, {
        groupId: family.zaki,
        name,
        type: 'match',
        placeId: family.pitch,
        startsOn: tomorrow,
        startTime,
        endTime,
        confirmByMinutesBefore: 120,
      })
      const [session] = await sessionsOf(request, club, created.id)
      return session.id
    }
    // Open: tomorrow at 18:00, confirm by 16:00. Closed: tomorrow at 10:00, the deadline already passed.
    const open = await match('Mecz otwarty', '18:00', '19:30')
    const closed = await match('Mecz zamknięty', '10:00', '11:30')
    const answered = await declare(request, family.guardian.token, {
      occurrenceId: closed,
      personId: family.younger.personId,
      declared: 'yes',
    })
    expect(answered.status, JSON.stringify(answered.body)).toBe(201)
    await passDeadline(closed)

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    const violations: Record<string, unknown> = {}
    const card = (id: string) => page.locator(`[data-testid="calendar-item"][data-item-id="${id}"]`)

    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        const label = `${locale}, ${colorScheme}`

        // M-02: the Today cards.
        await page.goto('/club')
        const openCard = page.locator(`[data-testid="club-today-card"][data-occurrence-id="${open}"]`)
        await expect(openCard.getByTestId('club-today-deadline'), label).toContainText('16:00')
        await expect(openCard.getByTestId('club-today-deadline'), label).toContainText(
          uiText('activities.deadline.label'),
        )
        const closedCard = page.locator(`[data-testid="club-today-card"][data-occurrence-id="${closed}"]`)
        await expect(closedCard.getByTestId('club-today-deadline'), label).toContainText(
          uiText('activities.deadline.over'),
        )
        await expect(closedCard.getByTestId('club-today-deadline-hint'), label).toHaveText(
          uiText('activities.deadline.passedHint', { exact: true }),
        )
        await expectNoPageOverflow(page)

        // M-03: the calendar cards.
        await page.goto(`/club/calendar?from=${calendarDate()}&to=${tomorrow}`)
        await expect(card(open).getByTestId('calendar-item-note-deadline'), label).toContainText('16:00')
        await expect(card(closed).getByTestId('calendar-item-note-deadline'), label).toContainText(
          uiText('activities.deadline.over'),
        )
        await expect(card(closed).getByTestId('calendar-item-note-deadline-hint'), label).toBeVisible()
        await expect(card(closed), label).toContainText(uiText('activities.club.declaration.noAnswer'))
        await expect(card(closed).locator('[data-action-id]'), label).toHaveCount(0)
        await expect(card(open).locator('[data-action-id]').first(), label).toBeVisible()
        await expectNoPageOverflow(page)

        // M-04: the session pages.
        await page.goto(`/club/occurrences/${open}`)
        await expect(page.getByTestId('club-session-deadline'), label).toHaveAttribute('data-passed', 'false')
        await expect(page.getByTestId('club-session-deadline'), label).toContainText('16:00')
        await page.goto(`/club/occurrences/${closed}`)
        await expect(page.getByTestId('club-session-deadline'), label).toHaveAttribute('data-passed', 'true')
        await expect(page.getByTestId('club-session-deadline-passed'), label).toBeVisible()
        await expect(page.locator('[data-declared]'), label).toHaveCount(0)
        await expectNoPageOverflow(page)
        const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
        if (found.length > 0) violations[`/club/occurrences/[id] after the deadline (${label})`] = found
      }
    }

    // M-05: the coach's list puts "no answer" first and counts it.
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto(`/club/occurrences/${closed}/attendance`)
    await expect(page.getByTestId('club-attendance-deadline')).toHaveAttribute('data-passed', 'true')
    await expect(page.getByTestId('club-attendance-deadline')).toContainText('2')
    const rows = page.getByTestId('club-attendance-row')
    await expect(rows).toHaveCount(3)
    // Kuba Kowalski and Stanislaw Nowak have not answered; Hania Kowalska (confirmed) comes last.
    await expect(rows.last()).toContainText(family.younger.firstName)
    await expectNoPageOverflow(page)
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
