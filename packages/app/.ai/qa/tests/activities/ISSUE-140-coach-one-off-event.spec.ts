import { expect, test, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { addDays, createEvent, listOccurrences, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanBlockingViolations } from '../_fixtures/axe'
import { calendarItems, familyFor } from '../_fixtures/attendance'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { getMe, putMe, updateClubSettings } from '../_fixtures/members'

// Issue #140 (club spec REQ-027, AC-027, TEST-034; *UI architecture* "New event"): a coach creates a one-off event for
// their own group from the phone (375 px). Marek, the Żaki coach, opens "New event" from the coach tile of Today; the
// form offers only Żaki and the club's bookable places; "Turniej o Puchar Gwiazdy" on Saturday 9:00–12:00 at Boisko A
// with an invited team lands on its session page as the coach, and the Żaki families get it in their calendars with
// "Attending / Not attending" (`confirm`). The same slot again is refused with 409, the colliding entry is named in the
// page and nothing is created. The pool instructor's tournament for her class group is accepted and her sparring
// refused with 422; a forged request for a group Marek does not coach answers 403. The form passes axe in light and
// dark mode at 375 px without overflow, with its submit in view, in Polish (the club's language) and in English.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type EventOptions = { groups?: { id: string; name: string; kind: string }[]; places?: { id: string; label: string }[] }

async function chooseOption(page: Page, trigger: string, name: string | RegExp): Promise<void> {
  await page.getByTestId(trigger).click()
  await page.getByRole('option', { name }).click()
}

test('ISSUE-140 a coach creates a one-off event for their group from the phone; a taken slot is refused with its entry named; type and scope refusals', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'issue-140')
  try {
    const settings = await updateClubSettings(request, club.adminToken, { defaultLocale: 'pl' })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const team = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', admin, {
      data: { name: 'KS Gwiazda', clubName: 'KS Gwiazda' },
    })
    expect(team.status, JSON.stringify(team.body)).toBe(201)
    const saturday = nextWeekday(addDays(calendarDate(), 2), 'SA')

    // The options: only the coach's own group, and the bookable places of the club.
    const options = await call<EventOptions>(request, 'GET', '/api/activities/events/options', family.coach.token)
    expect(options.status, JSON.stringify(options.body)).toBe(200)
    expect(options.body?.groups?.map((group) => group.id)).toEqual([family.zaki])
    expect(options.body?.places?.map((place) => place.id).sort()).toEqual(
      [family.pitch, family.poolPlace, family.lockerRoom].sort(),
    )
    const instructorOptions = await call<EventOptions>(
      request,
      'GET',
      '/api/activities/events/options',
      family.instructor.token,
    )
    expect(instructorOptions.body?.groups?.map((group) => group.id)).toEqual([family.poolGroup])
    // A member without `activities.events.create` cannot read them.
    const memberOptions = await call(request, 'GET', '/api/activities/events/options', family.guardian.token)
    expect(memberOptions.status).toBe(403)

    page.setDefaultTimeout(30_000)
    // Signing in the browser sets a new password, so the coach's API calls below use a fresh token.
    const password = await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    const coachToken = await getAuthToken(request, family.coach.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    const scan = async (label: string, ready: () => Promise<void>) => {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        await page.reload()
        await ready()
        // The submit bar stays in view on a phone without scrolling.
        await expect(page.getByTestId('club-event-submit')).toBeInViewport()
        const found = await scanBlockingViolations(page, testInfo, { platformBaseline: true })
        if (found.length > 0) violations[`${label} (${colorScheme})`] = found
      }
      await expectNoPageOverflow(page)
      await page.setViewportSize({ width: 375, height: 812 })
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    }

    // Today → "New event" on the coach tile (Polish: the club's language).
    await page.goto('/club')
    const newEvent = page.getByTestId('club-tile-coach').getByTestId('club-today-new-event')
    await expect(newEvent).toHaveText('Nowe wydarzenie')
    await newEvent.click()
    await expect(page).toHaveURL(/\/club\/events\/new$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nowe wydarzenie')
    await scan('/club/events/new (pl)', async () => {
      await expect(page.getByTestId('club-event-form')).toBeVisible()
    })

    // Sending an empty form names the missing fields and sends nothing.
    await page.getByTestId('club-event-submit').click()
    await expect(page.getByTestId('club-event-error')).toHaveText('Uzupełnij zaznaczone pola.')
    await expect(page.getByTestId('club-event-name')).toHaveAttribute('aria-invalid', 'true')

    // Żaki is the only group, so it is chosen already; the tournament with an invited team.
    await expect(page.getByTestId('club-event-group')).toContainText('Żaki')
    await expect(page.getByTestId('club-event-type-tournament').getByRole('radio')).toBeChecked()
    await page.getByTestId('club-event-name').fill('Turniej o Puchar Gwiazdy')
    await chooseOption(page, 'club-event-place', 'Boisko A')
    await page.getByTestId('club-event-date').fill(saturday)
    await page.getByTestId('club-event-start').fill('09:00')
    await page.getByTestId('club-event-end').fill('12:00')
    await page.getByTestId('club-event-teams').getByText('KS Gwiazda (KS Gwiazda)').click()
    const created = page.waitForResponse(
      (response) => response.url().endsWith('/api/activities/events') && response.request().method() === 'POST',
    )
    await page.getByTestId('club-event-submit').click()
    const answer = await created
    expect(answer.status()).toBe(201)
    const body = (await answer.json()) as { id?: string; occurrenceId?: string; actingRole?: string }
    expect(body.actingRole).toBe('coach')
    const occurrenceId = String(body.occurrenceId)

    // He lands on the event's session page as the coach.
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${occurrenceId}\\?as=coach`))
    await expect(page.getByTestId('club-session-title')).toHaveText('Turniej o Puchar Gwiazdy')
    await expect(page.getByTestId('club-session-coach')).toBeVisible()

    // The Żaki families have it in their calendars with "Attending / Not attending".
    const annaEntries = await calendarItems(
      request,
      family.guardian.token,
      `as=guardian&from=${saturday}&to=${saturday}`,
    )
    const annaEntry = annaEntries.find((entry) => entry.occurrence.id === occurrenceId)
    expect(annaEntry?.declarationKind).toBe('confirm')
    expect(annaEntry?.occurrence.startAt).toBe(zoneInstant(saturday, '09:00'))
    expect(annaEntry?.occurrence.endAt).toBe(zoneInstant(saturday, '12:00'))
    expect(annaEntry?.persons.map((person) => person.personId).sort()).toEqual(
      [family.younger.personId, family.elder.personId].sort(),
    )
    expect(annaEntry?.occurrence.invitedTeamNames).toEqual(['KS Gwiazda'])
    const otherEntries = await calendarItems(
      request,
      family.other.guardian.token,
      `as=guardian&from=${saturday}&to=${saturday}`,
    )
    expect(otherEntries.map((entry) => entry.occurrence.id)).toContain(occurrenceId)

    // The same slot again from the calendar acting as a coach: 409, the colliding entry named, nothing created.
    await page.goto('/club/calendar')
    await expect(page.getByTestId('club-calendar-toolbar')).toBeVisible()
    // Acting as a member (the default), the calendar is the ward's and offers no "New event".
    await expect(page.getByTestId('club-calendar-new-event')).toHaveCount(0)
    await page.locator('#club-switcher-context').click()
    await page.getByRole('option', { name: /^(Coach|Trener)$/ }).click()
    await page.getByTestId('club-calendar-new-event').click()
    await expect(page).toHaveURL(/\/club\/events\/new$/)
    await page.getByTestId('club-event-name').fill('Drugi turniej')
    await chooseOption(page, 'club-event-place', 'Boisko A')
    await page.getByTestId('club-event-date').fill(saturday)
    await page.getByTestId('club-event-start').fill('10:00')
    await page.getByTestId('club-event-end').fill('11:00')
    const refused = page.waitForResponse(
      (response) => response.url().endsWith('/api/activities/events') && response.request().method() === 'POST',
    )
    await page.getByTestId('club-event-submit').click()
    expect((await refused).status()).toBe(409)
    const conflicts = page.getByTestId('activities-conflicts')
    await expect(conflicts).toContainText('Turniej o Puchar Gwiazdy')
    await expect(conflicts.getByRole('link')).toHaveCount(0)
    await expect(page).toHaveURL(/\/club\/events\/new$/)
    const zakiSessions = await listOccurrences(request, admin, `&groupId=${family.zaki}`)
    expect(zakiSessions.items.map((row) => row.id)).toEqual([occurrenceId])

    // English, Marek's preference: the form follows his language.
    const me = await getMe(request, coachToken)
    const english = await putMe(request, coachToken, { preferredLocale: 'en' }, me.body?.person.updatedAt)
    expect(english.status, JSON.stringify(english.body)).toBe(200)
    await page.goto('/club/events/new')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New event')
    await scan('/club/events/new (en)', async () => {
      await expect(page.getByTestId('club-event-form')).toBeVisible()
    })

    // The pool instructor: a tournament for her class group is accepted, a sparring refused.
    const poolTournament = await createEvent(request, family.instructor.token, {
      groupId: family.poolGroup,
      type: 'tournament',
      name: 'Zawody pływackie',
      placeId: family.poolPlace,
      startsAt: zoneInstant(saturday, '14:00'),
      endsAt: zoneInstant(saturday, '16:00'),
    })
    expect(poolTournament.status, JSON.stringify(poolTournament.body)).toBe(201)
    const sparring = await createEvent(request, family.instructor.token, {
      groupId: family.poolGroup,
      type: 'sparring',
      name: 'Sparing',
      placeId: family.poolPlace,
      startsAt: zoneInstant(saturday, '17:00'),
      endsAt: zoneInstant(saturday, '18:00'),
    })
    expect(sparring.status, JSON.stringify(sparring.body)).toBe(422)
    expect(sparring.body?.code).toBe('activity_type_requires_team')

    // A forged request for the pool group, which Marek does not coach: 403 and nothing written.
    const forged = await createEvent(request, coachToken, {
      groupId: family.poolGroup,
      type: 'tournament',
      name: 'Podrobiony turniej',
      placeId: family.poolPlace,
      startsAt: zoneInstant(saturday, '18:00'),
      endsAt: zoneInstant(saturday, '19:00'),
    })
    expect(forged.status, JSON.stringify(forged.body)).toBe(403)
    expect(forged.body?.code).toBe('scope_denied')
    const poolSessions = await listOccurrences(request, admin, `&groupId=${family.poolGroup}`)
    expect(poolSessions.items.map((row) => row.id)).toEqual([poolTournament.body?.occurrenceId])

    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
