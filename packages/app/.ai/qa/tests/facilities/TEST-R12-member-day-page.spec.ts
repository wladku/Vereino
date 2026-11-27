import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { addDays, nextWeekday, zoneInstant } from '../_fixtures/activities'
import {
  expectNoPageOverflow,
  prepareForAccessibilityScan,
  scanInColorSchemes,
  switchColorScheme,
} from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import {
  phoneRental,
  postInternalBooking,
  postRental,
  rentalPitch,
  runRequestProbe,
  staffCalendar,
} from '../_fixtures/facilities'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { getMe, putMe } from '../_fixtures/members'
import { uiText } from '../_fixtures/ui-text'

// Issue #278 (E11-S04), facilities parity spec phase 4, TEST-R12 (REQ-R12, J-R03, AC-R08): the member day page M-11 on
// the day axis. Rafał, the Żaki coach, opens Boisko A at 375 px, picks Saturday and taps 09:00: the slot dialog opens
// at once on "For a group (event)" with 09:00–10:30 and the staff line; he saves a tournament, which is on the axis and
// in "Wpisy dnia" after a reload, and a tap on it opens the details sheet. A rental of KS Sąsiedzi shows the renter's
// name but no phone number (DD-R18). His own general booking is cancelled after a confirmation. Four parallel entries
// scroll sideways inside the axis, never the page. English and Polish, light and dark. #495 (E20-S16): the axis takes the
// mockup's colours (sessions green, closures and maintenance grey), every legend swatch stands out from the page by at
// least 3:1, and the page fits at 320, 375 and 768 px.
test.describe.configure({ timeout: 360_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('TEST-R12 member day page: one tap books a tournament, details sheet, rental without contact, cancel, four lanes', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r12-day')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const pitch = setup.pitch
    const today = calendarDate()
    // A Saturday among the seven day chips when it is not today (09:00 must still lie ahead).
    const saturday = nextWeekday(addDays(today, 1), 'SA')
    const inChips = saturday < addDays(today, 7)

    // Saturday (open 09:00–20:30): a rental of KS Sąsiedzi 15:00–16:30; four held requests side by side from 17:00.
    const rental = await postRental(
      request,
      admin,
      phoneRental(pitch, setup.neighbours, zoneInstant(saturday, '15:00')),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)
    const rentalId = String(rental.body?.id)
    for (const start of ['17:00', '17:15', '17:30', '17:45']) {
      runRequestProbe(club, {
        op: 'seed',
        placeId: pitch,
        startsAt: zoneInstant(saturday, start),
        endsAt: zoneInstant(saturday, '18:30'),
      })
    }

    const coach = await signedInStaff(request, club, { firstName: 'Rafał', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, {
      groupId: setup.zaki,
      personId: coach.personId,
      role: 'coach',
      validFrom: addDays(today, -30),
    })
    const own = await postInternalBooking(request, coach.token, {
      placeId: pitch,
      startsAt: zoneInstant(saturday, '19:00'),
      endsAt: zoneInstant(saturday, '20:00'),
      sectionId: setup.academy,
      purpose: 'Szkolenie bramkarzy',
    })
    expect(own.status, JSON.stringify(own.body)).toBe(201)
    const ownId = String(own.body?.id)

    // Signing in the browser sets a new password, so the coach's API calls below use a fresh token.
    const password = await signInBrowser(page, request, club, coach.userId, coach.email)
    const coachToken = await getAuthToken(request, coach.email, password)
    const me = await getMe(request, coachToken)
    const polish = await putMe(request, coachToken, { preferredLocale: 'pl' }, me.body?.person.updatedAt)
    expect(polish.status, JSON.stringify(polish.body)).toBe(200)

    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // The day page: the name, the long date with the capacity, the hint; Saturday from the chips or "Other day".
    await page.goto(`/club/places/${pitch}`)
    await expect(page.getByTestId('club-place-title')).toHaveText('Boisko A')
    await expect(page.getByTestId('club-place-day-heading')).toContainText(
      uiText('facilities.calendar.capacity.one', { params: { n: 1 } }),
    )
    await expect(page.getByTestId('club-place-hint')).toHaveText(uiText('facilities.places.clickHint', { exact: true }))
    if (inChips) await page.getByTestId(`facilities-calendar-day-${saturday}`).click()
    else await page.getByTestId('facilities-calendar-other-day').fill(saturday)
    await expect(page).toHaveURL(new RegExp(`date=${saturday}`))

    // Four parallel requests: four lanes inside the axis, which scrolls sideways; the page does not.
    const lanes = page.locator('[data-testid^="facilities-axis-entry-"][data-kind="request"]')
    await expect(lanes).toHaveCount(4)
    await expect(lanes.first()).toHaveAttribute('data-lanes', '4')
    const axisScroll = page.getByTestId('facilities-axis-scroll')
    expect(await axisScroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
      0,
    )
    // #495: at 768 px the chips and the "Other day" field share a row, which once stuck out of the page by 15 px.
    await expectNoPageOverflow(page, 768)
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // One tap on 09:00: the dialog at once, "For a group (event)", 09:00–10:30, the staff line; a tournament saved.
    const dialog = page.getByTestId('facilities-slot-dialog')
    await page.getByTestId('facilities-axis-hour-09:00').click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('facilities-slot-kind')).toContainText(
      uiText('facilities.slot.kind.group', { exact: true }),
    )
    await expect(dialog.getByTestId('facilities-slot-start')).toHaveValue('09:00')
    await expect(dialog.getByTestId('facilities-slot-end')).toHaveValue('10:30')
    await expect(dialog.getByTestId('facilities-slot-zone')).toContainText(uiText('facilities.slot.staffImmediate'))
    await expectNoPageOverflow(page)
    await page.setViewportSize({ width: 375, height: 812 })
    // The member bottom bar never covers the dialog's buttons.
    const submit = dialog.getByTestId('facilities-slot-submit')
    await expect(submit).toBeInViewport()
    expect(
      await submit.evaluate((button) => {
        const box = button.getBoundingClientRect()
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return top !== null && button.contains(top)
      }),
    ).toBe(true)
    await dialog.getByTestId('facilities-slot-name').fill('Turniej o Puchar Przykładu')
    await submit.click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(uiText('facilities.slot.saved.group')).first()).toBeVisible()

    // After a reload the tournament is on the axis and in "Wpisy dnia"; a tap on its block opens the details sheet.
    await page.reload()
    const tournamentLine = page
      .locator('[data-testid^="facilities-day-entry-"][data-kind="session"]')
      .filter({ hasText: 'Turniej o Puchar Przykładu' })
    await expect(tournamentLine).toHaveCount(1)
    await expect(tournamentLine).toContainText('09:00–10:30')
    const tournamentBlock = page
      .locator('[data-testid^="facilities-axis-entry-"][data-kind="session"]')
      .filter({ hasText: 'Turniej o Puchar Przykładu' })
    await tournamentBlock.click()
    const details = page.getByTestId('club-place-entry-details')
    await expect(details).toBeVisible()
    await expect(details).toContainText('Turniej o Puchar Przykładu')
    await expect(details.getByTestId('club-place-entry-details-time')).toContainText('09:00–10:30')
    await expect(details.getByTestId('club-place-entry-details-place')).toHaveText('Boisko A')
    await expect(details.getByTestId('club-place-entry-details-group')).toHaveText('Żaki')
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()

    // The rental: the renter's name and status, no contact and no phone number for a coach (DD-R18).
    await page.getByTestId(`facilities-day-entry-open-details-${rentalId}`).click()
    await expect(details).toBeVisible()
    await expect(details).toContainText('KS Sąsiedzi')
    await expect(details.getByTestId('club-place-entry-details-status')).not.toBeEmpty()
    await expect(details.getByTestId('club-place-entry-details-contact')).toHaveCount(0)
    await expect(details.getByTestId('club-place-entry-details-open-rental')).toHaveCount(0)
    await expect(details).not.toContainText('600 000 001')
    await expect(details.locator('a[href^="tel:"]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('body')).not.toContainText('600 000 001')

    // His own general booking: the details offer "Cancel"; a confirmation first, then the entry leaves the axis.
    await page.getByTestId(`facilities-day-entry-open-details-${ownId}`).click()
    await details.getByTestId('club-place-entry-details-cancel').click()
    await expect(details).toBeHidden()
    await expect(page.getByTestId(`facilities-axis-entry-${ownId}`)).toBeVisible()
    await page.getByRole('button', { name: uiText('facilities.places.cancel.confirm', { exact: true }) }).click()
    await expect(page.getByTestId(`facilities-axis-entry-${ownId}`)).toHaveCount(0)
    await expect(page.getByTestId(`facilities-day-entry-${ownId}`)).toHaveCount(0)
    const day = await staffCalendar(
      request,
      coachToken,
      `placeId=${pitch}&from=${zoneInstant(saturday, '00:00')}&to=${zoneInstant(addDays(saturday, 1), '00:00')}`,
    )
    expect((day.body?.entries ?? []).filter((entry) => entry.kind === 'booking')).toEqual([])

    // Light and dark, Polish then English, at 375 px.
    const ready = async () => {
      await expect(page.getByTestId('facilities-day-axis')).toBeVisible()
    }
    expect(await scanInColorSchemes(page, testInfo, '/club/places/[placeId] (pl)', ready)).toEqual({})
    const now = await getMe(request, coachToken)
    const english = await putMe(request, coachToken, { preferredLocale: 'en' }, now.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)
    await page.goto(`/club/places/${pitch}?date=${saturday}`)
    await expect(page.getByTestId('facilities-day-entries')).toContainText('Entries for the day')
    expect(await scanInColorSchemes(page, testInfo, '/club/places/[placeId] (en)', ready)).toEqual({})
    // #495: the mockup's colours on the legend, and every swatch at least 3:1 against the page, light and dark.
    const legend = page.getByTestId('facilities-axis-legend')
    for (const [kind, swatch] of [
      ['session', 'success'],
      ['booking', 'info'],
      ['rental', 'warning'],
      ['closure', 'neutral'],
      ['maintenance', 'neutral'],
    ]) {
      await expect(legend.locator(`[data-legend="${kind}"] [data-swatch]`)).toHaveAttribute('data-swatch', swatch)
    }
    for (const scheme of ['light', 'dark'] as const) {
      await switchColorScheme(page, scheme)
      const weak = (await legendSwatchContrasts(page)).filter((item) => item.ratio < 3)
      expect(weak, `legend swatches under 3:1 (${scheme})`).toEqual([])
    }
    await page.emulateMedia({ colorScheme: 'light' })
    await page.getByTestId('facilities-axis-hour-11:00').click()
    await expect(dialog.getByTestId('facilities-slot-kind')).toContainText('For a group (event)')
    await page.keyboard.press('Escape')
    await expectNoPageOverflow(page)
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})

/**
 * The contrast of each legend swatch with the surface behind it (WCAG 1.4.11): the stronger of its edge and its fill,
 * colours resolved to sRGB through a 1 px canvas, so `oklch()` tokens measure like any other colour.
 */
async function legendSwatchContrasts(page: Page): Promise<{ label: string; ratio: number }[]> {
  return page.getByTestId('facilities-axis-legend').evaluate((legend) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('no 2d canvas')
    const rgba = (colour: string): number[] => {
      context.clearRect(0, 0, 1, 1)
      // A colour the canvas cannot parse leaves `fillStyle` unchanged: start from a sentinel and fail on it.
      context.fillStyle = '#010203'
      context.fillStyle = colour
      if (context.fillStyle === '#010203' && colour.replace(/\s/g, '') !== 'rgb(1,2,3)') {
        throw new Error(`unparsed colour ${colour}`)
      }
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data]
    }
    const surface = (element: Element): number[] => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const colour = rgba(getComputedStyle(node).backgroundColor)
        if (colour[3] === 255) return colour
      }
      return [255, 255, 255, 255]
    }
    const luminance = ([r, g, b]: number[]): number => {
      const [lr, lg, lb] = [r, g, b].map((value) => {
        const channel = value / 255
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
    }
    const contrast = (one: number[], two: number[]): number => {
      const [high, low] = [luminance(one), luminance(two)].sort((a, b) => b - a)
      return (high + 0.05) / (low + 0.05)
    }
    return [...legend.querySelectorAll('li')].map((item) => {
      const swatch = item.querySelector('[data-swatch]')
      if (!swatch) throw new Error(`no swatch in ${item.textContent}`)
      const style = getComputedStyle(swatch)
      const back = surface(item)
      const ratio = Math.max(contrast(rgba(style.borderTopColor), back), contrast(rgba(style.backgroundColor), back))
      return { label: item.textContent.trim(), ratio: Math.round(ratio * 100) / 100 }
    })
  })
}
