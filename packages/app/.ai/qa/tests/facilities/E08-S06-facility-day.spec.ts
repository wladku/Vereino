import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan } from '../_fixtures/axe'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { phoneRental, postEntryBan, postRental, rentalPitch } from '../_fixtures/facilities'
import { getMe, putMe } from '../_fixtures/members'

// Issue #126 (E08-S06; README M-12 "Today at the facility", B-27 "Log, incidents, bans"): the club administrator runs
// the day at Boisko A from a phone. On `/club/facility` she opens the facility with the condition before and sees
// "Facility opened {time}"; when a rental of the pitch is still ahead today she records its head count and adult
// supervisor in the log; a 5-character incident description is refused with the 422 message in the dialog, a valid
// one is reported ("Incident reported"); she closes the facility with the condition after. In the panel the day's log,
// the incident and an entry ban linked to it are listed on `/backend/facilities/logs`, `/incidents` and `/bans`; the
// incident offers no delete (incidents are evidence), the active ban is revoked after a confirmation. `/club/facility`
// reflows at 375 px in English and Polish, without console errors.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type List<T> = { items?: T[] }
type IncidentItem = { id: string; description: string | null }

/** Minutes after midnight of now in the club's zone. */
function warsawMinutesNow(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return value('hour') * 60 + value('minute')
}

