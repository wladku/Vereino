import { expect, test, type Page } from '@playwright/test'
import { addDays, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { createClub } from '../_fixtures/club'
import { create, getOne, update } from '../_fixtures/club-structure'
import { postInternalBooking } from '../_fixtures/facilities'
import { confirmationToken, requestForm, submitRequest, verifyRequest } from '../_fixtures/facility-requests'
import { uniqueAddress } from '../_fixtures/messaging'
import { publish } from '../_fixtures/publication'
import { publicPitch, publicPlaces, publicSchedule } from '../_fixtures/public-places'
import { uiText } from '../_fixtures/ui-text'

// Issue #289 (E11-S15), facilities parity spec phase 15, REQ-R16, TEST-R16, AC-R12, mockup P-03, P-04, P-05: a guest
// on a phone (375 px). P-03 opens with the intro of the club's booking mode and a card per place with
// "address · surface" and the badge "online requests"; with the club's online requests off the intro and the badge
// say "booking by phone"; a club that stops sharing its calendars shows its phone, inside its frame. P-04 names the
// facility owner in the approval notice and, in the current month, lists the days from today ("today" marked, "Show
// earlier days" brings back the rest). P-05 shows the summary of a confirmed request once — the organisation, the
// contact and the e-mail, never the phone, and the estimate payable to the owner — and the reopened link answers 410
// without data (negative case); a request whose slot the club took meanwhile answers 409 with the place's slug and
// "Back to the calendar" opens that place. Every page renders inside the club's frame (its footer); axe finds no
// blocking violation in light and dark mode, in English and Polish.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const OWNER = 'Gmina Przykładowo R16'

type ScheduleBody = {
  owner?: string | null
  days?: Array<{ date: string; opening: unknown[] | null; slots: unknown[] }>
}

async function setLocale(page: Page, locale: 'en' | 'pl') {
  const response = await page.request.post('/api/auth/locale', { data: { locale } })
  expect(response.ok()).toBe(true)
}

/** The club's frame: its footer with the club name. */
async function expectClubFrame(page: Page) {
  await expect(page.getByTestId('public-footer-club')).toBeVisible()
}

test('TEST-R16 public pages: P-03 intro and booking mode, P-04 owner notice and today first, P-05 summary once and the way back', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r16-public-pages')
  try {
    const admin = club.adminToken
    const clubSlug = `test-r16-${club.tenant.organizationId.slice(0, 8)}`
    const setup = await publicPitch(request, club, clubSlug)
    const { placeSlug, day } = setup
    const owner = await create(request, admin, 'institutions', { name: OWNER, type: 'municipality' })
    const place = await getOne(request, admin, 'places', setup.pitch)
    const owned = await update(
      request,
      admin,
      'places',
      { id: setup.pitch, ownerInstitutionId: owner },
      place?.updatedAt,
    )
    expect(owned.status, JSON.stringify(owned.body)).toBe(200)

    // --- API: the places read carries the club's booking mode; the schedule names the owner ---
    const places = await publicPlaces(request, clubSlug)
    expect(places.status, JSON.stringify(places.body)).toBe(200)
    expect(places.body).toMatchObject({ onlineRequests: true })
    const schedule = await publicSchedule(request, clubSlug, placeSlug)
    expect(schedule.status, JSON.stringify(schedule.body)).toBe(200)
    const month = schedule.body as ScheduleBody
    expect(month.owner).toBe(OWNER)

    page.setDefaultTimeout(30_000)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      // The 404, 409 and 410 answers this test provokes are logged by the browser as failed resources; nothing else may be.
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
        consoleErrors.push(message.text())
      }
    })
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // --- P-03 with online requests, both locales, light and dark ---
    for (const locale of ['en', 'pl'] as const) {
      await setLocale(page, locale)
      await page.goto(`/p/${clubSlug}/places`)
      await expect(page.getByTestId('public-places-intro')).toHaveText(
        uiText('facilities.public.places.introOnline', { exact: true }),
      )
      const card = page.getByTestId(`public-place-${placeSlug}`)
      await expect(card.getByTestId(`public-place-${placeSlug}-requests`)).toHaveText(
        uiText('facilities.public.places.onlineRequests', { exact: true }),
      )
      await expectClubFrame(page)
      await expectNoPageOverflow(page)
      const violations = await scanInColorSchemes(page, testInfo, `P-03 ${locale}`, async () => {
        await expect(page.getByTestId('public-places-intro')).toBeVisible()
      })
      expect(violations).toEqual({})
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    }
    await setLocale(page, 'en')

    // --- P-03 by phone: the club's online requests are off ---
    await publish(request, admin, clubSlug, ['places_calendar', 'contact'], { contactPhone: '600 000 000' })
    const byPhone = await publicPlaces(request, clubSlug)
    expect(byPhone.body).toMatchObject({ onlineRequests: false })
    await page.goto(`/p/${clubSlug}/places`)
    await expect(page.getByTestId('public-places-intro')).toHaveText(
      uiText('facilities.public.places.intro', { exact: true }),
    )
    await expect(page.getByTestId(`public-place-${placeSlug}-requests`)).toHaveText(
      uiText('facilities.public.places.byPhone', { exact: true }),
    )
    // P-04 by phone: no approval notice.
    await page.goto(`/p/${clubSlug}/places/${placeSlug}`)
    await expect(page.getByTestId('public-place-title')).toBeVisible()
    await expect(page.getByTestId('public-place-online-notice')).toHaveCount(0)

    // --- P-03 disabled: the club's phone, inside its frame ---
    await publish(request, admin, clubSlug, ['contact'], { contactPhone: '600 000 000' })
    const disabled = await publicPlaces(request, clubSlug)
    expect(disabled.status).toBe(404)
    expect(disabled.body).toMatchObject({ code: 'public_places_disabled', club: { slug: clubSlug } })
    await page.goto(`/p/${clubSlug}/places`)
    await expect(page.getByTestId('public-places-disabled')).toContainText(uiText('facilities.public.disabled.call'))
    await expect(page.getByTestId('public-places-disabled-phone')).toHaveText('600 000 000')
    await expectClubFrame(page)
    // An unknown place of a club that shares its calendars: the 404 inside the club's frame.
    await publish(request, admin, clubSlug, ['places_calendar', 'online_requests', 'contact'], {
      contactPhone: '600 000 000',
    })
    await page.goto(`/p/${clubSlug}/places/no-such-place`)
    await expect(page.getByTestId('public-schedule-not-found')).toBeVisible()
    await expectClubFrame(page)

    // --- P-04 on a phone, the current month: the notice names the owner; the list starts today ---
    for (const locale of ['en', 'pl'] as const) {
      await setLocale(page, locale)
      await page.goto(`/p/${clubSlug}/places/${placeSlug}`)
      await expect(page.getByTestId('public-place-online-notice')).toContainText(
        uiText('facilities.public.schedule.onlineNotice.text', { params: { owner: OWNER } }),
      )
      await expectClubFrame(page)
      const violations = await scanInColorSchemes(page, testInfo, `P-04 ${locale}`, async () => {
        await expect(page.getByTestId('public-place-online-notice')).toBeVisible()
      })
      expect(violations).toEqual({})
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    }
    await setLocale(page, 'en')
    // A phone opens on Day since #784: the month view keeps its list from today (REQ-W04).
    await page.goto(`/p/${clubSlug}/places/${placeSlug}?range=month`)
    const list = page.getByTestId('public-schedule-list')
    await expect(list).toBeVisible()
    const days = month.days ?? []
    const hasContent = (entry: (typeof days)[number]) =>
      entry.slots.length > 0 || (entry.opening !== null && entry.opening.length === 0)
    const today = await page.evaluate(() =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date()),
    )
    const shown = days.filter(hasContent)
    const earlier = shown.filter((entry) => entry.date < today)
    const fromToday = shown.filter((entry) => entry.date >= today)
    if (fromToday.length > 0) {
      await expect(list.locator('[data-testid^="public-schedule-day-"]').first()).toHaveAttribute(
        'data-testid',
        `public-schedule-day-${fromToday[0].date}`,
      )
    }
    if (shown.some((entry) => entry.date === today)) {
      await expect(page.getByTestId(`public-schedule-day-${today}`)).toHaveAttribute('aria-current', 'date')
      await expect(page.getByTestId('public-schedule-today')).toContainText(uiText('facilities.public.schedule.today'))
    }
    if (earlier.length > 0) {
      await expect(page.getByTestId(`public-schedule-day-${earlier[0].date}`)).toHaveCount(0)
      await page.getByTestId('public-schedule-show-earlier').click()
      await expect(page.getByTestId(`public-schedule-day-${earlier[0].date}`)).toBeVisible()
      await expect(page.getByTestId('public-schedule-show-earlier')).toHaveCount(0)
    } else {
      await expect(page.getByTestId('public-schedule-show-earlier')).toHaveCount(0)
    }
    await expectNoPageOverflow(page)

    // --- P-05: a confirmed request shows its summary once ---
    const guest = uniqueAddress('guest-r16')
    const submitted = await submitRequest(clubSlug, placeSlug, requestForm(zoneInstant(day, '14:00'), guest))
    expect(submitted.status, submitted.text).toBe(202)
    const token = await confirmationToken(guest)
    await page.goto(`/p/${clubSlug}/requests/verify/${encodeURIComponent(token)}`)
    await expect(page.getByTestId('public-verify-awaiting')).toBeVisible()
    await expect(page.getByTestId('public-verify-place')).toHaveText('Boisko A')
    await expect(page.getByTestId('public-verify-requester')).toHaveText(`Akademia Gości · Gabriela Gość · ${guest}`)
    await expect(page.getByTestId('public-verify-summary')).not.toContainText('600 100 200')
    await expect(page.getByTestId('public-verify-amount')).toContainText(OWNER)
    await expect(page.getByTestId('public-verify-amount')).toContainText('250')
    await expectClubFrame(page)
    await expectNoPageOverflow(page)
    // The used link: 410 without any data of the request (negative case), still inside the club's frame.
    const reopened = await verifyRequest(token)
    expect(reopened.status, reopened.text).toBe(410)
    expect(reopened.text).not.toContain(guest)
    expect(reopened.text).not.toContain('Akademia')
    expect(reopened.body?.summary).toBeUndefined()
    await page.goto(`/p/${clubSlug}/requests/verify/${encodeURIComponent(token)}`)
    await expect(page.getByTestId('public-verify-expired')).toBeVisible()
    await expect(page.getByTestId('public-verify-requester')).toHaveCount(0)
    await expectClubFrame(page)

    // --- P-05: the slot was taken before the link was opened → "Back to the calendar" of that place ---
    const nextWeek = addDays(day, 7)
    const late = uniqueAddress('guest-r16-late')
    const lateSubmitted = await submitRequest(clubSlug, placeSlug, requestForm(zoneInstant(nextWeek, '13:00'), late))
    expect(lateSubmitted.status, lateSubmitted.text).toBe(202)
    const lateToken = await confirmationToken(late)
    const booking = await postInternalBooking(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(nextWeek, '13:00'),
      endsAt: zoneInstant(nextWeek, '14:00'),
      sectionId: setup.academy,
      purpose: 'Zebranie trenerów',
    })
    expect(booking.status, JSON.stringify(booking.body)).toBe(201)
    const taken = await verifyRequest(lateToken)
    expect(taken.status, taken.text).toBe(409)
    expect(taken.body).toMatchObject({ code: 'slot_unavailable', placeSlug })
    expect(taken.text).not.toContain(late)
    for (const locale of ['en', 'pl'] as const) {
      await setLocale(page, locale)
      await page.goto(`/p/${clubSlug}/requests/verify/${encodeURIComponent(lateToken)}`)
      await expect(page.getByTestId('public-verify-taken')).toBeVisible()
      await expectClubFrame(page)
      const violations = await scanInColorSchemes(page, testInfo, `P-05 taken ${locale}`, async () => {
        await expect(page.getByTestId('public-verify-taken')).toBeVisible()
      })
      expect(violations).toEqual({})
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    }
    await page.getByTestId('public-verify-calendar').click()
    await expect(page).toHaveURL(new RegExp(`/p/${clubSlug}/places/${placeSlug}$`))
    await expect(page.getByTestId('public-place-title')).toHaveText('Boisko A')
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
