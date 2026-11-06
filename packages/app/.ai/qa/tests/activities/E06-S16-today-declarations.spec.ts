import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { CLUB_ZONE, addDays, weekdayOf } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { createPolicy, declare, familyFor, oneOff, personOf, readCalendarItem, startNow } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'

// Issue #98, E06-S16 (club spec `/club` *Behavior*, README M-02; REQ-006, REQ-007, TEST-014): a guardian on a phone
// declares straight from Today. With nothing today or tomorrow the calendar tile names the next session; a failed
// calendar or unread-count read shows its tile's error with "Try again" while the other tiles keep working. A card shows
// the group, section and place and, per ward, the status with the buttons of the session's kind: "Report absence" on a
// training (absence-only) saves without leaving `/club` and names the ward in the toast; a match (confirm) offers
// "Attending / Not attending", and once it has started the buttons are disabled under "Declarations closed". The
// attendance tile names the pending decision with its date and time. A ward signed in under `guardian_only` sees no
// buttons. `/club` passes axe in both schemes with no horizontal overflow.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: CLUB_ZONE })

const ABSENT = /^(Absent|Nieobecny)$/
const PENDING = /Awaiting guardian confirmation|Czeka na potwierdzenie opiekuna/
const REPORT_ABSENCE = /^(Report absence|Zgłoś nieobecność)/
const WITHDRAW_ABSENCE = /^(Withdraw the absence|Wycofaj zgłoszenie nieobecności)/
const ATTENDING = /^(Attending|Będzie)/
const NOT_ATTENDING = /^(Not attending|Nie będzie)/
const TRY_AGAIN = /^(Try again|Spróbuj ponownie)$/

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** "Next session: Thu 16:00 Basen" in either locale, for a club-zone date. */
function nextSessionText(date: string, time: string, section: string): RegExp {
  const day = (locale: string) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
  return new RegExp(
    `Next session: ${escape(`${day('en')} ${time} ${section}`)}|Najbliższe zajęcia: ${escape(`${day('pl')} ${time} ${section}`)}`,
  )
}

function card(page: Page, title: string) {
  return page.getByTestId('club-today-card').filter({ hasText: title })
}

