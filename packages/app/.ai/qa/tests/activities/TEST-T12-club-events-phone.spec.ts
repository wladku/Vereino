import { expect, test, type Page } from '@playwright/test'
import { addDays, nextWeekday } from '../_fixtures/activities'
import { familyFor } from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { readClubEvent, updateClubEvent } from '../_fixtures/club-events'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { createGroup } from '../_fixtures/groups'
import { png } from '../_fixtures/publication'
import { uiText } from '../_fixtures/ui-text'

// Club events spec TEST-T12 (REQ-T12, AC-T12, J-T01, the phone half of J-T05; E14-S05, #380): the section coordinator
// on a phone at 375 px finds "Club events" behind More, creates "GWIAZDA CUP 2026" with a new external hall from the
// Add place sheet, adds a part with a visiting team picked and one added in place — first while the connection is
// lost (the form keeps its values and offers Try again) — is refused a second part whose coach collides (409, nothing
// saved), copies the first part into an open part, moves the first part (the session edit shows the place locked and
// the toast names the people told), uploads the poster from a file and cancels the club event with a reason (the
// toast names the people told). No `/backend` page is opened. The list, the event page and the part form have no
// blocking axe violation and no horizontal overflow in English and Polish, light and dark. A guardian has no "Club
// events" in More and is refused `/club/club-events/new`.
test.describe.configure({ timeout: 900_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const EVENT = 'GWIAZDA CUP 2026'
const HALL = 'Hala sportowa w Liszkach'
const ORLIK_PART = 'Turniej Żaków'
const SENIORS_PART = 'Turniej Drużyn – Seniorzy (16+)'
const MORE = uiText('people.club.nav.more', { exact: true })
const CLUB_EVENTS = uiText('people.club.nav.clubEvents', { exact: true })

/** Opens a Radix select by its trigger's test id and picks the option named `option`. */
async function choose(page: Page, triggerTestId: string, option: string | RegExp): Promise<void> {
  await expect(async () => {
    const trigger = page.getByTestId(triggerTestId)
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
    await page.getByRole('option', { name: option }).click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

/** Opens the card menu of the part titled `title` and chooses the action's button. */
async function partAction(page: Page, title: string, action: 'edit' | 'copy' | 'move' | 'cancel' | 'remove') {
  const card = page.getByTestId('club-event-member-part').filter({ hasText: title })
  await card.getByTestId('club-event-member-part-menu').click()
  const sheet = page.getByTestId('club-event-member-part-sheet')
  await expect(sheet).toBeVisible()
  await sheet.getByTestId(`club-event-member-part-${action}`).click()
}

test('TEST-T12 the section coordinator sets up and runs a club event on the phone: Add place sheet, parts with teams, Try again, a coach collision, Copy, Move with the place locked, the poster, Cancel; a guardian is refused', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-t12-club-events-phone')
  try {
    const admin = club.adminToken
    const family = await familyFor(request, club)
    const coordinator = family.academyCoordinator
    const orlik = await createGroup(request, admin, { sectionId: family.academy, name: 'Orlik młodszy', kind: 'team' })
    expect(orlik).not.toBe('')
    const team = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', admin, {
      data: { name: 'Wisła Liszki', clubName: 'LKS Wisła Liszki' },
    })
    expect(team.status, JSON.stringify(team.body)).toBe(201)
    const coaches = await call<{ items?: Array<{ id: string; name: string }> }>(
      request,
      'GET',
      '/api/activities/options/coaches',
      admin,
    )
    const coachName = coaches.body?.items?.find((item) => item.id === family.coach.personId)?.name ?? ''
    expect(coachName).not.toBe('')
    const day = nextWeekday(addDays(calendarDate(), 7), 'SA')
    const nextDay = addDays(day, 1)

    page.setDefaultTimeout(30_000)
    const backendRequests: string[] = []
    page.on('request', (sent) => {
      if (sent.resourceType() === 'document' && new URL(sent.url()).pathname.startsWith('/backend')) {
        backendRequests.push(sent.url())
      }
    })
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.context().addCookies([{ name: 'locale', value: 'en', url: BASE_URL }])
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)

    // --- #440: a failed read of the form options (500) offers Try again, it does not say "denied" ---
    let optionsFail = true
    const optionsRoute = '**/api/activities/club-events/options'
    await page.route(optionsRoute, (route) =>
      optionsFail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : route.fallback(),
    )
    await page.goto('/club/club-events/new')
    await expect(page.getByText(uiText('activities.clubEvents.errors.options'))).toBeVisible()
    await expect(page.getByTestId('club-event-member-denied')).toHaveCount(0)
    optionsFail = false
    await page.getByRole('button', { name: uiText('activities.club.actions.retry', { exact: true }) }).click()
    await expect(page.getByTestId('club-event-member-name')).toBeVisible()
    await page.unroute(optionsRoute)

    // --- J-T01 step 1: More → Club events → the empty list → New club event ---
    await page.goto('/club')
    await page.getByTestId('club-bottom-bar').getByText(MORE).click()
    await page.getByTestId('club-more').getByRole('link', { name: CLUB_EVENTS }).click()
    await expect(page).toHaveURL(/\/club\/club-events$/)
    const empty = page.getByTestId('club-events-empty')
    await expect(empty).toContainText(uiText('activities.clubEvents.empty.title'))
    await empty.getByRole('link', { name: uiText('activities.clubEvents.actions.create', { exact: true }) }).click()
    await expect(page).toHaveURL(/\/club\/club-events\/new$/)

    // --- J-T01 steps 1–3: the form, the hall from the Add place sheet ---
    await page.getByTestId('club-event-member-name').fill(EVENT)
    await expect(page.getByTestId('club-event-member-slug')).toHaveAttribute('placeholder', 'gwiazda-cup-2026')
    await expect(page.getByTestId('club-event-member-section')).toContainText('Akademia piłkarska')
    await page.getByTestId('club-event-member-add-place').click()
    const sheet = page.getByTestId('add-external-place-sheet')
    await expect(sheet).toBeVisible()
    await sheet.getByTestId('add-external-place-name').fill(HALL)
    await sheet.getByTestId('add-external-place-address').fill('ul. Szkolna 50, Liszki')
    await sheet.getByTestId('add-external-place-submit').click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('club-event-member-place')).toContainText(HALL)
    await page.getByTestId('club-event-member-gathering').fill('30')
    await page.getByTestId('club-event-member-confirm-by').fill('48')
    await page.getByTestId('club-event-form-submit').click()
    await expect(page).toHaveURL(/\/club\/club-events\/[0-9a-f-]{36}$/)
    const eventId = /club-events\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? ''
    await expect(page.getByRole('heading', { level: 1, name: EVENT })).toBeVisible()
    await expect(page.getByTestId('club-event-member-no-parts')).toBeVisible()

    // --- J-T01 step 4: a part with a team from the list and one added in place; a lost connection first ---
    await page.getByTestId('club-event-member-add-part').click()
    await expect(page).toHaveURL(/\/parts\/new$/)
    await page.getByTestId('club-event-part-member-title').fill(ORLIK_PART)
    await page.getByTestId('club-event-part-member-date').fill(day)
    await page.getByTestId('club-event-part-member-start').fill('09:00')
    await page.getByTestId('club-event-part-member-end').fill('14:00')
    await choose(page, 'club-event-part-member-group', 'Żaki · Akademia piłkarska')
    await choose(page, 'club-event-part-member-coach', coachName)
    await choose(page, 'club-event-part-team-picker', 'Wisła Liszki (LKS Wisła Liszki)')
    await page.getByTestId('club-event-part-add-team').click()
    const teamDialog = page.getByTestId('club-event-part-team-create')
    const teamName = teamDialog.locator('input[name="name"]')
    await expect(async () => {
      await teamName.fill('CIS Czernichów')
      await expect(teamName).toHaveValue('CIS Czernichów', { timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    await teamDialog.getByRole('button', { name: uiText('activities.clubEvents.part.teams.submit') }).click()
    await expect(teamDialog).toBeHidden()
    await expect(page.getByTestId('club-event-part-team')).toHaveCount(2)
    await page.context().setOffline(true)
    await page.getByTestId('club-event-form-submit').click()
    await expect(page.getByTestId('club-event-form-error')).toContainText(
      uiText('activities.clubEvents.club.form.offline'),
    )
    await expect(page.getByTestId('club-event-part-member-title')).toHaveValue(ORLIK_PART)
    await page.context().setOffline(false)
    await page.getByTestId('club-event-form-retry').click()
    await expect(page).toHaveURL(new RegExp(`/club/club-events/${eventId}$`))
    const orlikCard = page.getByTestId('club-event-member-part').filter({ hasText: ORLIK_PART })
    await expect(orlikCard).toContainText('09:00–14:00')
    await expect(orlikCard.getByTestId('club-event-member-part-teams')).toContainText('2')

    // --- A coach collision: 409 lists the colliding session, nothing is saved ---
    await page.getByTestId('club-event-member-add-part').click()
    await page.getByTestId('club-event-part-member-title').fill('Turniej Orlika Młodszego')
    await page.getByTestId('club-event-part-member-date').fill(day)
    await page.getByTestId('club-event-part-member-start').fill('10:00')
    await page.getByTestId('club-event-part-member-end').fill('12:00')
    await choose(page, 'club-event-part-member-group', 'Orlik młodszy · Akademia piłkarska')
    await choose(page, 'club-event-part-member-coach', coachName)
    await page.getByTestId('club-event-form-submit').click()
    await expect(page.getByTestId('activities-conflicts')).toBeVisible()
    await expect(page).toHaveURL(/\/parts\/new$/)
    const afterCollision = await readClubEvent(request, admin, eventId)
    expect(afterCollision.body?.parts.length).toBe(1)

    // --- J-T01 step 5–6: Copy into the open seniors' part (the hall is external) ---
    await page.goto(`/club/club-events/${eventId}`)
    await partAction(page, ORLIK_PART, 'copy')
    await expect(page).toHaveURL(/\/parts\/new\?copyOf=/)
    await expect(page.getByTestId('club-event-part-member-title')).toHaveValue(ORLIK_PART)
    await expect(page.getByTestId('club-event-part-member-start')).toHaveValue('09:00')
    await expect(page.getByTestId('club-event-part-member-date')).toHaveValue('')
    await expect(page.getByTestId('club-event-part-team')).toHaveCount(2)
    await page.getByTestId('club-event-part-member-title').fill(SENIORS_PART)
    await page.getByTestId('club-event-part-member-date').fill(nextDay)
    await choose(page, 'club-event-part-member-group', uiText('activities.clubEvents.part.noGroup', { exact: true }))
    await expect(page.getByTestId('club-event-part-member-coach')).toHaveCount(0)
    await page.getByTestId('club-event-form-submit').click()
    await expect(page).toHaveURL(new RegExp(`/club/club-events/${eventId}$`))
    await expect(page.getByTestId('club-event-member-day')).toHaveCount(2)
    await expect(page.getByTestId('club-event-member-part').filter({ hasText: SENIORS_PART })).toContainText(
      uiText('activities.clubEvents.part.noGroup'),
    )

    // --- J-T05 on the phone: Move opens the session edit with the place locked; the toast names the people told ---
    const stored = await readClubEvent(request, admin, eventId)
    const occurrenceId = String(stored.body?.parts.find((part) => part.title === ORLIK_PART)?.occurrenceId)
    await partAction(page, ORLIK_PART, 'move')
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${occurrenceId}/edit\\?as=coordinator$`))
    await expect(page.getByTestId('club-edit-place-locked')).toContainText(HALL)
    await expect(page.getByTestId('club-edit-venue-mode-place')).toHaveCount(0)
    await expect(page.getByTestId('club-edit-place')).toHaveCount(0)
    await page.getByTestId('club-edit-start').fill('09:30')
    await page.getByTestId('club-edit-submit').click()
    await expect(page.getByText(uiText('activities.club.edit.savedNotified')).first()).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${occurrenceId}\\?as=coordinator$`))

    // --- The poster from a file ---
    await page.goto(`/club/club-events/${eventId}`)
    const poster = png([200, 40, 40], 64)
    await page.getByTestId('club-event-member-poster-file').setInputFiles({
      name: 'plakat.png',
      mimeType: poster.mimeType,
      buffer: poster.buffer,
    })
    await expect(page.getByTestId('club-event-member-poster')).toBeVisible()
    await expect(page.getByTestId('club-event-member-part').filter({ hasText: ORLIK_PART })).toContainText(
      '09:30–14:00',
    )

    // --- Both locales, light and dark: the list, the event page and the part form ---
    const violations: Record<string, unknown> = {}
    for (const locale of ['en', 'pl'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        const label = `${locale}, ${colorScheme}`
        const pages: Array<[string, string]> = [
          ['/club/club-events', 'club-events-upcoming'],
          [`/club/club-events/${eventId}`, 'club-event-member-files'],
          [`/club/club-events/${eventId}/parts/new`, 'club-event-part-member-form'],
          [`/club/club-events/${eventId}/edit`, 'club-event-member-form'],
        ]
        for (const [path, ready] of pages) {
          await page.goto(path)
          await expect(page.getByTestId(ready), `${path} (${label})`).toBeVisible()
          await expectNoPageOverflow(page)
          const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
          if (found.length > 0) violations[`${path} (${label})`] = found
        }
      }
    }
    expect(violations).toEqual({})

    // --- A stale version: changed in the panel meanwhile, the phone save is refused with a message and the form
    // reloads the current version (the form remounts on the new version, so the message is a flash) ---
    await page.context().addCookies([{ name: 'locale', value: 'en', url: BASE_URL }])
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(`/club/club-events/${eventId}/edit`)
    await expect(page.getByTestId('club-event-member-form')).toBeVisible()
    const beforeStale = await readClubEvent(request, admin, eventId)
    const changedMeanwhile = await updateClubEvent(
      request,
      admin,
      { id: eventId, description: 'Zmienione w panelu' },
      beforeStale.body?.updatedAt,
    )
    expect(changedMeanwhile.status, JSON.stringify(changedMeanwhile.body)).toBe(200)
    await page.getByTestId('club-event-member-description').fill('Zmienione na telefonie')
    await page.getByTestId('club-event-form-submit').click()
    await expect(page.getByText(uiText('activities.clubEvents.club.form.changed')).first()).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/club/club-events/${eventId}/edit$`))
    await expect(page.getByTestId('club-event-member-description')).toHaveValue('Zmienione w panelu')

    // --- Cancel club event with a reason: the toast names the people told ---
    await page.context().addCookies([{ name: 'locale', value: 'en', url: BASE_URL }])
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(`/club/club-events/${eventId}`)
    await page.getByTestId('club-event-member-cancel').click()
    const dialog = page.getByTestId('club-event-member-cancel-dialog')
    await dialog.getByTestId('club-event-member-cancel-dialog-reason').fill('Hala zamknięta')
    await dialog.getByTestId('club-event-member-cancel-dialog-confirm').click()
    await expect(page.getByText(uiText('activities.clubEvents.flash.cancelled')).first()).toBeVisible()
    await expect(page.getByTestId('club-event-member-cancelled')).toBeVisible()
    const cancelled = await readClubEvent(request, admin, eventId)
    expect(cancelled.body?.status).toBe('cancelled')
    expect(cancelled.body?.parts.find((part) => part.title === ORLIK_PART)?.status).toBe('cancelled')
    expect(backendRequests).toEqual([])

    // --- A guardian: no "Club events" in More, the form refused ---
    await switchBrowserUser(page, request, club, family.guardian.userId, family.guardian.email)
    await page.goto('/club')
    await page.getByTestId('club-bottom-bar').getByText(MORE).click()
    await expect(page.getByTestId('club-more').getByRole('link', { name: CLUB_EVENTS })).toHaveCount(0)
    await page.goto('/club/club-events/new')
    await expect(page.getByText(uiText('auth.accessDenied.title'))).toBeVisible()
    await expect(page.getByTestId('club-event-member-form')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
