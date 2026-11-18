import { expect, test, type Page } from '@playwright/test'
import { addDays, getOccurrence, nextWeekday, zoneInstant } from '../_fixtures/activities'
import {
  expectNoPageOverflow,
  prepareForAccessibilityScan,
  scanBlockingViolations,
  switchColorScheme,
} from '../_fixtures/axe'
import { familyFor } from '../_fixtures/attendance'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { uiText } from '../_fixtures/ui-text'

// Groups and activities parity spec TEST-A12 (REQ-A08, REQ-A13, J-A02 steps 1 and 6; #270): the Żaki coach on a phone
// (375 px) creates a sparring at "Other address" with an opponent and a gathering time — the "away" box ticks itself
// and an empty venue is announced on its field — lands on the session page, which shows the venue with an
// OpenStreetMap search link, opens "Edit", finds the values there and moves the start. The form, the session page and
// the edit page pass axe without overflow in both locales, light and dark.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const VENUE = { name: 'Stadion Wisły Liszki', address: 'ul. Sportowa 1, Liszki' }

async function chooseOption(page: Page, trigger: string, name: string | RegExp): Promise<void> {
  await page.getByTestId(trigger).click()
  await page.getByRole('option', { name }).click()
}

test('TEST-A12 the coach creates a typed-venue sparring on the phone, sees the venue and its map link, and edits it; both locales, light and dark', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-a12')
  try {
    const admin = club.adminToken
    const family = await familyFor(request, club)
    const team = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', admin, {
      data: { name: 'Wisła Liszki', clubName: 'Wisła Liszki' },
    })
    expect(team.status, JSON.stringify(team.body)).toBe(201)
    const saturday = nextWeekday(addDays(calendarDate(), 7), 'SA')

    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.context().addCookies([{ name: 'locale', value: 'en', url: BASE_URL }])
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    const violations: Record<string, unknown> = {}
    const scan = async (label: string) => {
      await expectNoPageOverflow(page)
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (found.length > 0) violations[label] = found
    }

    // --- J-A02 step 1: the new-event form on the phone ---
    await page.goto('/club/events/new')
    await expect(page.getByTestId('club-event-form')).toBeVisible()
    // Żaki is a team: a sparring and a match are offered.
    await page.getByTestId('club-event-type-sparring').click()
    await expect(page.getByTestId('club-event-type-sparring').getByRole('radio')).toBeChecked()
    await expect(page.getByTestId('club-event-type-match')).toBeVisible()
    await chooseOption(page, 'club-event-opponent', /Wisła Liszki/)
    await page.getByTestId('club-event-venue-mode-venue').click()
    // Another address ticks "away" (Q-A25); the club places are no longer asked for.
    await expect(page.getByTestId('club-event-away').getByRole('checkbox')).toBeChecked()
    await expect(page.getByTestId('club-event-place')).toHaveCount(0)
    await expect(page.getByTestId('club-event-venue-address')).toHaveAccessibleDescription(
      uiText('activities.venue.address.help'),
    )
    await page.getByTestId('club-event-name').fill('Sparing z Wisłą Liszki')
    await page.getByTestId('club-event-date').fill(saturday)
    await page.getByTestId('club-event-start').fill('09:00')
    await page.getByTestId('club-event-end').fill('10:30')
    await page.getByTestId('club-event-gathering').fill('08:30')
    // An empty venue is announced on its fields and nothing is sent.
    await page.getByTestId('club-event-submit').click()
    await expect(page.getByTestId('club-event-error')).toHaveText(uiText('activities.club.event.errors.fix'))
    await expect(page.getByTestId('club-event-venue-name')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('club-event-venue-name')).toBeFocused()
    await expect(page.getByTestId('club-event-venue-address')).toHaveAttribute('aria-invalid', 'true')
    await page.getByTestId('club-event-venue-name').fill(VENUE.name)
    await page.getByTestId('club-event-venue-address').fill(VENUE.address)
    for (const colorScheme of ['light', 'dark'] as const) {
      // The form keeps its values and its error state, so the scheme changes without a reload and the scan waits for
      // the fade to end (#368).
      await switchColorScheme(page, colorScheme)
      await expect(page.getByTestId('club-event-submit')).toBeInViewport()
      await scan(`/club/events/new (en, ${colorScheme})`)
    }
    await switchColorScheme(page, 'light')
    const created = page.waitForResponse(
      (response) => response.url().endsWith('/api/activities/events') && response.request().method() === 'POST',
    )
    await page.getByTestId('club-event-submit').click()
    const answer = await created
    expect(answer.status()).toBe(201)
    const body = (await answer.json()) as { occurrenceId?: string; placeId?: string | null; venue?: unknown }
    expect(body).toMatchObject({ placeId: null, venue: VENUE, isAway: true })
    const occurrenceId = String(body.occurrenceId)
    const stored = (await getOccurrence(request, admin, occurrenceId)).body
    expect(stored).toMatchObject({ gatheringAt: zoneInstant(saturday, '08:30'), opponentName: 'Wisła Liszki' })

    // --- The session page: the venue, its address and an OpenStreetMap search link; "Edit" for the coach ---
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${occurrenceId}\\?as=coach`))
    const sessionPath = `/club/occurrences/${occurrenceId}?as=coach`
    const editPath = `/club/occurrences/${occurrenceId}/edit`
    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      for (const colorScheme of ['light', 'dark'] as const) {
        const label = `${locale}, ${colorScheme}`
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.goto(sessionPath)
        await expect(page.getByTestId('club-session-address'), label).toHaveText(VENUE.address)
        await expect(page.getByTestId('club-session-map'), label).toHaveAttribute(
          'href',
          `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${VENUE.name}, ${VENUE.address}`)}`,
        )
        await expect(page.getByTestId('club-session-opponent'), label).toHaveText('Wisła Liszki')
        await expect(page.getByTestId('club-session-edit'), label).toHaveText(uiText('activities.club.session.edit'))
        await scan(`/club/occurrences/[id] (${label})`)
        await page.goto(editPath)
        await expect(page.getByRole('heading', { level: 1 }), label).toHaveText(uiText('activities.club.edit.title'))
        await expect(page.getByTestId('club-edit-venue-name'), label).toHaveValue(VENUE.name)
        await expect(page.getByTestId('club-edit-submit'), label).toBeInViewport()
        await scan(`/club/occurrences/[id]/edit (${label})`)
      }
    }

    // --- J-A02 step 6: the edit form holds the values; the coach moves the start by half an hour ---
    await page.context().addCookies([{ name: 'locale', value: 'en', url: BASE_URL }])
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(sessionPath)
    await page.getByTestId('club-session-edit').click()
    await expect(page).toHaveURL(new RegExp(`${editPath}$`))
    await expect(page.getByTestId('club-edit-date')).toHaveValue(saturday)
    await expect(page.getByTestId('club-edit-start')).toHaveValue('09:00')
    await expect(page.getByTestId('club-edit-end')).toHaveValue('10:30')
    await expect(page.getByTestId('club-edit-gathering')).toHaveValue('08:30')
    await expect(page.getByTestId('club-edit-venue-mode-venue').getByRole('radio')).toBeChecked()
    await expect(page.getByTestId('club-edit-venue-address')).toHaveValue(VENUE.address)
    // A cleared venue name is announced on its field.
    await page.getByTestId('club-edit-venue-name').fill('')
    await page.getByTestId('club-edit-submit').click()
    await expect(page.getByTestId('club-edit-venue-name')).toHaveAttribute('aria-invalid', 'true')
    await page.getByTestId('club-edit-venue-name').fill(VENUE.name)
    await page.getByTestId('club-edit-start').fill('09:30')
    await page.getByTestId('club-edit-end').fill('11:00')
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/activities/occurrences/${occurrenceId}`) &&
        response.request().method() === 'PATCH',
    )
    await page.getByTestId('club-edit-submit').click()
    expect((await saved).status()).toBe(200)
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${occurrenceId}\\?as=coach`))
    // The administrator's token reads the result (the coach's password changed when the browser signed in).
    expect((await getOccurrence(request, admin, occurrenceId)).body).toMatchObject({
      startAt: zoneInstant(saturday, '09:30'),
      endAt: zoneInstant(saturday, '11:00'),
      placeId: null,
      venue: VENUE,
      gatheringAt: zoneInstant(saturday, '09:00'),
    })
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
