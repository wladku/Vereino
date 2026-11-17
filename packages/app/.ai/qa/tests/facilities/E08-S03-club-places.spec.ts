import { expect, test, type Locator, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { postInternalBooking, rentalPitch, staffCalendar } from '../_fixtures/facilities'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { getMe, putMe } from '../_fixtures/members'
import { uiText } from '../_fixtures/ui-text'

// Issue #123 (E08-S03; README M-11 "Facilities and booking"), moved to the day axis by #278 (E11-S04): the staff
// facility pages from a phone. Wojtek, the Żaki coach, opens `/club/places`, sees Boisko A among the club's facilities
// with today's occupancy, opens it, moves to a Saturday with "Other day", taps the free 09:00 and books it for a
// general purpose in the slot dialog; the entry appears on the axis and in "Wpisy dnia" with "purpose · booker". A
// booking from 11:00 runs into the coordinator's booking: 409, the dialog lists the collision by name, nothing is
// booked. Wojtek opens his own booking's details and cancels it after a confirmation (the booking's version travels as
// the lock token). Both pages reflow at 320 and 375 px in English and in Polish, without console errors.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

async function choose(page: Page, trigger: Locator, name: RegExp): Promise<void> {
  await trigger.click()
  await page.getByRole('option', { name }).click()
}

test('E08-S03 club places: facility cards, day axis, one-tap general booking, collision list on 409, cancellation', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e08-s03-places')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()
    const wojtek = await signedInStaff(request, club, { firstName: 'Wojtek', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, {
      groupId: setup.zaki,
      personId: wojtek.personId,
      role: 'coach',
      validFrom: addDays(today, -30),
    })
    // Saturday: open 09:00–20:30, bookable and paid all day (the fixture's availability). The coordinator holds
    // 12:00–13:30 with a booking of her own.
    const saturday = nextWeekday(addDays(today, 3), 'SA')
    const meeting = await postInternalBooking(request, setup.coordinator, {
      placeId: setup.pitch,
      startsAt: zoneInstant(saturday, '12:00'),
      endsAt: zoneInstant(saturday, '13:30'),
      sectionId: setup.academy,
      purpose: 'Zebranie zarządu',
    })
    expect(meeting.status, JSON.stringify(meeting.body)).toBe(201)
    const meetingId = String(meeting.body?.id)

    // Signing in the browser sets a new password, so Wojtek's API calls below use a fresh token.
    const password = await signInBrowser(page, request, club, wojtek.userId, wojtek.email)
    const wojtekToken = await getAuthToken(request, wojtek.email, password)
    const me = await getMe(request, wojtekToken)
    const english = await putMe(request, wojtekToken, { preferredLocale: 'en' }, me.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)

    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // `/club/places`: the card of Boisko A with today's occupancy, linking to the place.
    await page.goto('/club/places')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(uiText('facilities.places.title', { exact: true }))
    const card = page.getByTestId(`club-places-card-${setup.pitch}`)
    await expect(card).toContainText('Boisko A')
    await expect(card.getByTestId('club-places-card-count')).not.toBeEmpty()
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByTestId(`club-places-open-${setup.pitch}`).click()
    await expect(page).toHaveURL(new RegExp(`/club/places/${setup.pitch}`))
    await expect(page.getByTestId('club-place-title')).toHaveText('Boisko A')
    await expect(page.getByTestId('club-place-hint')).toHaveText(uiText('facilities.places.clickHint', { exact: true }))

    // "Other day" moves to Saturday; the axis shows the zone legend and the coordinator's entry; Wojtek may not cancel it.
    await page.getByTestId('facilities-calendar-other-day').fill(saturday)
    await expect(page).toHaveURL(new RegExp(`date=${saturday}`))
    await expect(page.getByTestId('facilities-axis-legend')).toContainText(
      uiText('facilities.zones.zone.reservable_paid'),
    )
    const meetingLine = page.getByTestId(`facilities-day-entry-${meetingId}`)
    await expect(meetingLine).toContainText('Zebranie zarządu · Krystyna Koordynator')
    await expect(meetingLine).toContainText(uiText('facilities.places.kind.booking'))
    await expect(page.getByTestId(`facilities-axis-entry-${meetingId}`)).toBeVisible()
    await expect(page.getByTestId('facilities-axis-hour-12:00')).toHaveCount(0)
    await page.getByTestId(`facilities-day-entry-open-details-${meetingId}`).click()
    const details = page.getByTestId('club-place-entry-details')
    await expect(details).toBeVisible()
    await expect(details.getByTestId('club-place-entry-details-place')).toHaveText('Boisko A')
    await expect(details.getByTestId('club-place-entry-details-cancel')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()

    // One tap on 09:00 opens the slot dialog: "For a group" first (Wojtek coaches Żaki), 09:00–10:30; he switches to
    // the general purpose and books it.
    const dialog = page.getByTestId('facilities-slot-dialog')
    const kind = dialog.getByTestId('facilities-slot-kind')
    await page.getByTestId('facilities-axis-hour-09:00').click()
    await expect(dialog).toBeVisible()
    await expect(kind).toContainText(uiText('facilities.slot.kind.group', { exact: true }))
    await expect(dialog.getByTestId('facilities-slot-start')).toHaveValue('09:00')
    await expect(dialog.getByTestId('facilities-slot-end')).toHaveValue('10:30')
    await choose(page, kind, uiText('facilities.slot.kind.general', { exact: true }))
    await dialog.getByTestId('facilities-slot-purpose').fill('Trening dodatkowy')
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/facilities/internal-bookings') && response.request().method() === 'POST',
    )
    await dialog.getByTestId('facilities-slot-submit').click()
    expect((await created).status()).toBe(201)
    await expect(dialog).toBeHidden()
    await expect(page.getByText(uiText('facilities.slot.saved.general')).first()).toBeVisible()
    const ownLine = page.locator('[data-testid^="facilities-day-entry-"][data-kind="booking"]').filter({
      hasText: 'Trening dodatkowy',
    })
    await expect(ownLine).toHaveCount(1)
    await expect(ownLine).toContainText('09:00–10:30')
    await expect(ownLine).toContainText('Trening dodatkowy · Wojtek Trener')
    await expect(
      page.locator('[data-testid^="facilities-axis-entry-"]').filter({ hasText: 'Trening dodatkowy' }),
    ).toHaveCount(1)

    // 11:00 with the default 90 minutes runs into the coordinator's booking: 409, the collision named, nothing booked.
    await page.getByTestId('facilities-axis-hour-11:00').click()
    await expect(dialog).toBeVisible()
    await choose(page, kind, uiText('facilities.slot.kind.general', { exact: true }))
    await dialog.getByTestId('facilities-slot-purpose').fill('Trening bramkarzy')
    const refused = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/facilities/internal-bookings') && response.request().method() === 'POST',
    )
    await dialog.getByTestId('facilities-slot-submit').click()
    expect((await refused).status()).toBe(409)
    const collisions = dialog.getByTestId('facilities-slot-collisions')
    await expect(collisions).toContainText(uiText('facilities.slot.slotTaken'))
    await expect(collisions).toContainText('12:00–13:30 Zebranie zarządu')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    const calendarQuery = `from=${encodeURIComponent(zoneInstant(saturday, '00:00'))}&to=${encodeURIComponent(zoneInstant(addDays(saturday, 1), '00:00'))}&placeId=${setup.pitch}`
    const afterRefusal = await staffCalendar(request, wojtekToken, calendarQuery)
    expect(afterRefusal.status, JSON.stringify(afterRefusal.body)).toBe(200)
    expect(
      (afterRefusal.body?.entries ?? []).filter((entry) => entry.kind === 'booking').map((entry) => entry.label),
    ).toEqual(['Trening dodatkowy', 'Zebranie zarządu'])

    // The 375 px and 320 px reflow of the day.
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // Wojtek opens his own booking and cancels it after the confirmation.
    await ownLine.getByRole('button').first().click()
    await expect(details).toBeVisible()
    await expect(details.getByTestId('club-place-entry-details-time')).toContainText('09:00–10:30')
    await details.getByTestId('club-place-entry-details-cancel').click()
    await expect(details).toBeHidden()
    await page.getByRole('button', { name: uiText('facilities.places.cancel.confirm', { exact: true }) }).click()
    await expect(
      page.getByText(uiText('facilities.places.cancel.done', { params: { label: 'Trening dodatkowy' } })),
    ).toBeVisible()
    await expect(ownLine).toHaveCount(0)
    const afterCancel = await staffCalendar(request, wojtekToken, calendarQuery)
    expect(
      (afterCancel.body?.entries ?? []).filter((entry) => entry.kind === 'booking').map((entry) => entry.label),
    ).toEqual(['Zebranie zarządu'])

    // Polish: both pages render in Polish and reflow at 320 px.
    const current = await getMe(request, wojtekToken)
    const polish = await putMe(request, wojtekToken, { preferredLocale: 'pl' }, current.body?.person.updatedAt)
    expect(polish.status, JSON.stringify(polish.body)).toBe(200)
    await page.goto('/club/places')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Obiekty')
    await expect(page.getByTestId(`club-places-card-${setup.pitch}`)).toContainText('Boisko A')
    await expectNoPageOverflow(page)
    await page.goto(`/club/places/${setup.pitch}?date=${saturday}`)
    await expect(page.getByTestId('facilities-day-entries')).toContainText('Wpisy dnia')
    await expect(meetingLine).toContainText('Rezerwacja wewnętrzna')
    await expect(page.getByTestId('facilities-axis-legend')).toContainText('Legenda')
    await expectNoPageOverflow(page)
    // The browser logs the expected 409 of the refused booking as a failed resource; nothing else may reach the console.
    expect(consoleErrors.filter((text) => !text.includes('status of 409 (Conflict)'))).toEqual([])
  } finally {
    await club.cleanup()
  }
})
