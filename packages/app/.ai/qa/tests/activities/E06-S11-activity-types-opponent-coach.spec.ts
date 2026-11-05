import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  addDays,
  createActivity,
  createEvent,
  getActivity,
  getOccurrence,
  postActivity,
  zoneInstant,
} from '../_fixtures/activities'
import { expectNoPageOverflow } from '../_fixtures/axe'
import { familyFor, readCalendarItem, sessionsOf } from '../_fixtures/attendance'
import { birthDateTurning, calendarDate, call, createClub, createPerson } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { addMembership } from '../_fixtures/groups'

// Issue #93 (E06-S11; README B-14, B-15, M-04, flow F-04; club spec REQ-005, REQ-020, REQ-027): the activity wizard
// offers the types that fit the group's kind (no match or sparring for a class group, whose training reads "Classes"),
// a match or a sparring takes an opponent, and the coach picker lists only persons with an active coach or assistant
// role, plus "No coach". The session page of the staff (B-15) and of a guardian (M-04) shows the opponent and the
// invited teams of a tournament. A forged match on a class group is still refused by the API.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type CoachOptions = { items?: Array<{ id: string; name: string }>; code?: string }

async function coachOptions(request: Parameters<typeof call>[0], token: string, search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : ''
  return call<CoachOptions>(request, 'GET', `/api/activities/options/coaches${query}`, token)
}

