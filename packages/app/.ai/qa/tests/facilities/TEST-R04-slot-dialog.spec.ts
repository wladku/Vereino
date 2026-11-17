import { expect, test, type Locator, type Page } from '@playwright/test'
import { addDays, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { switchBrowserUser } from '../_fixtures/club-structure'
import {
  listRentals,
  phoneRental,
  postInternalBooking,
  postRental,
  postZoneRule,
  rentalPitch,
  runRequestProbe,
  staffCalendar,
} from '../_fixtures/facilities'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// Issue #277 (E11-S03), facilities parity spec phase 3, TEST-R04 (REQ-R02, AC-R02): a tap on a free hour of B-23 opens
// one slot dialog with the kinds the user's features allow. The administrator saves a rental from 09:00 (a renter
// found by search fills the contact and the category of their last rental; `purpose` and `notes` are stored and the
// rental is drawn on the axis); a rental over a club booking lists the colliding entry by name and saves nothing; a
// rental in a non-bookable zone shows `zone_not_reservable` at the start field. A coach of Żaki saves a group event
// over a held external request (the message names the superseded request, and the request becomes `superseded`) and
// a general booking; changing the kind keeps the times. At 375 px the dialog is a sheet without sideways scroll.
test.describe.configure({ timeout: 360_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

async function choose(page: Page, trigger: Locator, name: string | RegExp): Promise<void> {
  await trigger.click()
  await page.getByRole('option', { name }).click()
}

test('TEST-R04 slot dialog: rental, collision, non-bookable zone, group event over a held request, club booking', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r04-slot')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const pitch = setup.pitch
    const today = calendarDate()
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const nextSaturday = addDays(saturday, 7)

    // Saturday: 19:00–20:30 is a public zone (not bookable); a club booking 15:00–16:30; a held request 12:00–13:30.
    const publicZone = await postZoneRule(request, admin, {
      placeId: pitch,
      weekdays: [6],
      timeFrom: '19:00',
      timeTo: '20:30',
      zone: 'public_free',
      priority: 6,
      validFrom: today,
    })
    expect(publicZone.status, JSON.stringify(publicZone.body)).toBe(201)
    const booking = await postInternalBooking(request, setup.coordinator, {
      placeId: pitch,
      startsAt: zoneInstant(saturday, '15:00'),
      endsAt: zoneInstant(saturday, '16:30'),
      sectionId: setup.academy,
      purpose: 'Trening bramkarzy',
    })
    expect(booking.status, JSON.stringify(booking.body)).toBe(201)
    const held = String(
      runRequestProbe(club, {
        op: 'seed',
        placeId: pitch,
        startsAt: zoneInstant(saturday, '12:00'),
        endsAt: zoneInstant(saturday, '13:30'),
      }).id,
    )
    // An earlier rental of KS Sąsiedzi gives the renter search its last category and contact.
    const earlier = await postRental(
      request,
      admin,
      phoneRental(pitch, setup.neighbours, zoneInstant(nextSaturday, '10:00')),
    )
    expect(earlier.status, JSON.stringify(earlier.body)).toBe(201)

    const coach = await signedInStaff(request, club, { firstName: 'Wojtek', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, {
      groupId: setup.zaki,
      personId: coach.personId,
      role: 'coach',
      validFrom: addDays(today, -30),
    })

    const login = await page.request.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password },
    })
    expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      // The two refused saves below answer 409 on purpose; the browser logs each as a failed resource.
      if (message.type() === 'error' && !message.text().includes('status of 409')) consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)
    const dayUrl = `/backend/facilities/calendar?place=${pitch}&date=${saturday}`
    const dialog = page.getByTestId('facilities-slot-dialog')
    const kind = dialog.getByTestId('facilities-slot-kind')

    // The administrator taps 09:00: the rental kind first, 09:00–10:30, the zone line, the focus on "Kind".
    await page.goto(dayUrl)
    await page.getByTestId('facilities-axis-hour-09:00').click()
    await expect(dialog).toBeVisible()
    await expect(kind).toBeFocused()
    await expect(kind).toContainText(uiText('facilities.slot.kind.rental', { exact: true }))
    await expect(dialog.getByTestId('facilities-slot-start')).toHaveValue('09:00')
    await expect(dialog.getByTestId('facilities-slot-end')).toHaveValue('10:30')
    await expect(dialog.getByTestId('facilities-slot-zone')).toContainText(
      uiText('facilities.zones.zone.reservable_paid'),
    )
    await dialog.getByPlaceholder(uiText('facilities.slot.renterSearch')).fill('Sąs')
    await page.getByRole('option', { name: /KS Sąsiedzi/ }).click()
    // The picked renter fills the empty contact and the category of the last rental.
    await expect(dialog.getByTestId('facilities-rental-contact-name')).toHaveValue('Jan Kontakt')
    await expect(dialog.getByTestId('facilities-rental-contact-phone')).toHaveValue('600 000 001')
    await expect(dialog.getByTestId('facilities-rental-category')).toContainText(
      uiText('facilities.rates.category.external_commercial', { exact: true }),
    )
    await choose(page, dialog.getByTestId('facilities-rental-units'), /^2 /)
    await expect(dialog.getByTestId('facilities-slot-end')).toHaveValue('12:00')
    await dialog.getByTestId('facilities-rental-purpose').fill('sparing')
    await dialog.getByTestId('facilities-rental-notes').fill('brama B')
    await dialog.getByTestId('facilities-rental-regulations').click()
    await expect(dialog.getByTestId('facilities-rental-quote-amount')).toContainText('500')
    expect(await scanBlockingViolations(page, testInfo, { platformBaseline: true })).toEqual([])
    await dialog.getByTestId('facilities-slot-submit').click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(uiText('facilities.slot.saved.rental')).first()).toBeVisible()
    const saved = (await listRentals(request, admin, '&tab=active')).find(
      (rental) => Date.parse(rental.startsAt) === Date.parse(zoneInstant(saturday, '09:00')),
    )
    expect(saved).toMatchObject({
      renterType: 'institution',
      renterId: setup.neighbours,
      renterCategory: 'external_commercial',
      units: 2,
      purpose: 'sparing',
      notes: 'brama B',
      contactName: 'Jan Kontakt',
    })
    await expect(page.getByTestId(`facilities-axis-entry-${String(saved?.id)}`)).toBeVisible()

    // A taken slot: a rental 14:00 for two units collides with the club booking; it is listed by name, nothing saved.
    await page.getByTestId('facilities-axis-hour-14:00').click()
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('facilities-slot-renter-mode').click()
    await dialog.getByTestId('facilities-rental-renter-name').fill('Drużyna Firmowa')
    await choose(
      page,
      dialog.getByTestId('facilities-rental-category'),
      uiText('facilities.rates.category.external_commercial', { exact: true }),
    )
    await choose(page, dialog.getByTestId('facilities-rental-units'), /^2 /)
    await dialog.getByTestId('facilities-slot-submit').click()
    const collisions = dialog.getByTestId('facilities-slot-collisions')
    await expect(collisions).toBeVisible()
    await expect(collisions).toContainText(uiText('facilities.slot.slotTaken'))
    await expect(collisions).toContainText('15:00–16:30 Trening bramkarzy')
    await expect(dialog).toBeVisible()
    expect((await listRentals(request, admin, '&tab=active')).map((rental) => rental.renterDisplayName)).not.toContain(
      'Drużyna Firmowa',
    )
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // A non-bookable zone: a rental from 19:00 answers `zone_not_reservable` at the start field.
    await page.getByTestId('facilities-axis-hour-19:00').click()
    await expect(dialog.getByTestId('facilities-slot-zone')).toContainText(uiText('facilities.zones.zone.public_free'))
    await dialog.getByTestId('facilities-slot-renter-mode').click()
    await dialog.getByTestId('facilities-rental-renter-name').fill('Drużyna Wieczorna')
    await choose(
      page,
      dialog.getByTestId('facilities-rental-category'),
      uiText('facilities.rates.category.external_commercial', { exact: true }),
    )
    await dialog.getByTestId('facilities-slot-submit').click()
    await expect(
      dialog.getByTestId('facilities-slot-start-issues').getByTestId('facilities-rental-issue-zone_not_reservable'),
    ).toBeVisible()
    await expect(dialog.getByTestId('facilities-slot-start')).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog).toBeVisible()
    expect((await listRentals(request, admin, '&tab=active')).map((rental) => rental.renterDisplayName)).not.toContain(
      'Drużyna Wieczorna',
    )
    await page.keyboard.press('Escape')

    // The coach: "For a group" first, the times editable to the minute and kept when the kind changes; a group event
    // 13:00–14:30 over the held request (12:00–13:30) names the superseded request, which the subscriber supersedes.
    await switchBrowserUser(page, request, club, coach.userId, coach.email)
    await page.goto(dayUrl)
    await page.getByTestId('facilities-axis-hour-14:00').click()
    await expect(dialog).toBeVisible()
    await expect(kind).toContainText(uiText('facilities.slot.kind.group', { exact: true }))
    await expect(dialog.getByTestId('facilities-slot-end')).toHaveValue('15:30')
    await dialog.getByTestId('facilities-slot-start').fill('13:00')
    await dialog.getByTestId('facilities-slot-end').fill('14:30')
    await choose(page, kind, uiText('facilities.slot.kind.general', { exact: true }))
    await expect(dialog.getByTestId('facilities-slot-end')).toHaveValue('14:30')
    await expect(dialog.getByTestId('facilities-slot-purpose')).toBeVisible()
    await choose(page, kind, uiText('facilities.slot.kind.group', { exact: true }))
    await expect(dialog.getByTestId('facilities-slot-start')).toHaveValue('13:00')
    await dialog.getByTestId('facilities-slot-name').fill('Tu')
    await dialog.getByTestId('facilities-slot-submit').click()
    await expect(dialog.getByText(uiText('facilities.slot.errors.name', { exact: true }))).toBeVisible()
    await dialog.getByTestId('facilities-slot-name').fill('Turniej o Puchar Gwiazdy')
    await dialog.getByTestId('facilities-slot-submit').click()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByText(uiText('facilities.slot.supersededN.one', { params: { n: '1' } })).first(),
    ).toBeVisible()
    await expect.poll(() => runRequestProbe(club, { op: 'status', id: held }).status).toBe('superseded')

    // A general booking from 17:00 at 375 px: a sheet without sideways scroll, saved and drawn.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByTestId('facilities-axis-hour-17:00').click()
    await expect(dialog).toBeVisible()
    await expectNoPageOverflow(page)
    await choose(page, kind, uiText('facilities.slot.kind.general', { exact: true }))
    await expect(dialog.getByTestId('facilities-slot-end')).toHaveValue('18:30')
    await dialog.getByTestId('facilities-slot-purpose').fill('Szkolenie instruktorów')
    await dialog.getByTestId('facilities-slot-submit').click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(uiText('facilities.slot.saved.general')).first()).toBeVisible()
    const day = await staffCalendar(
      request,
      admin,
      `placeId=${pitch}&from=${zoneInstant(saturday, '00:00')}&to=${zoneInstant(addDays(saturday, 1), '00:00')}`,
    )
    const kinds = (day.body?.entries ?? []).map((entry) => [entry.kind, entry.label])
    expect(kinds).toEqual(
      expect.arrayContaining([
        ['rental', 'KS Sąsiedzi'],
        ['session', 'Turniej o Puchar Gwiazdy'],
        ['booking', 'Szkolenie instruktorów'],
      ]),
    )
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
