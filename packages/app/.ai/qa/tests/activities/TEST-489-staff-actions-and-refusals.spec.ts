import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, createActivity, createEvent, listOccurrences, weekdayOf, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, readCalendarItem } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { getMe, putMe } from '../_fixtures/members'
import { uiText, uiTextIn } from '../_fixtures/ui-text'

// TEST-489 (E20-S10, #489; epic #479): staff on the phone are never offered an action they cannot take, and every
// refusal reached by URL names the way forward, per role, in en and pl, light and dark, at 375 px:
// - the coach of Żaki sees "Edit" on the session of his one-off event and none on a session of the series; the series
//   session's edit form opened by URL says the section coordinator moves it;
// - the academy coordinator, who coaches no group, sees "Edit" on the series session as the coordinator and none on the
//   pool's; the pool session's edit form says it is not theirs and links the calendar; the calendar and Today offer no
//   coach's "New event", `/club/events/new` sends them to a new club event, and `/club/messages/new` names the
//   announcement instead of the guardian's "nobody in your household" text;
// - the facility attendant opening `/club/places/maintenance`, `/club/events/new` and an edit form by URL reads the
//   page's own refusal with the way forward, never the platform's bare "Access denied".
test.describe.configure({ timeout: 480_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const LOCALES = ['en', 'pl'] as const

/** The member pages follow the person's own language (DD-34): set it, then the phone at 375 px in light. */
async function phone(page: Page, request: APIRequestContext, token: string, locale: 'en' | 'pl'): Promise<void> {
  const me = await getMe(request, token)
  const changed = await putMe(request, token, { preferredLocale: locale }, me.body?.person.updatedAt)
  expect(changed.status, JSON.stringify(changed.body)).toBe(200)
  await page.context().addCookies([{ name: 'locale', value: locale, url: BASE_URL }])
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: 812 })
}

/**
 * Browser evidence for the pull request (E20-S10 asks for desktop and 375 px, both locales, light and dark): with
 * `EVIDENCE_DIR` set, the refusal on screen is saved in each width and scheme; without it, nothing is written.
 */
