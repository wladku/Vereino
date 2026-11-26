import { expect, test } from '@playwright/test'
import {
  addDays,
  createActivity,
  createEvent,
  juneThirtiethNextYear,
  listOccurrences,
  nextWeekday,
  runGenerator,
  scheduleFor,
  zoneInstant,
} from '../_fixtures/activities'
import { expectNoPageOverflow } from '../_fixtures/axe'
import { calendarDate, createClub } from '../_fixtures/club'
import { create as createStructure, switchBrowserUser } from '../_fixtures/club-structure'
import { ORLIK_HOURS, setOpeningHours } from '../_fixtures/facilities'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// Issue #288 (E11-S14), facilities parity spec phase 14, TEST-R19 (REQ-R19, DD-R15, AC-R15): a one-off group event on a
// club place lies inside the place's opening windows of its day. On a pitch open 08:00–22:00 on weekdays an event at
// 07:00–09:00 answers 409 `event_place_closed` with the day's windows at `startsAt`, one at 09:00–11:00 201; a hall
// without opening hours takes an event at 06:00, and an event at a typed venue (REQ-A08) at 07:00 is not checked. A
// weekly series at 07:00 on the pitch is not affected: the daily generator still extends it. In the slot dialog of
// the pitch's day axis at 375 px, a coach's event at 07:00 shows the refusal with "08:00–22:00" at the start field in
// English and Polish, and saves nothing.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('TEST-R19 a one-off event outside the pitch opening hours is refused with the day hours; a hall without hours, a typed venue and a weekly series at 07:00 are not', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-r19-hours')
  try {
    const admin = club.adminToken
    const setup = await scheduleFor(request, club)
    const { pitch, zaki, orliki, coordinator } = setup
    await setOpeningHours(request, admin, pitch, ORLIK_HOURS)
    const hall = await createStructure(request, admin, 'places', { name: 'Hala sportowa', kind: 'hall' })
    const today = calendarDate()
    const tuesday = nextWeekday(addDays(today, 7), 'TU')
    const event = (placeOrVenue: Record<string, unknown>, from: string, to: string, name: string) => ({
      groupId: zaki,
      type: 'tournament',
      name,
      ...placeOrVenue,
      startsAt: zoneInstant(tuesday, from),
      endsAt: zoneInstant(tuesday, to),
    })

    // Before opening: 409 with the day's windows at the start field; nothing is saved.
    const early = await createEvent(
      request,
      coordinator,
      event({ placeId: pitch }, '07:00', '09:00', 'Turniej poranny'),
    )
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body).toMatchObject({
      code: 'event_place_closed',
      field: 'startsAt',
      opening: [{ from: '08:00', to: '22:00' }],
    })
    expect(String(early.body?.error)).toContain('08:00–22:00')
    const onTuesday = () => listOccurrences(request, coordinator, `&from=${tuesday}&to=${tuesday}`)
    expect((await onTuesday()).items).toEqual([])

    // Inside the hours: 201.
    const inside = await createEvent(request, coordinator, event({ placeId: pitch }, '09:00', '11:00', 'Turniej Żaków'))
    expect(inside.status, JSON.stringify(inside.body)).toBe(201)

    // A hall without opening hours on its chain: no limit.
    const hallEvent = await createEvent(request, coordinator, event({ placeId: hall }, '06:00', '07:30', 'Rozgrzewka'))
    expect(hallEvent.status, JSON.stringify(hallEvent.body)).toBe(201)

    // A typed venue has no place and no opening hours.
    const away = await createEvent(
      request,
      coordinator,
      event(
        { venue: { name: 'Stadion Wisły Brzezie', address: 'ul. Sportowa 1, Zielony Las' } },
        '07:00',
        '09:00',
        'Wyjazd',
      ),
    )
    expect(away.status, JSON.stringify(away.body)).toBe(201)

    // A weekly series at 07:00 on the pitch is not checked (DD-R15) and still generates.
    const series = await createActivity(request, coordinator, {
      groupId: orliki,
      name: 'Poranny trening Orlików',
      type: 'training',
      placeId: pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=WE;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: today,
      startTime: '07:00',
      endTime: '08:00',
    })
    expect(series.sessionsCreated).toBeGreaterThan(0)
    const regenerated = runGenerator(club, addDays(today, 28))
    expect(regenerated).toMatchObject({ failed: 0 })
    expect(regenerated.created).toBeGreaterThan(0)
    const seriesSessions = await listOccurrences(request, coordinator, `&activityId=${series.id}`)
    expect(seriesSessions.items.length).toBe(series.sessionsCreated + regenerated.created)

    // The coach's phone: the slot dialog shows the refusal with the day's hours at the start field, in both locales.
    const coach = await signedInStaff(request, club, { firstName: 'Rafał', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, {
      groupId: zaki,
      personId: coach.personId,
      role: 'coach',
      validFrom: addDays(today, -30),
    })
    const login = await page.request.post('/api/auth/login', {
      form: { email: club.tenant.email, password: club.tenant.password },
    })
    expect(login.ok(), `POST /api/auth/login ${String(login.status())}`).toBe(true)
    await switchBrowserUser(page, request, club, coach.userId, coach.email)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      // The refused saves answer 409 on purpose; the browser logs each as a failed resource.
      if (message.type() === 'error' && !message.text().includes('status of 409')) consoleErrors.push(message.text())
    })
    await page.setViewportSize({ width: 375, height: 812 })
    const dialog = page.getByTestId('facilities-slot-dialog')
    const dayUrl = `/backend/facilities/calendar?place=${pitch}&range=day&date=${tuesday}`
    await page.goto(dayUrl)
    for (const locale of ['en', 'pl']) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: new URL(page.url()).origin }])
      await page.goto(dayUrl)
      await page.getByTestId('facilities-axis-hour-12:00').click()
      await expect(dialog).toBeVisible()
      await expect(dialog.getByTestId('facilities-slot-kind')).toContainText(
        uiText('facilities.slot.kind.group', { exact: true }),
      )
      await dialog.getByTestId('facilities-slot-start').fill('07:00')
      await dialog.getByTestId('facilities-slot-end').fill('08:30')
      await dialog.getByTestId('facilities-slot-name').fill(`Turniej o świcie ${locale}`)
      await dialog.getByTestId('facilities-slot-submit').click()
      const issue = dialog
        .getByTestId('facilities-slot-start-issues')
        .getByTestId('facilities-rental-issue-event_place_closed')
      await expect(issue).toContainText(
        uiText('activities.errors.event_place_closed', { params: { hours: '08:00–22:00' } }),
      )
      await expect(issue).toContainText('08:00–22:00')
      await expect(dialog.getByTestId('facilities-slot-start')).toHaveAttribute('aria-invalid', 'true')
      await expect(dialog).toBeVisible()
      await expectNoPageOverflow(page)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }
    // Nothing was saved by the refused dialogs: only the three events posted above are on the Tuesday.
    expect((await onTuesday()).items).toHaveLength(3)
    expect(consoleErrors).toEqual([])
  } finally {
    await club.cleanup()
  }
})