test('E08-S06 facility day: open, groups, incident with 422, close; log, incidents and bans in the panel', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e08-s06-facility')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()

    // A rental of the pitch later today, when the day still has a bookable evening slot (weekdays 19:30–22:00,
    // weekends until 20:30): its card takes the head count and the adult supervisor.
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
    const rentalStart = weekday === 0 || weekday === 6 ? '19:00' : '20:00'
    const [startHour, startMinute] = rentalStart.split(':').map(Number)
    let rentalId: string | null = null
    if (warsawMinutesNow() < startHour * 60 + startMinute - 10) {
      const rental = await postRental(
        request,
        admin,
        phoneRental(setup.pitch, setup.neighbours, zoneInstant(today, rentalStart)),
      )
      expect(rental.status, JSON.stringify(rental.body)).toBe(201)
      rentalId = String(rental.body?.id)
    }

    // Signing in the browser sets a new password, so the administrator's API calls below use a fresh token.
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    const adminToken = await getAuthToken(request, club.tenant.email, password)
    const me = await getMe(request, adminToken)
    const english = await putMe(request, adminToken, { preferredLocale: 'en' }, me.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)

    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // `/club/places` links to the day at the facility.
    await page.goto('/club/places')
    await page.getByTestId('club-places-facility-today').click()
    await expect(page).toHaveURL(/\/club\/facility/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today at the facility')

    await page.goto(`/club/facility?place=${setup.pitch}`)
    await expect(page.getByTestId('club-facility-place-name')).toHaveText('Boisko A')
    await expect(page.getByTestId('club-facility-state')).toHaveText('The facility has not been opened today.')
    if (!rentalId)
      await expect(page.getByTestId('club-facility-empty')).toHaveText('Nothing is scheduled at the facility today')

    // "Open facility": the condition before is required; then "Facility opened {time}".
    await page.getByTestId('club-facility-open').click()
    const openDialog = page.getByTestId('club-facility-open-dialog')
    await expect(openDialog).toBeVisible()
    await expect(openDialog.getByTestId('club-facility-open-time')).toHaveValue(/^\d{2}:\d{2}$/)
    await openDialog.getByTestId('club-facility-open-submit').click()
    await expect(openDialog).toContainText('Describe the condition of the facility.')
    await openDialog.getByTestId('club-facility-open-condition').fill('Murawa sucha, siatki na miejscu')
    const opened = page.waitForResponse(
      (response) => response.url().endsWith('/api/facilities/logs') && response.request().method() === 'POST',
    )
    await openDialog.getByTestId('club-facility-open-submit').click()
    expect((await opened).status()).toBe(201)
    await expect(openDialog).toBeHidden()
    await expect(page.getByTestId('club-facility-notice')).toContainText(/Facility opened \d{2}:\d{2}/)
    await expect(page.getByTestId('club-facility-state')).toContainText(/Facility opened \d{2}:\d{2}/)
    await expect(page.getByTestId('club-facility-open')).toHaveCount(0)

    // Today's group: 12 people with an adult supervisor, saved into the log.
    if (rentalId) {
      const card = page.getByTestId(`club-facility-entry-${rentalId}`)
      await expect(card).toContainText('KS Sąsiedzi')
      await expect(card.getByTestId('club-facility-entry-no-show')).toHaveCount(0)
      await card.getByTestId('club-facility-entry-headcount').fill('12')
      await card.getByTestId('club-facility-entry-supervisor').click()
      const saved = page.waitForResponse(
        (response) => response.url().endsWith('/api/facilities/logs') && response.request().method() === 'PUT',
      )
      await card.getByTestId('club-facility-entry-save').click()
      expect((await saved).status()).toBe(200)
      await expect(page.getByTestId(`club-facility-entry-${rentalId}`)).toContainText(
        'Saved: 12 people, adult supervisor present',
      )
    }
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // "Report incident": a 5-character description answers 422 in the dialog; a valid one is reported.
    await page.getByTestId('club-facility-incident').click()
    const incidentDialog = page.getByTestId('club-facility-incident-dialog')
    await expect(incidentDialog).toBeVisible()
    await expect(incidentDialog.getByTestId('club-facility-incident-health-hint')).toContainText(
      'Do not enter health information',
    )
    await incidentDialog.getByTestId('club-facility-incident-kind').click()
    await page.getByRole('option', { name: 'Damage' }).click()
    await incidentDialog.getByTestId('club-facility-incident-description').fill('Siatk')
    const refused = page.waitForResponse(
      (response) => response.url().endsWith('/api/facilities/incidents') && response.request().method() === 'POST',
    )
    await incidentDialog.getByTestId('club-facility-incident-submit').click()
    expect((await refused).status()).toBe(422)
    await expect(incidentDialog.getByTestId('club-facility-incident-problem')).toHaveText(
      'The description must have 10–2000 characters.',
    )
    const description = 'Rozdarta siatka w lewej bramce po meczu'
    await incidentDialog.getByTestId('club-facility-incident-description').fill(description)
    await incidentDialog.getByTestId('club-facility-incident-action-warning_given').click()
    await incidentDialog.getByTestId('club-facility-incident-involved').fill('Drużyna gości')
    const reported = page.waitForResponse(
      (response) => response.url().endsWith('/api/facilities/incidents') && response.request().method() === 'POST',
    )
    await incidentDialog.getByTestId('club-facility-incident-submit').click()
    expect((await reported).status()).toBe(201)
    await expect(incidentDialog).toBeHidden()
    await expect(page.getByTestId('club-facility-notice')).toHaveText('Incident reported')

    // "Close facility": the condition after and remarks; then "Facility closed {time}".
    await page.getByTestId('club-facility-close').click()
    const closeDialog = page.getByTestId('club-facility-close-dialog')
    await expect(closeDialog).toBeVisible()
    await closeDialog.getByTestId('club-facility-close-condition').fill('Siatka w lewej bramce do wymiany')
    await closeDialog.getByTestId('club-facility-close-remarks').fill('Brak oświetlenia na sektorze B')
    const closed = page.waitForResponse(
      (response) => response.url().endsWith('/api/facilities/logs') && response.request().method() === 'PUT',
    )
    await closeDialog.getByTestId('club-facility-close-submit').click()
    expect((await closed).status()).toBe(200)
    await expect(closeDialog).toBeHidden()
    await expect(page.getByTestId('club-facility-state')).toContainText(/Facility closed \d{2}:\d{2}/)
    await expect(page.getByTestId('club-facility-close')).toHaveCount(0)
    await expectNoPageOverflow(page)

    // An entry ban linked to the incident, issued through the API.
    const incidents = await call<List<IncidentItem>>(
      request,
      'GET',
      `/api/facilities/incidents?placeId=${setup.pitch}`,
      adminToken,
    )
    expect(incidents.status, JSON.stringify(incidents.body)).toBe(200)
    const incident = (incidents.body?.items ?? []).find((item) => item.description === description)
    expect(incident, JSON.stringify(incidents.body)).toBeTruthy()
    const ban = await postEntryBan(request, adminToken, {
      placeId: setup.pitch,
      subjectType: 'institution',
      subjectId: setup.banned,
      startsOn: today,
      reason: 'Zniszczenie siatki',
      incidentId: incident?.id,
    })
    expect(ban.status, JSON.stringify(ban.body)).toBe(201)

    // The panel: the log, the incident (no delete anywhere) and the ban, revoked after a confirmation.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/backend/facilities/logs')
    const logTable = page.getByTestId('facilities-logs-table')
    await expect(logTable).toContainText('Boisko A')
    await expect(logTable).toContainText(today)
    await expect(logTable).toContainText('Ada Admin')

    await page.goto('/backend/facilities/incidents')
    const incidentTable = page.getByTestId('facilities-incidents-table')
    await expect(incidentTable).toContainText(description)
    await expect(incidentTable).toContainText('Damage')
    await expect(incidentTable).toContainText('Warning given')
    await page
      .getByTestId(`facilities-incident-actions-${String(incident?.id)}`)
      .getByRole('button')
      .click()
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Delete/ })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.goto('/backend/facilities/bans')
    const banTable = page.getByTestId('facilities-bans-table')
    await expect(banTable).toContainText('FC Zakazani')
    await expect(banTable).toContainText('Zniszczenie siatki')
    await expect(banTable).toContainText('Ada Admin')
    await page
      .getByTestId(`facilities-ban-actions-${String(ban.body?.id)}`)
      .getByRole('button')
      .click()
    await expect(page.getByRole('menuitem', { name: /Delete/ })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Revoke' }).click()
    const revoked = page.waitForResponse(
      (response) => response.url().includes('/revoke') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Revoke the ban' }).click()
    expect((await revoked).status()).toBe(200)
    await expect(page.getByTestId('facilities-bans-empty-active')).toBeVisible()
    await page.getByRole('tab', { name: 'Revoked' }).click()
    await expect(page.getByTestId('facilities-bans-table')).toContainText('FC Zakazani')

    // Polish: the page renders in Polish and reflows at 320 px.
    const current = await getMe(request, adminToken)
    const polish = await putMe(request, adminToken, { preferredLocale: 'pl' }, current.body?.person.updatedAt)
    expect(polish.status, JSON.stringify(polish.body)).toBe(200)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/club/facility?place=${setup.pitch}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dziś na obiekcie')
    await expect(page.getByTestId('club-facility-state')).toContainText(/Obiekt zamknięty \d{2}:\d{2}/)
    await expect(page.getByTestId('club-facility-incident')).toHaveText('Zgłoś zdarzenie')
    await expectNoPageOverflow(page)
    // The browser logs the expected 422 of the short description as a failed resource; nothing else may reach it.
    expect(consoleErrors.filter((text) => !text.includes('status of 422'))).toEqual([])
  } finally {
    await club.cleanup()
  }
})