test('E06-S16 a guardian declares from Today: next session, per-tile retry, report absence with a named toast, closed match, dated decision, guardian_only ward', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s16')
  try {
    const family = await familyFor(request, club)
    const today = calendarDate()
    const later = addDays(today, 2)
    await oneOff(request, club, family.poolCoordinator.token, {
      groupId: family.poolGroup,
      placeId: family.poolPlace,
      name: 'Basen dodatkowy',
      type: 'training',
      weekday: weekdayOf(later),
      fromDaysAhead: 2,
      start: '16:00',
      end: '17:00',
    })

    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    const guardianToken = await getAuthToken(request, family.guardian.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })

    // Nothing today or tomorrow: the tile names the next session (weekday, time, section) and keeps the calendar link.
    await page.goto('/club')
    const calendarTile = page.getByTestId('club-tile-calendar')
    await expect(calendarTile.getByTestId('club-today-empty')).toHaveText(nextSessionText(later, '16:00', 'Basen'))
    await expect(calendarTile.getByRole('link', { name: /Open the calendar|Otwórz kalendarz/ })).toBeVisible()

    // The calendar read fails: its tile offers "Try again", the messages tile still works; the retry recovers.
    await page.route('**/api/activities/calendar?*', (route) => route.abort())
    await page.reload()
    await expect(calendarTile.getByTestId('club-today-error')).toBeVisible()
    await expect(page.getByTestId('club-tile-messages')).toBeVisible()
    await expect(page.getByTestId('club-tile-messages-error')).toHaveCount(0)
    await page.unroute('**/api/activities/calendar?*')
    await calendarTile.getByRole('button', { name: TRY_AGAIN }).click()
    await expect(calendarTile.getByTestId('club-today-empty')).toBeVisible()

    // The unread count fails: the messages tile says so and offers "Try again"; the calendar tile is unaffected.
    await page.route('**/api/communication/threads/unread-count', (route) => route.abort())
    await page.reload()
    const messagesError = page.getByTestId('club-tile-messages-error')
    await expect(messagesError).toBeVisible()
    await expect(calendarTile.getByTestId('club-today-empty')).toBeVisible()
    await page.unroute('**/api/communication/threads/unread-count')
    await messagesError.getByRole('button', { name: TRY_AGAIN }).click()
    await expect(messagesError).toHaveCount(0)

    // Tomorrow: a training (absence-only) and a match (confirm) of Żaki. The 16-year-old answers the match himself, so
    // under the default `guardian_confirm` his answer waits for the guardian.
    const tomorrow = addDays(today, 1)
    const training = await oneOff(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening dodatkowy',
      type: 'training',
      weekday: weekdayOf(tomorrow),
      fromDaysAhead: 1,
      start: '17:00',
      end: '18:00',
    })
    const match = await oneOff(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Mecz kontrolny',
      type: 'match',
      weekday: weekdayOf(tomorrow),
      fromDaysAhead: 1,
      start: '10:00',
      end: '11:30',
    })
    const own = await declare(request, family.elder.token, {
      occurrenceId: match.session.id,
      personId: family.elder.personId,
      declared: 'yes',
    })
    expect(own.status, JSON.stringify(own.body)).toBe(201)
    expect(own.body?.declarationStatus).toBe('pending_guardian')

    await page.reload()
    const trainingCard = card(page, 'Trening dodatkowy')
    await expect(trainingCard).toBeVisible()
    // The card names the group, the section and the place.
    await expect(trainingCard.getByTestId('club-today-session')).toContainText('Żaki · Akademia piłkarska')
    await expect(trainingCard.getByTestId('club-today-session')).toContainText('Boisko A')
    // The pending decision names the match with its time.
    const pendingAlert = page.getByTestId('club-today-pending').filter({ hasText: 'Mecz kontrolny' })
    await expect(pendingAlert).toContainText(family.elder.firstName)
    await expect(pendingAlert).toContainText('10:00')

    // The match (confirm): "Attending / Not attending" per ward; the 16-year-old's answer awaits the guardian.
    const matchCard = card(page, 'Mecz kontrolny')
    const matchYounger = matchCard.getByTestId('club-today-person').filter({ hasText: family.younger.firstName })
    await expect(matchYounger.getByRole('button', { name: ATTENDING })).toBeEnabled()
    await expect(matchYounger.getByRole('button', { name: NOT_ATTENDING })).toBeEnabled()
    const matchElder = matchCard.getByTestId('club-today-person').filter({ hasText: family.elder.firstName })
    await expect(matchElder.getByTestId('club-today-declaration')).toHaveText(PENDING)

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.reload()
      await expect(card(page, 'Trening dodatkowy')).toBeVisible()
      const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
      expect(found, `/club (${colorScheme})`).toEqual([])
    }
    await expectNoPageOverflow(page)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()

    // The training (absence-only): only "Report absence"; one tap saves it on `/club` with the ward named in the toast.
    const younger = trainingCard.getByTestId('club-today-person').filter({ hasText: family.younger.firstName })
    await expect(younger.getByRole('button', { name: ATTENDING })).toHaveCount(0)
    await younger.getByRole('button', { name: REPORT_ABSENCE }).click()
    await expect(
      page
        .getByText(
          new RegExp(
            `Saved: ${escape(family.younger.firstName)} not attending|Zapisano: ${escape(family.younger.firstName)} nie będzie`,
          ),
        )
        .first(),
    ).toBeVisible()
    await expect(page).toHaveURL(/\/club$/)
    await expect(younger.getByTestId('club-today-declaration')).toHaveText(ABSENT)
    await expect(younger.getByRole('button', { name: WITHDRAW_ABSENCE })).toBeVisible()
    const stored = await readCalendarItem(request, guardianToken, training.session.id, 'as=guardian')
    expect(stored.status, JSON.stringify(stored.body)).toBe(200)
    expect(personOf(stored.body as never, family.younger.personId).declaration?.declared).toBe('no')

    // The match starts: "Declarations closed", its buttons disabled (the server's 409 `declaration_closed` stays).
    await startNow(request, club, match.session.id)
    await page.reload()
    const closedMatch = card(page, 'Mecz kontrolny')
    await expect(closedMatch.getByTestId('club-today-notice')).toHaveAttribute('data-notice', 'closed')
    await expect(closedMatch.getByTestId('club-today-notice')).toHaveText(/Declarations closed|Deklaracje zamknięte/)
    const closedYounger = closedMatch.getByTestId('club-today-person').filter({ hasText: family.younger.firstName })
    await expect(closedYounger.getByRole('button', { name: ATTENDING })).toBeDisabled()
    await expect(closedYounger.getByRole('button', { name: NOT_ATTENDING })).toBeDisabled()
    await expect(page.getByTestId('club-today-pending').filter({ hasText: 'Mecz kontrolny' })).toHaveCount(0)

    // A `guardian_only` policy on Żaki: the 16-year-old, signed in, sees the training but no declaration buttons.
    await createPolicy(request, club.adminToken, {
      scope: 'group',
      groupId: family.zaki,
      minorDeclarationMode: 'guardian_only',
    })
    await signInBrowser(page, request, club, family.elder.userId, family.elder.email)
    await page.goto('/club')
    const elderTraining = card(page, 'Trening dodatkowy')
    await expect(elderTraining).toBeVisible()
    const elderRow = elderTraining.getByTestId('club-today-person')
    await expect(elderRow).toContainText(/Your guardian declares|deklaruje za Ciebie opiekun/)
    await expect(elderRow.getByRole('button')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
