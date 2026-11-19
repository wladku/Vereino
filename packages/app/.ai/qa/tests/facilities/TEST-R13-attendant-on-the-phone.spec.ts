import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, createEvent, readNotifications, safeDay, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, call, createClub } from '../_fixtures/club'
import {
  create as createStructure,
  getOne,
  switchBrowserUser,
  signInBrowser,
  update,
} from '../_fixtures/club-structure'
import { getRental, listRentals, rentalPitch, runRequestProbe } from '../_fixtures/facilities'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { getMe, putMe } from '../_fixtures/members'
import { uiText } from '../_fixtures/ui-text'

// Issue #282 (E11-S08), facilities parity spec phase 8, TEST-R13 (REQ-R13, REQ-R14; J-R01, J-R08; AC-R09, AC-R10): Adam
// holds only the facility attendant role, on Boisko A. At 375 px on `/club/facility` the Today tab shows today's
// session with its place, group and coach, and today's rental of KS Sąsiedzi with its contact and a `tel:` link; no
// headcount field until he opens the facility; "No-show" before the rental's start answers "too early" with no API
// call (the browser clock sits at 00:30). He reports an incident about the rental with an entry ban request and a
// photo that fails; the administrator gets one notice; the photo is added again from "Incidents reported today". On
// Saturday's day of Boisko A he taps 10:00 and saves a rental for KS Sąsiedzi found by search, with the quote; on the
// Rentals tab its card opens the rental page, where he corrects the phone number and cancels it; today's rental (no
// charge) is confirmed from its page. A second attendant whose only place was deactivated sees "no facility assigned"
// and no tabs. Polish and English, light and dark, console without errors.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type IncidentItem = { id: string; actionTaken: string[]; involved: string | null }