async function evidence(page: Page, name: string): Promise<void> {
  const dir = process.env.EVIDENCE_DIR
  if (!dir) return
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 })
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      // Evidence only (never in CI): let the colour transitions of the scheme switch settle before the picture.
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${dir}/${name}-${String(width)}-${colorScheme}.png`, fullPage: true })
    }
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: 812 })
}

/** The platform's bare refusal page, which no Vereino staff route may show (E20-S10). */
async function expectNoBareDenied(page: Page): Promise<void> {
  await expect(page.getByText(uiText('auth.accessDenied.title', { exact: true }))).toHaveCount(0)
}

test('TEST-489 staff are offered only the actions they may take, and every refusal names the way forward', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-489')
  try {
    const family = await familyFor(request, club)
    const today = calendarDate()
    // A weekly training series of Żaki (the coach may not move its sessions) and a one-off event (he may).
    const series = await createActivity(request, club.adminToken, {
      groupId: family.zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: family.pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=${weekdayOf(addDays(today, 2))};UNTIL=${addDays(today, 28).replaceAll('-', '')}`,
      startsOn: addDays(today, 2),
      startTime: '17:00',
      endTime: '18:30',
    })
    const seriesSession = (await listOccurrences(request, club.adminToken, `&activityId=${series.id}`)).items.at(0)?.id
    if (!seriesSession) throw new Error('[internal] the series has no session')
    const oneOff = await createEvent(request, club.adminToken, {
      groupId: family.zaki,
      type: 'other',
      name: 'Ognisko Żaków',
      placeId: family.pitch,
      startsAt: zoneInstant(addDays(today, 3), '17:00'),
      endsAt: zoneInstant(addDays(today, 3), '19:00'),
      coachPersonId: family.coach.personId,
    })
    expect(oneOff.status, JSON.stringify(oneOff.body)).toBe(201)
    const oneOffSession = String(oneOff.body?.occurrenceId)
    const poolEvent = await createEvent(request, club.adminToken, {
      groupId: family.poolGroup,
      type: 'other',
      name: 'Nauka pływania',
      placeId: family.poolPlace,
      startsAt: zoneInstant(addDays(today, 4), '18:00'),
      endsAt: zoneInstant(addDays(today, 4), '19:00'),
      coachPersonId: family.instructor.personId,
    })
    expect(poolEvent.status, JSON.stringify(poolEvent.body)).toBe(201)
    const poolSession = String(poolEvent.body?.occurrenceId)
    const attendant = await signedInStaff(request, club, {
      firstName: 'Adam',
      lastName: 'Obiektowy',
      role: 'facility_operator',
      placeId: family.pitch,
    })

    // --- The reads the pages follow (before the browser sign-ins end the API tokens) ---
    const coachSeries = await readCalendarItem(request, family.coach.token, seriesSession, 'as=coach')
    expect(coachSeries.status, JSON.stringify(coachSeries.body)).toBe(200)
    expect(coachSeries.body).toMatchObject({ mayEdit: false })
    const coachOneOff = await readCalendarItem(request, family.coach.token, oneOffSession, 'as=coach')
    expect(coachOneOff.body).toMatchObject({ mayEdit: true })
    const coordinatorSeries = await readCalendarItem(
      request,
      family.academyCoordinator.token,
      seriesSession,
      'as=coordinator',
    )
    expect(coordinatorSeries.body).toMatchObject({ mayEdit: true })

    page.setDefaultTimeout(30_000)
    const violations: Record<string, unknown> = {}
    const scan = async (label: string, ready: () => Promise<void>) => {
      Object.assign(violations, await scanInColorSchemes(page, testInfo, label, ready))
    }

    // --- The coach of Żaki ---
    const coachPassword = await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    const coachToken = await getAuthToken(request, family.coach.email, coachPassword)
    await prepareForAccessibilityScan(page)
    for (const locale of LOCALES) {
      await phone(page, request, coachToken, locale)
      await page.goto(`/club/occurrences/${oneOffSession}?as=coach`)
      await expect(page.getByTestId('club-session-edit')).toBeVisible()
      await page.goto(`/club/occurrences/${seriesSession}?as=coach`)
      await expect(page.getByTestId('club-session-coach')).toBeVisible()
      await expect(page.getByTestId('club-session-edit')).toHaveCount(0)
      await page.goto(`/club/occurrences/${seriesSession}/edit`)
      const denied = page.getByTestId('club-edit-denied')
      await expect(denied).toHaveAttribute('data-reason', 'coach_series')
      await expect(denied).toContainText(uiTextIn(locale, 'activities.club.edit.refusal.coach_series'))
      await expect(page.getByTestId('club-edit-form')).toHaveCount(0)
      await evidence(page, `edit-coach-series-${locale}`)
      await scan(`/club/occurrences/[id]/edit coach_series (${locale})`, async () => {
        await expect(page.getByTestId('club-edit-denied')).toBeVisible()
      })
    }

    // --- The academy coordinator, who coaches no group ---
    const coordinator = family.academyCoordinator
    const coordinatorPassword = await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    const coordinatorToken = await getAuthToken(request, coordinator.email, coordinatorPassword)
    for (const locale of LOCALES) {
      await phone(page, request, coordinatorToken, locale)
      await page.goto(`/club/occurrences/${seriesSession}?as=coordinator`)
      await expect(page.getByTestId('club-session-edit')).toHaveAttribute(
        'href',
        `/club/occurrences/${seriesSession}/edit?as=coordinator`,
      )
      await page.goto(`/club/occurrences/${poolSession}?as=coordinator`)
      await expect(page.getByTestId('club-session-missing')).toBeVisible()
      await expect(page.getByTestId('club-session-edit')).toHaveCount(0)
      await page.goto(`/club/occurrences/${poolSession}/edit?as=coordinator`)
      const denied = page.getByTestId('club-edit-denied')
      await expect(denied).toHaveAttribute('data-reason', 'not_yours')
      await expect(denied).toContainText(uiTextIn(locale, 'activities.club.edit.refusal.not_yours'))
      await expect(page.getByTestId('club-edit-denied-calendar')).toHaveAttribute('href', '/club/calendar')
      await evidence(page, `edit-not-yours-${locale}`)
      await scan(`/club/occurrences/[id]/edit not_yours (${locale})`, async () => {
        await expect(page.getByTestId('club-edit-denied')).toBeVisible()
      })

      // No coach's "New event" where the coordinator works; by URL the page sends them to a new club event.
      await page.goto('/club')
      await expect(page.getByTestId('club-tile-section')).toBeVisible()
      await expect(page.getByTestId('club-today-new-event')).toHaveCount(0)
      await page.goto('/club/calendar?as=coordinator')
      await expect(page.getByTestId('club-calendar-toolbar')).toBeVisible()
      await expect(page.getByTestId('club-calendar-new-event')).toHaveCount(0)
      await page.goto('/club/events/new')
      const noGroups = page.getByTestId('club-event-no-groups')
      await expect(noGroups).toContainText(uiTextIn(locale, 'activities.club.event.noGroups.organizer'))
      await expect(page.getByTestId('club-event-no-groups-club-event')).toHaveAttribute('href', '/club/club-events/new')
      await evidence(page, `events-new-coordinator-${locale}`)
      await scan(`/club/events/new organizer (${locale})`, async () => {
        await expect(page.getByTestId('club-event-no-groups')).toBeVisible()
      })

      // Messages: the staff way to write to a group, not the guardian's text.
      await page.goto('/club/messages/new')
      const empty = page.getByTestId('club-direct-empty')
      await expect(empty).toHaveAttribute('data-staff', '1')
      await expect(empty).toContainText(uiTextIn(locale, 'communication.direct.emptyStaff'))
      await expect(page.getByText(uiText('communication.direct.empty'))).toHaveCount(0)
      await evidence(page, `messages-new-coordinator-${locale}`)
      await scan(`/club/messages/new staff (${locale})`, async () => {
        await expect(page.getByTestId('club-direct-empty')).toBeVisible()
      })
      await expectNoPageOverflow(page)
    }

    // --- The facility attendant, by URL ---
    const attendantPassword = await signInBrowser(page, request, club, attendant.userId, attendant.email)
    const attendantToken = await getAuthToken(request, attendant.email, attendantPassword)
    for (const locale of LOCALES) {
      await phone(page, request, attendantToken, locale)
      await page.goto('/club/places/maintenance')
      // The refusal names the current panel path, built from the menu's own labels (#667).
      const maintainersPath = [
        'facilities.nav.group',
        'facilities.records.title',
        'facilities.records.tabs.maintenance',
        'facilities.maintenance.tabs.maintainers',
      ]
        .map((key) => uiTextIn(locale, key))
        .join(' › ')
      await expect(page.getByTestId('club-maintenance-denied')).toContainText(
        uiTextIn(locale, 'facilities.places.maintenance.forbidden').replace('{path}', maintainersPath),
      )
      await expectNoBareDenied(page)
      await evidence(page, `maintenance-attendant-${locale}`)
      await scan(`/club/places/maintenance attendant (${locale})`, async () => {
        await expect(page.getByTestId('club-maintenance-denied')).toBeVisible()
      })
      await page.goto('/club/events/new')
      await expect(page.getByTestId('club-event-no-groups')).toContainText(
        uiTextIn(locale, 'activities.club.event.noGroups.coach'),
      )
      await expectNoBareDenied(page)
      await page.goto(`/club/occurrences/${seriesSession}/edit`)
      await expect(page.getByTestId('club-edit-denied')).toHaveAttribute('data-reason', 'not_yours')
      await expectNoBareDenied(page)
      await expectNoPageOverflow(page)
    }

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
