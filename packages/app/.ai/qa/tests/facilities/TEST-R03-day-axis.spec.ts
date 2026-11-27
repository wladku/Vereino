import { expect, test, type Page } from '@playwright/test'
import { addDays, createEvent, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import {
  phoneRental,
  postClosure,
  postInternalBooking,
  postRental,
  rentalPitch,
  runRequestProbe,
  setOpeningHours,
} from '../_fixtures/facilities'
import { postMaintenance } from '../_fixtures/maintenance'
import { uiText } from '../_fixtures/ui-text'
import { signInBrowserContext } from '../_fixtures/auth'

// Issue #276 (E11-S02), facilities parity spec phase 2, TEST-R03 and AC-R01 (REQ-R01, REQ-R03; DD-R01–DD-R03): the
// facility calendar B-23 shows one place's whole day on the hour axis. Opened without parameters it writes the first
// bookable place and today into the address; switching the place, a reload and the back button keep the view. On a
// Saturday of Boisko A a session, a club booking, a rental, a held request, two closures and a maintenance window are
// drawn with their labels and listed in "Wpisy dnia" with their actions; the maintenance window and the session it
// flags stand side by side, an entry at 06:00 and one ending at 23:00 widen the axis to 06:00–23:00, and "Do
// przeniesienia" keeps only the flagged session. Boisko B opens only on weekdays and has no zone rule: on Saturday
// the day is closed with no hour button, and the availability card is open and says the place takes no online
// requests. The place form links to the calendar. Desktop and 375 px, English and Polish, light and dark: no blocking
// axe violation and no sideways page scroll.
test.describe.configure({ timeout: 480_000 })
// The browser runs hours behind the club zone (Europe/Warsaw): the axis must place every entry in the club's zone.
test.use({ timezoneId: 'Pacific/Honolulu' })

const WEEKDAYS_ONLY = {
  seasons: [
    {
      from: '01-01',
      to: '12-31',
      windows: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, from: '08:00', to: '22:00' })),
    },
  ],
}

async function axisReady(page: Page) {
  await expect(page.getByTestId('facilities-axis')).toBeVisible()
  await page.waitForLoadState('networkidle')
}