/** Opens a CrudForm select and picks an option, retrying while the options load after hydration. */
async function chooseCrudOption(page: Page, field: string, option: RegExp): Promise<void> {
  const trigger = page.locator(`[data-crud-field-id="${field}"] [role="combobox"]`).first()
  const choice = page.getByRole('option', { name: option })
  await expect(async () => {
    if (!(await choice.isVisible())) await trigger.click({ timeout: 2_000 })
    await expect(choice).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await choice.click()
}

/**
 * Types into a CrudForm combobox and picks an option. The list is rendered again when the debounced search answers,
 * which can detach the option under the click, so the pick is retried until the input holds the chosen label.
 */
async function pickComboboxOption(
  page: Page,
  input: Locator,
  search: string,
  option: RegExp,
  label: string,
): Promise<void> {
  const choice = page.getByRole('option', { name: option })
  await expect(async () => {
    if ((await input.inputValue()) !== label) {
      if (!(await choice.isVisible())) await input.fill(search)
      await choice.click({ timeout: 2_000 })
    }
    await expect(input).toHaveValue(label, { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

/** The labels of the type select's options for the group chosen in the wizard; the list is closed again. */
async function typeOptions(page: Page): Promise<string[]> {
  await page.getByTestId('activities-type-select').click()
  const options = page.getByRole('option')
  await expect(options.first()).toBeVisible()
  const labels = (await options.allTextContents()).map((label) => label.trim())
  await page.keyboard.press('Escape')
  return labels
}

test('E06-S11 types follow the group kind, a match takes an opponent, the coach picker lists only coaches, and B-15 and M-04 show the opponent and the invited teams', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'e06-s11-activity-types')
  try {
    const admin = club.adminToken
    const family = await familyFor(request, club)
    const today = calendarDate()
    const teams: Record<'polonia' | 'orzel', string> = { polonia: '', orzel: '' }
    for (const [key, name, clubName] of [
      ['polonia', 'KS Polonia', 'Polonia Warszawa'],
      ['orzel', 'UKS Orzeł', 'Orzeł Ząbki'],
    ] as const) {
      const team = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', admin, {
        data: { name, clubName },
      })
      expect(team.status, JSON.stringify(team.body)).toBe(201)
      teams[key] = String(team.body?.id)
    }
    // An assistant of Żaki without any role assignment: a group membership as `assistant` makes them a coach option.
    const assistant = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Asystentka',
      birthDate: birthDateTurning(24),
    })
    await addMembership(request, admin, {
      groupId: family.zaki,
      personId: assistant,
      role: 'assistant',
      validFrom: addDays(today, -7),
    })
    // A former assistant whose membership ended yesterday is not offered.
    const former = await createPerson(request, admin, {
      firstName: 'Tomasz',
      lastName: 'Byly',
      birthDate: birthDateTurning(30),
    })
    await addMembership(request, admin, {
      groupId: family.zaki,
      personId: former,
      role: 'assistant',
      validFrom: addDays(today, -60),
      validTo: addDays(today, -1),
    })

    // The coach picker: persons with an active coach role or a coach / assistant membership, by last name — never the
    // coordinator, a guardian or a ward. Every word of the search starts a first or last name, diacritics ignored.
    const coordinator = family.academyCoordinator.token
    const all = await coachOptions(request, coordinator)
    expect(all.status, JSON.stringify(all.body)).toBe(200)
    expect(all.body?.items).toEqual([
      { id: assistant, name: 'Ola Asystentka' },
      { id: family.instructor.personId, name: 'Irena Instruktor' },
      { id: family.coach.personId, name: 'Marek Trener' },
    ])
    expect((await coachOptions(request, coordinator, 'tre')).body?.items).toEqual([
      { id: family.coach.personId, name: 'Marek Trener' },
    ])
    expect((await coachOptions(request, coordinator, 'IRENA ins')).body?.items?.map((item) => item.id)).toEqual([
      family.instructor.personId,
    ])
    expect((await coachOptions(request, coordinator, 'kowalska')).body?.items).toEqual([])
    // A guardian does not plan activities.
    expect((await coachOptions(request, family.guardian.token)).status).toBe(403)

    // A forged match or sparring on a class group is refused (negative case).
    const nextWeek = addDays(today, 8)
    for (const type of ['match', 'sparring']) {
      const forged = await postActivity(request, family.poolCoordinator.token, {
        groupId: family.poolGroup,
        name: 'Mecz basenowy',
        type,
        placeId: family.poolPlace,
        opponentExternalTeamId: teams.polonia,
        startsOn: nextWeek,
        startTime: '10:00',
        endTime: '11:00',
      })
      expect(forged.status, JSON.stringify(forged.body)).toBe(422)
      expect(forged.body?.code).toBe('activity_type_requires_team')
    }

    // A tournament of Żaki with two invited teams (a coordinator's one-off event).
    const tournamentDay = addDays(today, 10)
    const tournament = await createEvent(request, coordinator, {
      groupId: family.zaki,
      type: 'tournament',
      name: 'Turniej Żaków',
      placeId: family.pitch,
      startsAt: zoneInstant(tournamentDay, '09:00'),
      endsAt: zoneInstant(tournamentDay, '13:00'),
      invitedExternalTeamIds: [teams.polonia, teams.orzel],
    })
    expect(tournament.status, JSON.stringify(tournament.body)).toBe(201)
    const tournamentSession = String(tournament.body?.occurrenceId)
    const tournamentDetail = await getOccurrence(request, coordinator, tournamentSession)
    expect(tournamentDetail.status).toBe(200)
    expect(tournamentDetail.body?.opponentName).toBeNull()
    expect([...(tournamentDetail.body?.invitedTeamNames ?? [])].sort()).toEqual(['KS Polonia', 'UKS Orzeł'])

    // ---- The wizard in the browser ----
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 375, height: 812 })

    // The pool coordinator: a class group gets classes, tournament, camp and other — no match or sparring.
    await signInBrowser(page, request, club, family.poolCoordinator.userId, family.poolCoordinator.email)
    await page.goto('/backend/activities/activities/create')
    await expect(page.getByRole('heading', { level: 1, name: /^New activity$|^Nowe zajęcia$/ })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await chooseCrudOption(page, 'groupId', /^Basen — początkujący$/)
    await expect.poll(() => typeOptions(page)).toEqual(['Classes', 'Tournament', 'Camp', 'Other'])
    await expect(page.locator('[data-crud-field-id="opponentExternalTeamId"]')).toHaveCount(0)
    await expectNoPageOverflow(page)

    // The academy coordinator: a team gets every type; a match shows the opponent; the coach picker lists coaches only.
    await signInBrowser(page, request, club, family.academyCoordinator.userId, family.academyCoordinator.email)
    await page.goto('/backend/activities/activities/create')
    await expect(page.getByRole('heading', { level: 1, name: /^New activity$|^Nowe zajęcia$/ })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await chooseCrudOption(page, 'groupId', /^Żaki$/)
    await expect.poll(() => typeOptions(page)).toEqual(['Training', 'Match', 'Sparring', 'Tournament', 'Camp', 'Other'])
    await page.locator('[data-crud-field-id="name"] input').fill('Mecz z Polonią')
    await page.getByTestId('activities-type-select').click()
    await page.getByRole('option', { name: /^Match$/ }).click()
    const opponent = page.locator('[data-crud-field-id="opponentExternalTeamId"]')
    await expect(opponent).toBeVisible()
    await chooseCrudOption(page, 'opponentExternalTeamId', /^KS Polonia \(Polonia Warszawa\)$/)
    await chooseCrudOption(page, 'placeId', /Boisko A/)

    const coach = page.locator('[data-crud-field-id="coachPersonId"] input[role="combobox"]')
    // "Ko" would find the coordinator Krystyna Koordynator and the Kowalski family in the person directory.
    await coach.fill('Ko')
    await expect(page.getByRole('option')).toHaveCount(0)
    await coach.fill('No')
    await expect(page.getByRole('option', { name: /^No coach$/ })).toBeVisible()
    await pickComboboxOption(page, coach, 'Trener', /^Marek Trener$/, 'Marek Trener')

    const matchDay = addDays(today, 12)
    await page.getByTestId('activities-repeat-once').click()
    await page.locator('[data-crud-field-id="startsOn"] input').fill(matchDay)
    await page.locator('[data-crud-field-id="startTime"] input').fill('16:00')
    await page.locator('[data-crud-field-id="endTime"] input').fill('17:30')
    await page
      .getByRole('button', { name: /^Create$|^Utwórz$/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/backend\/activities\/activities\/[0-9a-f-]{36}$/)
    const matchId = page.url().split('/').pop() as string
    const saved = await getActivity(request, admin, matchId)
    expect(saved.body).toMatchObject({
      type: 'match',
      opponentExternalTeamId: teams.polonia,
      coachPersonId: family.coach.personId,
      recurrenceRule: null,
      startsOn: matchDay,
    })

    // Changing the type away from a match hides the opponent, and the save sends none: "No coach" clears the coach.
    const friendly = await createActivity(request, admin, {
      groupId: family.zaki,
      name: 'Sparing kontrolny',
      type: 'sparring',
      placeId: family.pitch,
      opponentExternalTeamId: teams.orzel,
      coachPersonId: family.coach.personId,
      startsOn: addDays(today, 14),
      startTime: '16:00',
      endTime: '17:00',
    })
    await page.goto(`/backend/activities/activities/${friendly.id}`)
    await expect(page.locator('[data-crud-field-id="opponentExternalTeamId"]')).toBeVisible()
    await page.getByTestId('activities-type-select').click()
    await page.getByRole('option', { name: /^Other$/ }).click()
    await expect(page.locator('[data-crud-field-id="opponentExternalTeamId"]')).toHaveCount(0)
    const coachOnRecord = page.locator('[data-crud-field-id="coachPersonId"] input[role="combobox"]')
    await pickComboboxOption(page, coachOnRecord, 'No', /^No coach$/, 'No coach')
    await page
      .getByRole('button', { name: /^Save$|^Zapisz$/ })
      .first()
      .click()
    await expect.poll(async () => (await getActivity(request, admin, friendly.id)).body?.type).toBe('other')
    expect((await getActivity(request, admin, friendly.id)).body).toMatchObject({
      opponentExternalTeamId: null,
      coachPersonId: null,
    })

    // B-15: the session of the match shows its opponent.
    const [matchSession] = await sessionsOf(request, club, matchId)
    expect(matchSession.occurrenceDate).toBe(matchDay)
    const matchDetail = await getOccurrence(request, admin, matchSession.id)
    expect(matchDetail.body).toMatchObject({ opponentName: 'KS Polonia', invitedTeamNames: [] })
    await page.goto(`/backend/activities/occurrences/${matchSession.id}`)
    await expect(page.getByText('KS Polonia')).toBeVisible()

    // M-04: the guardian of a Żaki player sees the opponent of the match and both invited teams of the tournament.
    const guardianOnMatch = await readCalendarItem(request, family.guardian.token, matchSession.id, 'as=guardian')
    expect(guardianOnMatch.status, JSON.stringify(guardianOnMatch.body)).toBe(200)
    expect(guardianOnMatch.body?.occurrence).toMatchObject({ opponentName: 'KS Polonia', invitedTeamNames: [] })
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    await page.goto(`/club/occurrences/${matchSession.id}`)
    await expect(page.getByTestId('club-session-opponent')).toHaveText('KS Polonia')
    await expect(page.getByTestId('club-session-invited-teams')).toHaveCount(0)
    await expectNoPageOverflow(page)
    await page.goto(`/club/occurrences/${tournamentSession}`)
    const invited = page.getByTestId('club-session-invited-teams').getByRole('listitem')
    await expect(invited).toHaveCount(2)
    expect((await invited.allTextContents()).sort()).toEqual(['KS Polonia', 'UKS Orzeł'])
    await expect(page.getByTestId('club-session-opponent')).toHaveCount(0)
    await expectNoPageOverflow(page)
  } finally {
    await club.cleanup()
  }
})
