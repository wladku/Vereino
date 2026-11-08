import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { postInternalBooking, rentalPitch, staffCalendar } from '../_fixtures/facilities'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { getMe, putMe } from '../_fixtures/members'

// Issue #123 (E08-S03; README M-11 "Facilities and booking"): the staff facility pages from a phone. Wojtek, the Żaki
// coach, opens `/club/places`, sees Boisko A among the club's facilities with today's occupancy, opens it, moves to a
// Saturday, picks a free slot of the 08:00–22:00 timeline and books it for a general purpose; the block appears on the
// timeline with "purpose · booker" and the flash names the day, the time and the place. A range that collides with the
// coordinator's booking is refused with 409 and the dialog lists the collision by name; nothing is booked. Wojtek
// cancels his own booking after a confirmation (the booking's version travels as the lock token). Both pages reflow at
// 320 and 375 px in English and in Polish, without console errors.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('E08-S03 club places: facility cards, day timeline, general-purpose booking, collision list on 409, cancellation', async ({
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Facilities')
    const card = page.getByTestId(`club-places-card-${setup.pitch}`)
    await expect(card).toContainText('Boisko A')
    await expect(card.getByTestId('club-places-card-count')).not.toBeEmpty()
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.getByTestId(`club-places-open-${setup.pitch}`).click()
    await expect(page).toHaveURL(new RegExp(`/club/places/${setup.pitch}`))
    await expect(page.getByTestId('club-place-title')).toHaveText('Boisko A')

    // The day picker moves to Saturday; the timeline shows the zone, the coordinator's block and a free morning.
    await page.getByTestId('club-place-date').fill(saturday)
    await expect(page).toHaveURL(new RegExp(`date=${saturday}`))
    const timeline = page.getByTestId('club-place-timeline')
    await expect(timeline).toContainText('Bookable, paid')
    const meetingBlock = page.getByTestId(`club-place-entry-${String(meeting.body?.id)}`)
    await expect(meetingBlock).toContainText('Zebranie zarządu · Krystyna Koordynator')
    await expect(meetingBlock).toContainText('Internal booking')
    // Wojtek may not cancel the coordinator's booking.
    await expect(page.getByTestId(`club-place-cancel-${String(meeting.body?.id)}`)).toHaveCount(0)
    await expect(page.getByTestId('club-place-legend')).toContainText('Pending request')
    const morning = page.getByTestId('club-place-segment-09:00')
    await expect(morning).toHaveAttribute('data-free', 'true')

    // Picking the free slot fills the range; Wojtek shortens it to 9:00–10:30 and books it for a general purpose.
    await page.getByTestId('club-place-pick-09:00').click()
    await expect(page.getByTestId('club-place-from')).toHaveValue('09:00')
    await expect(page.getByTestId('club-place-to')).toHaveValue('12:00')
    await page.getByTestId('club-place-to').fill('10:30')
    await page.getByTestId('club-place-book').click()
    const dialog = page.getByTestId('club-place-book-dialog')
    await expect(dialog).toBeVisible()
    if (await dialog.getByTestId('club-place-book-mode-general').count()) {
      await dialog.getByTestId('club-place-book-mode-general').click()
    }
    await dialog.getByTestId('club-place-book-purpose').fill('Trening dodatkowy')
    await expect(dialog.getByTestId('club-place-book-section')).toContainText('Akademia piłkarska')
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/facilities/internal-bookings') && response.request().method() === 'POST',
    )
    await dialog.getByTestId('club-place-book-submit').click()
    expect((await created).status()).toBe(201)
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Booked: Sat 9:00–10:30 Boisko A')).toBeVisible()
    const ownBlock = page.locator('[data-kind="booking"]').filter({ hasText: 'Trening dodatkowy' })
    await expect(ownBlock).toHaveCount(1)
    await expect(ownBlock).toContainText('09:00–10:30')
    await expect(ownBlock).toContainText('Trening dodatkowy · Wojtek Trener')

    // A range that collides with the coordinator's booking: 409, the collision named in the dialog, nothing booked.
    await page.getByTestId('club-place-from').fill('12:00')
    await page.getByTestId('club-place-to').fill('13:00')
    await page.getByTestId('club-place-book').click()
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('club-place-book-purpose').fill('Trening bramkarzy')
    const refused = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/facilities/internal-bookings') && response.request().method() === 'POST',
    )
    await dialog.getByTestId('club-place-book-submit').click()
    expect((await refused).status()).toBe(409)
    const conflicts = dialog.getByTestId('club-place-conflicts')
    await expect(conflicts).toContainText('Internal booking · 12:00–13:30 · Zebranie zarządu')
    await expect(dialog).toBeVisible()
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

    // Wojtek cancels his own booking after the confirmation.
    await ownBlock.getByRole('button', { name: /Cancel/ }).click()
    await page.getByRole('button', { name: 'Cancel the booking' }).click()
    await expect(page.getByText('Booking cancelled: Trening dodatkowy')).toBeVisible()
    await expect(ownBlock).toHaveCount(0)
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
    await expect(page.getByTestId('club-place-timeline')).toContainText('Rezerwacja wewnętrzna')
    await expect(page.getByTestId('club-place-legend')).toContainText('Legenda')
    await expect(page.getByTestId('club-place-book')).toHaveText('Zarezerwuj')
    await expectNoPageOverflow(page)
    // The browser logs the expected 409 of the refused booking as a failed resource; nothing else may reach the console.
    expect(consoleErrors.filter((text) => !text.includes('status of 409 (Conflict)'))).toEqual([])
  } finally {
    await club.cleanup()
  }
})
