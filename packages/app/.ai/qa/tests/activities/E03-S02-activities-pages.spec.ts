import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  createActivity,
  getOccurrence,
  juneThirtiethNextYear,
  listOccurrences,
  scheduleFor,
} from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createStaff } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'

// Issue #31 pages (club spec UI table: `/backend/activities/activities` + `create`, `[id]`, `/backend/activities/
// occurrences` + `[id]`, `/backend/activities/events/create`): every page renders its content with no critical or
// serious axe violation outside the platform baseline and no page overflow at 320 px; the list and the session page at
// 375 px in dark mode; the create form previews a series and shows its conflicts before saving and refuses the save
// with the conflict list; a session is cancelled through its page; a member without `activities.view` gets the
// permission-denied state. The browser runs in the club's time zone, so the pages show the club's wall times.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('E03-S02 activities pages: lists, forms and records pass axe and reflow; the create form previews conflicts; a session is cancelled through its page; Access denied without activities.view', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e03-s02-pages')
  try {
    const { pitch, zaki } = await scheduleFor(request, club)
    const today = calendarDate()
    const { id: activityId } = await createActivity(request, club.adminToken, {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    })
    const session = (await listOccurrences(request, club.adminToken, `&activityId=${activityId}`)).items.at(0)
    if (!session) throw new Error('[internal] the series has no session')

    page.setDefaultTimeout(30_000)
    const adminPassword = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    // Setting the password ends the administrator's earlier sessions: later API calls use a fresh token.
    club.adminToken = await getAuthToken(request, club.tenant.email, adminPassword)

    // Accessibility (desktop, light) and reflow at 320 px on every activities page.
    await prepareForAccessibilityScan(page)
    const viewport = { width: 1280, height: 720 }
    const violationsByPage: Record<string, unknown> = {}
    for (const { path, shows } of [
      { path: '/backend/activities/activities', shows: 'Trening Żaków' },
      { path: '/backend/activities/activities/create', shows: /New activity|Nowe zajęcia/ },
      { path: `/backend/activities/activities/${activityId}`, shows: 'Trening Żaków' },
      { path: '/backend/activities/occurrences', shows: 'Trening Żaków' },
      { path: `/backend/activities/occurrences/${session.id}`, shows: 'Trening Żaków' },
      { path: '/backend/activities/events/create', shows: /New one-off event|Nowe wydarzenie/ },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto(path)
      await expect(page.getByText(shows).first()).toBeVisible()
      await expect(page.getByText(/Access Denied|Brak dostępu/)).toHaveCount(0)
      const violations = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      if (violations.length > 0) violationsByPage[path] = violations
      await expectNoPageOverflow(page)
    }
    // The activity record lists its sessions on the "Sessions" tab.
    await page.setViewportSize(viewport)
    await page.goto(`/backend/activities/activities/${activityId}`)
    await page.getByRole('tab', { name: /^Sessions$|^Terminy$/ }).click()
    const sessionsTable = page.getByTestId('activities-sessions-table')
    await expect(sessionsTable).toBeVisible()
    await expect(sessionsTable.getByText('17:00–18:30').first()).toBeVisible()
    const sessionsTab = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
    if (sessionsTab.length > 0)
      violationsByPage[`/backend/activities/activities/${activityId} (sessions)`] = sessionsTab
    expect(violationsByPage).toEqual({})

    // The narrow pass: 375 px in dark mode.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/backend/activities/activities')
    await expect(page.getByRole('heading', { level: 1, name: /^Activities$|^Zajęcia$/ })).toBeVisible()
    await expect(page.getByText('Trening Żaków').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.goto(`/backend/activities/occurrences/${session.id}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Trening Żaków' })).toBeVisible()
    await expect(page.getByTestId('occurrence-cancel-button')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

    // The create form previews an overlapping Orliki series: every Tuesday clashes with the Żaki training.
    await page.setViewportSize(viewport)
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/backend/activities/activities/create')
    // The selects load their options after hydration; open them once the page has settled.
    await page.waitForLoadState('networkidle')
    await page.locator('[data-crud-field-id="groupId"] [role="combobox"]').click()
    await page.getByRole('option', { name: 'Orliki' }).click()
    await page.locator('[data-crud-field-id="name"] input').fill('Trening Orlików')
    await page.locator('[data-crud-field-id="placeId"] [role="combobox"]').click()
    await page.getByRole('option', { name: 'Boisko A' }).click()
    await page.locator('[data-crud-field-id="startTime"] input').fill('18:00')
    await page.locator('[data-crud-field-id="endTime"] input').fill('19:00')
    await page.getByTestId('activities-repeat-weekly').click()
    const tuesday = page.getByTestId('activities-weekday-TU')
    await tuesday.click()
    await expect(tuesday).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('activities-preview-button').click()
    const summary = page.getByTestId('activities-preview-summary')
    await expect(summary).toBeVisible()
    const previewTable = page.getByTestId('activities-preview-table')
    await expect(previewTable.getByText(/^Conflict$|^Kolizja$/).first()).toBeVisible()
    await expect(previewTable.getByText('Trening Żaków').first()).toBeVisible()
    await expect(previewTable.getByText(/^Free$|^Wolne$/)).toHaveCount(0)
    // Saving anyway is refused; the conflict list is shown above the form and nothing is created.
    await page
      .getByRole('button', { name: /^Create$|^Utwórz$/ })
      .first()
      .click()
    const conflicts = page.getByTestId('activities-conflicts')
    await expect(conflicts).toBeVisible()
    await expect(conflicts.getByRole('link', { name: 'Trening Żaków' }).first()).toBeVisible()
    await expect(page).toHaveURL(/\/backend\/activities\/activities\/create$/)

    // Cancelling a session through its page: a reason is required, then the session shows as cancelled.
    await page.goto(`/backend/activities/occurrences/${session.id}`)
    await page.getByTestId('occurrence-cancel-button').click()
    const confirm = page.getByTestId('occurrence-cancel-confirm')
    await expect(confirm).toBeDisabled()
    await page.getByTestId('occurrence-cancel-reason').fill('Boisko zamknięte')
    await confirm.click()
    const cancelled = page.getByTestId('occurrence-cancelled')
    await expect(cancelled).toBeVisible()
    await expect(cancelled).toContainText('Boisko zamknięte')
    await expect(page.getByTestId('occurrence-cancel-button')).toHaveCount(0)
    const stored = await getOccurrence(request, club.adminToken, session.id)
    expect(stored.body).toMatchObject({ status: 'cancelled', cancelReason: 'Boisko zamknięte' })

    // A member without activities.view gets the platform's permission-denied state and no schedule data.
    const member = await createStaff(request, club, {
      firstName: 'Michal',
      lastName: 'Czlonek',
      birthDate: birthDateTurning(30),
    })
    await page.context().clearCookies()
    await signInBrowser(page, request, club, member.userId, member.email)
    for (const path of [
      '/backend/activities/activities',
      `/backend/activities/activities/${activityId}`,
      '/backend/activities/occurrences',
      `/backend/activities/occurrences/${session.id}`,
    ]) {
      await page.goto(path)
      await expect(page.getByText(/Access Denied|Brak dostępu/)).toBeVisible()
      await expect(page.getByText('Trening Żaków')).toHaveCount(0)
    }
  } finally {
    await club.cleanup()
  }
})