test('TEST-R03 the facility calendar draws one place day on the hour axis and keeps it in the address', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r03-axis')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const pitchA = setup.pitch
    const today = calendarDate()
    const pitchB = await createStructure(request, admin, 'places', { name: 'Boisko B', kind: 'pitch' })
    await setOpeningHours(request, admin, pitchB, WEEKDAYS_ONLY)

    // Saturday of Boisko A (open 09:00–20:30), beyond the seven day chips: "Other day" reaches it.
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const session = await createEvent(request, admin, {
      groupId: setup.zaki,
      type: 'tournament',
      name: 'Turniej Żaków',
      placeId: pitchA,
      startsAt: zoneInstant(saturday, '10:00'),
      endsAt: zoneInstant(saturday, '11:30'),
    })
    expect(session.status, JSON.stringify(session.body)).toBe(201)
    const booking = await postInternalBooking(request, setup.coordinator, {
      placeId: pitchA,
      startsAt: zoneInstant(saturday, '12:00'),
      endsAt: zoneInstant(saturday, '13:30'),
      sectionId: setup.academy,
      purpose: 'Zebranie zarządu',
    })
    expect(booking.status, JSON.stringify(booking.body)).toBe(201)
    const rental = await postRental(
      request,
      admin,
      phoneRental(pitchA, setup.neighbours, zoneInstant(saturday, '15:00')),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)
    const requestId = String(
      runRequestProbe(club, {
        op: 'seed',
        placeId: pitchA,
        startsAt: zoneInstant(saturday, '17:00'),
        endsAt: zoneInstant(saturday, '18:30'),
      }).id,
    )
    const early = await postClosure(request, admin, {
      placeId: pitchA,
      startsAt: zoneInstant(saturday, '06:00'),
      endsAt: zoneInstant(saturday, '07:00'),
      reason: 'snow',
    })
    expect(early.status, JSON.stringify(early.body)).toBe(201)
    const late = await postClosure(request, admin, {
      placeId: pitchA,
      startsAt: zoneInstant(saturday, '21:30'),
      endsAt: zoneInstant(saturday, '23:00'),
      reason: 'snow',
    })
    expect(late.status, JSON.stringify(late.body)).toBe(201)
    // The maintenance window overlaps the session and flags it to be moved.
    const works = await postMaintenance(request, admin, {
      placeId: pitchA,
      kind: 'line_marking',
      scheduleType: 'one_off',
      startsAt: zoneInstant(saturday, '09:30'),
      endsAt: zoneInstant(saturday, '10:30'),
    })
    expect(works.status, JSON.stringify(works.body)).toBe(201)
    expect(works.body?.flagged?.sessions).toBe(1)

    await signInBrowserContext(page.request, club.tenant.email, club.tenant.password)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await prepareForAccessibilityScan(page)

    // Opened without parameters: the first bookable place and today are written into the address.
    // Day by name since #784 (a desktop opens on Week without `range`).
    await page.goto('/backend/facilities/calendar?range=day')
    await expect(page).toHaveURL(new RegExp(`\\?place=[0-9a-f-]+&range=day&date=${today}$`))
    await axisReady(page)
    await expect(page.getByTestId(`facilities-calendar-day-${today}`)).toHaveAttribute('aria-current', 'date')

    // Another place by its chip; a reload keeps it.
    await page.getByTestId(`facilities-calendar-place-${pitchB}`).click()
    await expect(page).toHaveURL(new RegExp(`place=${pitchB}&range=day&date=${today}$`))
    await page.reload()
    await expect(page.getByTestId(`facilities-calendar-place-${pitchB}`)).toHaveAttribute('aria-current', 'true')

    // Boisko B on Saturday: a closed day without hour buttons; no bookable window, so the card is open.
    await page.getByTestId('facilities-calendar-other-day').fill(saturday)
    await expect(page).toHaveURL(new RegExp(`place=${pitchB}&range=day&date=${saturday}$`))
    await axisReady(page)
    await expect(page.getByTestId('facilities-axis-closed')).toHaveText(uiText('facilities.axis.closedDay'))
    await expect(page.locator('[data-testid^="facilities-axis-hour-"]')).toHaveCount(0)
    await expect(page.getByTestId('facilities-availability-card')).toHaveAttribute('open', '')
    await expect(page.getByTestId('facilities-availability-online')).toContainText(
      uiText('facilities.calendar.availabilityCard.noOnline'),
    )
    await expect(page.getByTestId('facilities-calendar-empty')).toBeVisible()

    // Boisko A on Saturday: every kind drawn and listed, the axis widened to 06:00–23:00.
    await page.getByTestId(`facilities-calendar-place-${pitchA}`).click()
    await expect(page).toHaveURL(new RegExp(`place=${pitchA}&range=day&date=${saturday}$`))
    await axisReady(page)
    const axis = page.getByTestId('facilities-axis')
    await expect(axis).toHaveAttribute('data-from', '06:00')
    await expect(axis).toHaveAttribute('data-to', '23:00')
    const list = page.getByTestId('facilities-day-entries')
    for (const kind of ['session', 'booking', 'rental', 'request', 'closure', 'maintenance']) {
      await expect(axis.locator(`[data-kind="${kind}"]`).first()).toBeVisible()
      await expect(list.locator(`[data-kind="${kind}"]`).first()).toBeVisible()
    }
    await expect(axis.locator('[data-kind="closure"]')).toHaveCount(2)
    await expect(page.getByTestId(`facilities-axis-entry-${String(rental.body?.id)}`)).toContainText(
      uiText('facilities.axis.entry.rental', { params: { renter: 'KS Sąsiedzi' } }),
    )
    await expect(page.getByTestId(`facilities-axis-entry-${requestId}`)).toContainText(
      uiText('facilities.axis.entry.request'),
    )
    await expect(page.getByTestId(`facilities-day-entry-${String(booking.body?.id)}`)).toContainText('Zebranie zarządu')
    // The maintenance window and the session it overlaps stand side by side.
    const maintenanceBlock = page.getByTestId(`facilities-axis-entry-${String(works.body?.id)}`)
    const sessionBlock = axis.locator('[data-kind="session"]').first()
    await expect(maintenanceBlock).toHaveAttribute('data-lanes', '2')
    await expect(sessionBlock).toHaveAttribute('data-lanes', '2')
    const lanes = [await maintenanceBlock.getAttribute('data-lane'), await sessionBlock.getAttribute('data-lane')]
    expect(lanes.sort()).toEqual(['0', '1'])
    // Each entry's action in "Wpisy dnia".
    await expect(page.getByTestId(`facilities-day-entry-cancel-${String(booking.body?.id)}`)).toBeVisible()
    await expect(page.getByTestId(`facilities-day-entry-open-${String(rental.body?.id)}`)).toBeVisible()
    await expect(page.getByTestId(`facilities-day-entry-decide-${requestId}`)).toBeVisible()
    await expect(page.getByTestId(`facilities-day-entry-closures-${String(early.body?.id)}`)).toBeVisible()
    await page.getByTestId(`facilities-day-entry-task-${String(works.body?.id)}`).click()
    await expect(page.getByTestId('facilities-maintenance-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('facilities-maintenance-dialog')).toBeHidden()
    // Boisko A has bookable windows: the card opens folded, with the Saturday window.
    await expect(page.getByTestId('facilities-availability-card')).not.toHaveAttribute('open', '')
    await expect(page.getByTestId('facilities-weekly-day-6')).toContainText('09:00–20:30')

    // "Do przeniesienia" keeps the flagged session only.
    await page.getByTestId('facilities-calendar-to-move').click()
    await expect(axis.locator('[data-kind="session"]')).toHaveCount(1)
    await expect(axis.locator('[data-kind="booking"]')).toHaveCount(0)
    await expect(list.locator('[data-kind]')).toHaveCount(1)
    await page.getByTestId('facilities-calendar-to-move').click()

    // The links: to the zones and back restores the place and the day.
    await page.getByTestId('facilities-calendar-zones-link').click()
    await expect(page).toHaveURL(/\/backend\/facilities\/zones/)
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`place=${pitchA}&range=day&date=${saturday}$`))
    await axisReady(page)
    // The arrow keys on the day chips move the day.
    await page.getByTestId('facilities-calendar-day').locator('button').first().focus()
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(new RegExp(`date=${addDays(saturday, 1)}$`))

    // The place form links back to the calendar of its place.
    await page.goto(`/backend/club/places/${pitchA}/edit`)
    await expect(page.getByTestId('club-core-place-zones-link')).toBeVisible()
    await page.getByTestId('club-core-place-calendar-link').click()
    await expect(page).toHaveURL(new RegExp(`place=${pitchA}&date=${today}$`))
    // The link names no view: a desktop opens on Week (#784, DD-W08).
    await expect(page.getByTestId('facilities-calendar-range')).toHaveAttribute('data-range', 'week')
    await expect(page.getByTestId('facilities-week-axes')).toBeVisible()

    // Desktop and 375 px, English and Polish, light and dark: no blocking violation, no sideways page scroll.
    const violations: Record<string, unknown> = {}
    const target = `/backend/facilities/calendar?place=${pitchA}&range=day&date=${saturday}`
    for (const locale of ['en', 'pl']) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: new URL(page.url()).origin }])
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 375, height: 800 },
      ]) {
        await page.setViewportSize(viewport)
        await page.goto(target)
        await axisReady(page)
        Object.assign(
          violations,
          await scanInColorSchemes(page, testInfo, `${locale} ${String(viewport.width)}`, () => axisReady(page), {
            platformBaseline: true,
          }),
        )
        await expectNoPageOverflow(page)
      }
    }
    expect(violations).toEqual({})
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