/** A 1×1 transparent PNG: a photo the incident accepts. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

test('TEST-R13 the attendant on the phone: today rows, too-early no-show, ban request, photo retry, rental by phone', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r13-attendant')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const pitch = setup.pitch
    const today = calendarDate()
    // Two or more days ahead: the Saturday rental by phone is cancelled free of charge only more than 24 hours before
    // its 10:00 start, which a Saturday tomorrow is not on a Friday after 10:00.
    const saturday = safeDay('SA')

    // Today on Boisko A: a session of Żaki with its coach, and a phone rental of KS Sąsiedzi with a contact (stored by
    // the probe, so its time of day never depends on when the test runs; it has no charge).
    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Nowak', role: 'coach' })
    await addMembership(request, admin, {
      groupId: setup.zaki,
      personId: coach.personId,
      role: 'coach',
      validFrom: addDays(today, -30),
    })
    const session = await createEvent(request, admin, {
      groupId: setup.zaki,
      type: 'tournament',
      name: 'Sparing Żaków',
      placeId: pitch,
      startsAt: zoneInstant(today, '10:00'),
      endsAt: zoneInstant(today, '11:30'),
      coachPersonId: coach.personId,
    })
    expect(session.status, JSON.stringify(session.body)).toBe(201)
    const todayRental = String(
      runRequestProbe(club, {
        op: 'rental',
        placeId: pitch,
        startsAt: zoneInstant(today, '12:00'),
        endsAt: zoneInstant(today, '13:30'),
        renterId: setup.neighbours,
        renterDisplayName: 'KS Sąsiedzi',
        contactName: 'Jan Kontakt',
        contactPhone: '600 000 001',
      }).id,
    )

    // The attendant of Boisko A, and a second one whose only place is deactivated afterwards.
    const attendant = await signedInStaff(request, club, {
      firstName: 'Adam',
      lastName: 'Gospodarz',
      role: 'facility_operator',
      placeId: pitch,
    })
    const oldPitch = await createStructure(request, admin, 'places', { name: 'Boisko Stare', kind: 'pitch' })
    const idle = await signedInStaff(request, club, {
      firstName: 'Iza',
      lastName: 'Bezobiektowa',
      role: 'facility_operator',
      placeId: oldPitch,
    })
    const current = await getOne(request, admin, 'places', oldPitch)
    const deactivated = await update(request, admin, 'places', { id: oldPitch, isActive: false }, current?.updatedAt)
    expect(deactivated.status, JSON.stringify(deactivated.body)).toBe(200)

    // Signing in the browser sets a new password, so the attendant's API calls below use a fresh token.
    const password = await signInBrowser(page, request, club, attendant.userId, attendant.email)
    const token = await getAuthToken(request, attendant.email, password)
    const me = await getMe(request, token)
    const polish = await putMe(request, token, { preferredLocale: 'pl' }, me.body?.person.updatedAt)
    expect(polish.status, JSON.stringify(polish.body)).toBe(200)

    const consoleErrors: string[] = []
    page.on('console', (message) => {
      // The photo that is not an image answers 422 on purpose; the browser logs it as a failed resource.
      if (message.type() === 'error' && !message.text().includes('status of 422')) consoleErrors.push(message.text())
    })
    const noShowCalls: string[] = []
    page.on('request', (sent) => {
      if (sent.url().includes('/no-show')) noShowCalls.push(sent.url())
    })
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    // The browser's clock sits at 00:30 of today: every rental of today is still ahead of it.
    await page.clock.setFixedTime(new Date(zoneInstant(today, '00:30')))

    // Today: the session reads "place / group · coach"; the rental its renter, place, contact and a phone link.
    await page.goto('/club/facility')
    await expect(
      page.getByRole('tab', { name: uiText('facilities.facility.tabs.today', { exact: true }) }),
    ).toHaveAttribute('aria-selected', 'true')
    const sessionCard = page.locator('[data-testid^="club-facility-entry-"][data-kind="session"]')
    await expect(sessionCard).toHaveCount(1)
    await expect(sessionCard).toContainText('10:00–11:30')
    await expect(sessionCard).toContainText('Sparing Żaków')
    await expect(sessionCard.getByTestId('club-facility-entry-details')).toHaveText('Boisko A / Żaki · Marek Nowak')
    const rentalCard = page.getByTestId(`club-facility-entry-${todayRental}`)
    await expect(rentalCard).toContainText(
      uiText('facilities.facility.entry.rental', { params: { renter: 'KS Sąsiedzi', place: 'Boisko A' } }),
    )
    await expect(rentalCard.getByTestId('club-facility-entry-contact')).toContainText('Jan Kontakt')
    await expect(rentalCard.getByTestId('club-facility-entry-phone')).toHaveAttribute('href', 'tel:600000001')

    // Not opened yet: no headcount field. "No-show" is there and answers "too early" without calling the API.
    await expect(page.getByTestId('club-facility-entry-headcount')).toHaveCount(0)
    await rentalCard.getByTestId('club-facility-entry-no-show').click()
    await expect(page.getByTestId('club-facility-notice')).toHaveText(uiText('facilities.facility.noShow.tooEarly'))
    expect(noShowCalls).toEqual([])

    // "Open facility": the headcount fields appear on both cards.
    await page.getByTestId('club-facility-open').click()
    const openDialog = page.getByTestId('club-facility-open-dialog')
    await openDialog.getByTestId('club-facility-open-condition').fill('Murawa sucha, siatki na miejscu')
    await openDialog.getByTestId('club-facility-open-submit').click()
    await expect(openDialog).toBeHidden()
    await expect(page.getByTestId('club-facility-entry-headcount')).toHaveCount(2)
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // An incident about today's rental with an entry ban request; its photo is not an image and fails.
    await page.getByTestId('club-facility-incident').click()
    const incidentDialog = page.getByTestId('club-facility-incident-dialog')
    await incidentDialog.getByTestId('club-facility-incident-kind').click()
    await page
      .getByRole('option', { name: uiText('facilities.records.incidentKind.rules_violation', { exact: true }) })
      .click()
    // The time defaults to the browser's pinned 00:30, which the server refuses as future (`incident_time_future`)
    // in a run between 00:00 and 00:25 Warsaw; 00:00 of today is never ahead of the server.
    await incidentDialog.getByTestId('club-facility-incident-time').fill('00:00')
    await incidentDialog.getByTestId('club-facility-incident-description').fill('Bójka po meczu przy lewej bramce')
    await incidentDialog.getByTestId('club-facility-incident-rental').click()
    await page.getByRole('option', { name: /KS Sąsiedzi/ }).click()
    await expect(incidentDialog.getByTestId('club-facility-incident-involved')).toHaveValue('KS Sąsiedzi')
    await incidentDialog.getByTestId('club-facility-incident-ban-request').click()
    await incidentDialog
      .getByTestId('club-facility-incident-photos')
      .setInputFiles({ name: 'zdjecie.png', mimeType: 'image/png', buffer: Buffer.from('not an image at all') })
    const reported = page.waitForResponse(
      (response) => response.url().endsWith('/api/facilities/incidents') && response.request().method() === 'POST',
    )
    await incidentDialog.getByTestId('club-facility-incident-submit').click()
    expect((await reported).status()).toBe(201)
    await expect(incidentDialog).toBeHidden()
    await expect(page.getByTestId('club-facility-notice')).toHaveText(
      uiText('facilities.facility.incident.donePhotosFailed', { params: { count: 1 } }),
    )

    const incidents = await call<{ items?: IncidentItem[] }>(
      request,
      'GET',
      `/api/facilities/incidents?placeId=${pitch}`,
      admin,
    )
    expect(incidents.status, JSON.stringify(incidents.body)).toBe(200)
    const incident = incidents.body?.items?.at(0)
    expect(incident).toMatchObject({ actionTaken: ['entry_ban_requested'], involved: 'KS Sąsiedzi' })
    const incidentId = String(incident?.id)

    // The administrator gets one notice of the request.
    await expect
      .poll(
        async () =>
          (await readNotifications(request, admin)).filter(
            (item) => item.type === 'facilities.entry_ban_requested' && item.sourceEntityId === incidentId,
          ).length,
        { timeout: 60_000 },
      )
      .toBe(1)

    // "Incidents reported today": the photo is added again.
    const incidentRow = page.getByTestId(`club-facility-incident-${incidentId}`)
    await expect(incidentRow.getByTestId('club-facility-incident-photo-count')).toHaveText(
      uiText('facilities.facility.incidents.photos', { params: { count: 0 } }),
    )
    await incidentRow
      .getByTestId('club-facility-incident-add-photo-input')
      .setInputFiles({ name: 'bramka.png', mimeType: 'image/png', buffer: PNG })
    await expect(page.getByTestId('club-facility-notice')).toHaveText(
      uiText('facilities.facility.incidents.photoAdded'),
    )
    await expect(incidentRow.getByTestId('club-facility-incident-photo-count')).toHaveText(
      uiText('facilities.facility.incidents.photos', { params: { count: 1 } }),
    )

    const todayReady = async () => {
      await expect(page.getByTestId('club-facility-entries')).toBeVisible()
    }
    expect(await scanInColorSchemes(page, testInfo, '/club/facility (pl)', todayReady)).toEqual({})
    await page.emulateMedia({ colorScheme: 'light' })

    // A rental by phone (J-R01): Saturday on Boisko A, a tap on 10:00, the renter found by search, the quote.
    await page.goto(`/club/places/${pitch}?date=${saturday}`)
    await page.getByTestId('facilities-axis-hour-10:00').click()
    const dialog = page.getByTestId('facilities-slot-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('facilities-slot-kind')).toContainText(
      uiText('facilities.slot.kind.rental', { exact: true }),
    )
    await dialog.getByPlaceholder(uiText('facilities.slot.renterSearch')).fill('Sąs')
    await page.getByRole('option', { name: /KS Sąsiedzi/ }).click()
    await expect(dialog.getByTestId('facilities-rental-contact-name')).toHaveValue('Jan Kontakt')
    await dialog.getByTestId('facilities-rental-regulations').click()
    await expect(dialog.getByTestId('facilities-rental-quote-amount')).toContainText('250')
    await dialog.getByTestId('facilities-slot-submit').click()
    await expect(dialog).toBeHidden()
    const phoned = (await listRentals(request, token, '&tab=active')).find(
      (rental) => Date.parse(rental.startsAt) === Date.parse(zoneInstant(saturday, '10:00')),
    )
    expect(phoned, 'the rental by phone').toMatchObject({
      renterType: 'institution',
      renterId: setup.neighbours,
      amount: 25_000,
      status: 'requested',
    })
    const phonedId = String(phoned?.id)

    // The Rentals tab: the card of the new rental opens its page.
    await page.goto('/club/facility?tab=rentals')
    const card = page.getByTestId(`club-facility-rental-${phonedId}`)
    await expect(card).toContainText('KS Sąsiedzi · Boisko A')
    await expect(page.getByTestId(`club-facility-rental-${todayRental}`)).toBeVisible()
    await card.click()
    await expect(page).toHaveURL(new RegExp(`/club/facility/rentals/${phonedId}$`))
    const record = page.getByTestId('facilities-rental-record')
    await expect(record).toBeVisible()
    await expect(record.getByTestId('facilities-rental-record-renter')).toHaveCount(0)
    // With a charge the administrator confirms by recording the payment (DD-R09); without one the page confirms.
    await expect(record.getByTestId('facilities-rental-record-confirm')).toHaveCount(phoned?.chargeId ? 0 : 1)

    // The contact's phone corrected.
    await page.locator('[data-crud-field-id="contactPhone"] input').fill('600 000 002')
    await page.getByRole('button', { name: uiText('facilities.rentals.record.save', { exact: true }) }).click()
    await expect.poll(async () => (await getRental(request, token, phonedId)).contactPhone).toBe('600 000 002')
    const recordReady = async () => {
      await expect(page.getByTestId('facilities-rental-record-money')).toBeVisible()
    }
    expect(
      await scanInColorSchemes(page, testInfo, '/club/facility/rentals/[id] (pl)', recordReady, {
        // The rental form is the platform CrudForm, whose 0.9.0 inputs have no accessible name (as on B-24's page).
        platformBaseline: true,
      }),
    ).toEqual({})
    await page.emulateMedia({ colorScheme: 'light' })
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // Cancelled from its page.
    await page.reload()
    await page.getByTestId('facilities-rental-record-cancel').click()
    const cancelDialog = page.getByTestId('facilities-rental-cancel-dialog')
    await cancelDialog.getByTestId('facilities-rental-cancel-confirm').click()
    await expect(cancelDialog).toBeHidden()
    await expect.poll(async () => (await getRental(request, token, phonedId)).status).toBe('cancelled_free')

    // Today's rental has no charge: "Confirm payment" confirms it at once.
    await page.goto(`/club/facility/rentals/${todayRental}`)
    await page.getByTestId('facilities-rental-record-confirm').click()
    await page.getByRole('button', { name: uiText('facilities.rentals.actions.confirm', { exact: true }) }).click()
    await expect.poll(async () => (await getRental(request, token, todayRental)).status).toBe('confirmed')

    // English, on both pages.
    const now = await getMe(request, token)
    const english = await putMe(request, token, { preferredLocale: 'en' }, now.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)
    await page.goto('/club/facility')
    await expect(page.getByTestId('club-facility-entries')).toBeVisible()
    expect(await scanInColorSchemes(page, testInfo, '/club/facility (en)', todayReady)).toEqual({})
    await page.goto(`/club/facility/rentals/${todayRental}`)
    expect(
      await scanInColorSchemes(page, testInfo, '/club/facility/rentals/[id] (en)', recordReady, {
        platformBaseline: true,
      }),
    ).toEqual({})
    expect(consoleErrors).toEqual([])

    // An attendant whose grant names no active place: the state, and no tabs.
    await switchBrowserUser(page, request, club, idle.userId, idle.email)
    await page.goto('/club/facility')
    await expect(page.getByTestId('club-facility-no-places')).toHaveText(
      uiText('facilities.facility.noFacilityAssigned', { exact: true }),
    )
    await expect(page.getByRole('tab')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
