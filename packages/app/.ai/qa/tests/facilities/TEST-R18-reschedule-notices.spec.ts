import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '../_fixtures/auth'
import { addDays, createEvent, nextWeekday, readNotifications, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { create as createStructure, signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import {
  listClosures,
  listRentals,
  phoneRental,
  postClosure,
  postInternalBooking,
  postRental,
  putClosure,
  rentalPitch,
} from '../_fixtures/facilities'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { postMaintenance } from '../_fixtures/maintenance'
import { getMe, putMe } from '../_fixtures/members'
import { capturedTo } from '../_fixtures/messaging'
import { uiText } from '../_fixtures/ui-text'

// Issue #287 (E11-S13), facilities parity spec REQ-R18, DD-R14, J-R05, TEST-R18, AC-R14: two sessions of the academy
// with their coach, a club booking of another section and a rental with an e-mail lie under one future window. A
// closure tells — once each, in the app and by e-mail — the academy's coordinator and the coach (both sessions), the
// booker (the booking), the club administrator (the rental) and e-mails the renter. Saving the closure again unchanged
// sends nothing; maintenance planned over the same entries is a cause of its own and sends its own messages. B-24's
// `view=to_move` lists the rental. On the phone, in both locales, light and dark: the coordinator's e-mail link opens
// the section calendar's "Needs a new time" view (AC-R14, REQ-A10; #597) and the coach's — who has no such view — the
// place's day filtered "Do przeniesienia" (the fallback link). Moving the closure to 09:00–19:00 (#394) tells the coordinators and the
// coach once more, listing only the session it adds (18:00–19:00), and sends nothing new to the booker, the
// administrators or the renter.
test.describe.configure({ timeout: 420_000 })

type Notice = { id: string; type: string; sourceEntityId?: string | null; linkHref?: string | null }

const STAFF_TYPE = 'facilities.reschedule_needed'
const RENTALS_TYPE = 'facilities.reschedule_needed_rentals'

async function notices(request: APIRequestContext, token: string, causeId: string): Promise<Notice[]> {
  return ((await readNotifications(request, token)) as Notice[]).filter(
    (item) => (item.type === STAFF_TYPE || item.type === RENTALS_TYPE) && item.sourceEntityId === causeId,
  )
}

async function expectNotices(request: APIRequestContext, token: string, causeId: string, type: string, count = 1) {
  await expect
    .poll(async () => (await notices(request, token, causeId)).map((item) => item.type), {
      timeout: 60_000,
      message: `${String(count)} ${type} notice(s) for ${causeId}`,
    })
    .toEqual(Array.from({ length: count }, () => type))
}

const subject = uiText('facilities.email.reschedule.subject')
const renterSubject = uiText('facilities.email.rescheduleRenter.subject')

function mails(address: string, pattern: RegExp) {
  return capturedTo([address]).filter((message) => pattern.test(message.subject))
}

async function expectMails(address: string, pattern: RegExp, count: number) {
  await expect
    .poll(() => mails(address, pattern).length, {
      timeout: 60_000,
      message: `${String(count)} e-mail(s) to ${address}`,
    })
    .toBe(count)
  return mails(address, pattern)
}

test('TEST-R18 a closure and a maintenance window tell the coordinator, coach, booker, administrators and renter once each', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-r18-reschedule')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const academyCoordinator = await signedInStaff(request, club, {
      firstName: 'Aleksandra',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: setup.academy,
    })
    const coach = await signedInStaff(request, club, { firstName: 'Rafał', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, {
      groupId: setup.zaki,
      personId: coach.personId,
      role: 'coach',
      validFrom: addDays(today, -30),
    })
    const volleyball = await createStructure(request, admin, 'sections', { name: 'Siatkówka' })
    const booker = await signedInStaff(request, club, {
      firstName: 'Basia',
      lastName: 'Rezerwująca',
      role: 'coordinator',
      sectionId: volleyball,
    })
    const renterEmail = `renter-${String(Date.now())}@example.org`

    // Saturday on the pitch: two sessions of Żaki with their coach, a booking of the volleyball section, a rental with
    // an e-mail — all under the closure; one more session at 18:00, after it.
    const sessions: string[] = []
    for (const [start, end] of [
      ['10:00', '11:00'],
      ['11:00', '12:00'],
      ['18:00', '19:00'],
    ]) {
      const event = await createEvent(request, admin, {
        groupId: setup.zaki,
        type: 'tournament',
        name: `Turniej Żaków ${start}`,
        placeId: setup.pitch,
        startsAt: zoneInstant(saturday, start),
        endsAt: zoneInstant(saturday, end),
        coachPersonId: coach.personId,
      })
      expect(event.status, JSON.stringify(event.body)).toBe(201)
      sessions.push(String(event.body?.occurrenceId))
    }
    const booking = await postInternalBooking(request, booker.token, {
      placeId: setup.pitch,
      startsAt: zoneInstant(saturday, '13:00'),
      endsAt: zoneInstant(saturday, '14:30'),
      sectionId: volleyball,
      purpose: 'Trening siatkówki plażowej',
    })
    expect(booking.status, JSON.stringify(booking.body)).toBe(201)
    const rental = await postRental(request, admin, {
      ...phoneRental(setup.pitch, setup.neighbours, zoneInstant(saturday, '15:00')),
      contactEmail: renterEmail,
    })
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)

    // The closure: 2 sessions, 1 booking, 1 rental flagged; one message per person.
    const closure = await postClosure(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(saturday, '09:00'),
      endsAt: zoneInstant(saturday, '17:00'),
      reason: 'municipal_event',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    expect(closure.body?.flagged).toEqual({ sessions: 2, rentals: 1, bookings: 1 })
    const closureId = String(closure.body?.id)
    await expectNotices(request, academyCoordinator.token, closureId, STAFF_TYPE)
    await expectNotices(request, setup.coordinator, closureId, STAFF_TYPE)
    await expectNotices(request, coach.token, closureId, STAFF_TYPE)
    await expectNotices(request, booker.token, closureId, STAFF_TYPE)
    await expectNotices(request, admin, closureId, RENTALS_TYPE)
    const [coordinatorMail] = await expectMails(academyCoordinator.email, subject, 1)
    expect(coordinatorMail.text).toContain('10:00–11:00')
    expect(coordinatorMail.text).toContain('11:00–12:00')
    expect(coordinatorMail.text).not.toContain('18:00–19:00')
    expect(coordinatorMail.text).not.toContain('Jan Kontakt')
    const rescheduleLink = coordinatorMail.links.find((link) => link.includes('/club/calendar'))
    expect(rescheduleLink).toContain(`/club/calendar?as=coordinator&view=reschedule&section=${setup.academy}`)
    expect(coordinatorMail.links.some((link) => link.includes('/club/places/'))).toBe(false)
    const [coachMail] = await expectMails(coach.email, subject, 1)
    expect(coachMail.text).toContain('10:00–11:00')
    expect(coachMail.text).toContain('11:00–12:00')
    const dayLink = coachMail.links.find((link) => link.includes(`/club/places/${setup.pitch}`))
    expect(dayLink).toContain(`date=${saturday}`)
    expect(dayLink).toContain('view=to_move')
    const [bookerMail] = await expectMails(booker.email, subject, 1)
    expect(bookerMail.text).toContain('13:00–14:30')
    expect(bookerMail.text).not.toContain('10:00–11:00')
    const [renterMail] = await expectMails(renterEmail, renterSubject, 1)
    expect(renterMail.text).toContain('Boisko A')

    // Saved again unchanged: nothing is flagged and nothing is sent.
    const saved = (await listClosures(request, admin, `&placeId=${setup.pitch}`)).find((row) => row.id === closureId)
    const again = await putClosure(
      request,
      admin,
      {
        id: closureId,
        placeId: setup.pitch,
        startsAt: zoneInstant(saturday, '09:00'),
        endsAt: zoneInstant(saturday, '17:00'),
        reason: 'municipal_event',
      },
      saved?.updatedAt,
    )
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body?.flagged).toEqual({ sessions: 0, rentals: 0, bookings: 0 })

    // Maintenance over the same entries is a cause of its own: its own message to each person.
    const maintenance = await postMaintenance(request, admin, {
      placeId: setup.pitch,
      kind: 'line_marking',
      scheduleType: 'one_off',
      startsAt: zoneInstant(saturday, '09:30'),
      endsAt: zoneInstant(saturday, '16:30'),
    })
    expect(maintenance.status, JSON.stringify(maintenance.body)).toBe(201)
    const maintenanceId = String(maintenance.body?.id)
    await expectNotices(request, academyCoordinator.token, maintenanceId, STAFF_TYPE)
    await expectNotices(request, coach.token, maintenanceId, STAFF_TYPE)
    await expectNotices(request, booker.token, maintenanceId, STAFF_TYPE)
    await expectNotices(request, admin, maintenanceId, RENTALS_TYPE)
    await expectMails(academyCoordinator.email, subject, 2)
    await expectMails(coach.email, subject, 2)
    await expectMails(booker.email, subject, 2)
    await expectMails(renterEmail, renterSubject, 2)
    // Still one per closure: the unchanged save sent nothing.
    for (const token of [academyCoordinator.token, coach.token, booker.token, admin]) {
      expect(await notices(request, token, closureId)).toHaveLength(1)
    }

    // B-24 "Do przeniesienia" lists the rental.
    const toMove = await listRentals(request, admin, '&view=to_move')
    expect(toMove.map((row) => row.id)).toContain(String(rental.body?.id))

    // The coordinator opens the e-mail's link on the phone: "Needs a new time" of the academy, its flagged sessions only.
    const password = await signInBrowser(page, request, club, academyCoordinator.userId, academyCoordinator.email)
    const coordinatorToken = await getAuthToken(request, academyCoordinator.email, password)
    const me = await getMe(request, coordinatorToken)
    const polish = await putMe(request, coordinatorToken, { preferredLocale: 'pl' }, me.body?.person.updatedAt)
    expect(polish.status, JSON.stringify(polish.body)).toBe(200)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(new URL(String(rescheduleLink)).pathname + new URL(String(rescheduleLink)).search)
    const sessionItem = (id: string) => page.locator(`[data-testid="calendar-item"][data-item-id="${id}"]`)
    const rescheduleTab = () =>
      page.getByRole('tab', { name: uiText('activities.club.section.view.reschedule', { exact: true }) })
    const rescheduleReady = async () => {
      await expect(sessionItem(sessions[0])).toBeVisible()
    }
    await expect(rescheduleTab()).toHaveAttribute('aria-selected', 'true')
    await expect(sessionItem(sessions[0])).toBeVisible()
    await expect(sessionItem(sessions[1])).toBeVisible()
    await expect(sessionItem(sessions[2])).toHaveCount(0)
    expect(
      await scanInColorSchemes(page, testInfo, '/club/calendar?as=coordinator&view=reschedule (pl)', rescheduleReady),
    ).toEqual({})
    const now = await getMe(request, coordinatorToken)
    const english = await putMe(request, coordinatorToken, { preferredLocale: 'en' }, now.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)
    await page.reload()
    await expect(rescheduleTab()).toHaveAttribute('aria-selected', 'true')
    expect(
      await scanInColorSchemes(page, testInfo, '/club/calendar?as=coordinator&view=reschedule (en)', rescheduleReady),
    ).toEqual({})
    await page.emulateMedia({ colorScheme: 'light' })
    await expectNoPageOverflow(page)

    // The coach opens their e-mail's link on the phone: the fallback, the day with only the entries to be moved.
    const coachPassword = await switchBrowserUser(page, request, club, coach.userId, coach.email)
    const coachToken = await getAuthToken(request, coach.email, coachPassword)
    const coachMe = await getMe(request, coachToken)
    const coachPolish = await putMe(request, coachToken, { preferredLocale: 'pl' }, coachMe.body?.person.updatedAt)
    expect(coachPolish.status, JSON.stringify(coachPolish.body)).toBe(200)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(new URL(String(dayLink)).pathname + new URL(String(dayLink)).search)
    await expect(page.getByTestId('club-place-title')).toHaveText('Boisko A')
    await expect(page.getByTestId('club-place-to-move')).toBeChecked()
    await expect(page.getByTestId(`facilities-day-entry-${sessions[0]}`)).toBeVisible()
    await expect(page.getByTestId(`facilities-day-entry-${sessions[1]}`)).toBeVisible()
    await expect(page.getByTestId(`facilities-day-entry-${sessions[2]}`)).toHaveCount(0)
    const ready = async () => {
      await expect(page.getByTestId('facilities-day-axis')).toBeVisible()
    }
    expect(await scanInColorSchemes(page, testInfo, '/club/places/[placeId]?view=to_move (pl)', ready)).toEqual({})
    const coachNow = await getMe(request, coachToken)
    const coachEnglish = await putMe(request, coachToken, { preferredLocale: 'en' }, coachNow.body?.person.updatedAt)
    expect(coachEnglish.status, JSON.stringify(coachEnglish.body)).toBe(200)
    await page.reload()
    await expect(page.getByTestId('club-place-to-move')).toBeChecked()
    expect(await scanInColorSchemes(page, testInfo, '/club/places/[placeId]?view=to_move (en)', ready)).toEqual({})
    await page.emulateMedia({ colorScheme: 'light' })
    // Clearing the filter shows the whole day again and keeps the date.
    await page.getByTestId('club-place-to-move').click()
    await expect(page).toHaveURL(new RegExp(`date=${saturday}$`))
    await expect(page.getByTestId(`facilities-day-entry-${sessions[2]}`)).toBeVisible()
    await expectNoPageOverflow(page)
    expect(consoleErrors).toEqual([])

    // The closure moved to 09:00–19:00 (#394): only the 18:00 session is new to it, so the academy's coordinators and
    // the coach get one more message listing it alone; the booker, the administrators and the renter get nothing new.
    // The academy coordinator and the coach signed in above, which ended their first API tokens: read as
    // `coordinatorToken` and `coachToken`.
    const current = (await listClosures(request, admin, `&placeId=${setup.pitch}`)).find((row) => row.id === closureId)
    const moved = await putClosure(
      request,
      admin,
      {
        id: closureId,
        placeId: setup.pitch,
        startsAt: zoneInstant(saturday, '09:00'),
        endsAt: zoneInstant(saturday, '19:00'),
        reason: 'municipal_event',
      },
      current?.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body?.flagged).toEqual({ sessions: 1, rentals: 0, bookings: 0 })
    await expectNotices(request, coordinatorToken, closureId, STAFF_TYPE, 2)
    await expectNotices(request, setup.coordinator, closureId, STAFF_TYPE, 2)
    await expectNotices(request, coachToken, closureId, STAFF_TYPE, 2)
    for (const mailbox of [academyCoordinator.email, coach.email]) {
      const movedMail = (await expectMails(mailbox, subject, 3)).at(-1)
      expect(movedMail?.text).toContain('18:00–19:00')
      expect(movedMail?.text).not.toContain('10:00–11:00')
      expect(movedMail?.text).not.toContain('11:00–12:00')
    }
    expect(await notices(request, booker.token, closureId)).toHaveLength(1)
    expect(await notices(request, admin, closureId)).toHaveLength(1)
    expect(mails(booker.email, subject)).toHaveLength(2)
    expect(mails(renterEmail, renterSubject)).toHaveLength(2)
  } finally {
    await club.cleanup()
  }
})
