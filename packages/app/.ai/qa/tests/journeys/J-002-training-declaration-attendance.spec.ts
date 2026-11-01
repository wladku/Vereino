import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  addDays,
  getActivity,
  createActivity,
  getOccurrence,
  mondayOf,
  nextWeekday,
  readNotifications,
  showCalendarWeekOf,
  wallTime,
  weekdaysBetween,
  type WeekdayCode,
} from '../_fixtures/activities'
import {
  calendarItems,
  declare,
  ensureDefaultPolicies,
  entryOf,
  listPolicies,
  memberAccount,
  personOf,
  readAttendanceList,
  readCalendarItem,
  rowOf,
  sessionsOf,
  startNow,
} from '../_fixtures/attendance'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { birthDateTurning, calendarDate, createClub, createPerson, type Club } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import { addMembership, createGroup, listGroups, roster, signedInStaff } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { createGuardianship, persons } from '../_fixtures/people'

// J-002 (club spec *User Journeys*, phases 2–3) without the substitution steps, end to end on one fresh tenant — the
// phase 2 exit gate of epic #22. Step 4 (Marek's absence, the "needing a coach" list, the coordinator assigning Bartek)
// and step 5's "handed over / taken over" units are held back by A05, so the group's own coach, Marek, checks off and
// closes the session. The pages are driven the way the coordinators, the guardian, the ward with an account and the
// coaches use them; the API is used for the setup J-002 does not describe (the club, its sections and places, the staff,
// the family and their accounts, a session of another team that clashes with the new series, Ola's match), for moving a
// session so it has started (the clock cannot be waited for) and to check what was stored. The exit gate rides on the
// same tenant: the attendance list at 375 px in light and dark mode with the 320 px reflow, and the swimming pool class
// group of the second section in the same guardian calendar as the Żaki training. The en + pl catalogs of `groups` and
// `activities` are checked by the `i18n` steps of `yarn verify`, not here. Where the installed product differs from
// J-002's wording, the installed behaviour accepted with stories #30–#34 is asserted (see the comments).
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const TRAINING = 'Żaki training'
// The club spec's activity "Class": the installed activity types have no `class` (`lib/activities-rules.ts`
// `ACTIVITY_TYPES`), so the pool's weekly class is a `training` of a `class_group`, as in TEST-008.
const CLASS = 'Swimming class'
const POOL_GROUP = 'Basen — początkujący'
const SPARRING = 'Sparing Trampkarzy'
const MATCH = 'Mecz Trampkarzy'
const PITCH = 'Boisko piłkarskie'
const POOL_PLACE = 'Pływalnia miejska'
const HORIZON_DAYS = 16 * 7

const CREATE = /^Create$|^Utwórz$/
const CONFLICT_STATUS = /^Conflict$|^Kolizja$/
const ADD_TO_GROUP = /^Add to group$|^Dodaj do grupy$/
const PRESENT = /^(Present|Obecny)$/
const LATE = /^(Late|Spóźniony)$/

type Account = { personId: string; userId: string; email: string }

/** Signs `user` in to the browser (a new password ends the user's earlier tokens) and returns a fresh API token. */
async function signIn(page: Page, request: APIRequestContext, club: Club, user: Account): Promise<string> {
  await page.context().clearCookies()
  const password = await signInBrowser(page, request, club, user.userId, user.email)
  return getAuthToken(request, user.email, password)
}

/**
 * Chooses an option of a `CrudForm` select (its labels are not bound to the controls; lesson `integration-fixture-…`).
 * The form moves the focus once it has loaded, which closes a list opened earlier (lesson
 * `platform-date-picker-and-crudform-redirects-in-tests`), so the opening is retried until the option shows.
 */
async function chooseCrudOption(page: Page, field: string, option: RegExp): Promise<void> {
  const trigger = page.locator(`[data-crud-field-id="${field}"] [role="combobox"]`)
  const choice = page.getByRole('option', { name: option })
  await expect(async () => {
    if (!(await choice.isVisible())) await trigger.click({ timeout: 2_000 })
    await expect(choice).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await choice.click()
}

/** Picks a person in a `LookupSelect` (searched by last name) inside `scope`, as in the J-001 test. */
async function lookupPerson(scope: Locator, lastName: string, fullName: string): Promise<void> {
  await scope.getByPlaceholder(/Search by last name|Szukaj po nazwisku/).fill(lastName)
  await scope.getByRole('option', { name: new RegExp(fullName) }).click()
  await expect(scope.getByRole('option', { name: new RegExp(fullName) })).toHaveAttribute('aria-selected', 'true')
}

/** "{count} sessions until {until}, {conflicts} with conflicts." — the preview summary in either locale. */
function previewSummary(count: number, until: string, conflicts: number): RegExp {
  return new RegExp(
    `^(${String(count)} sessions until ${until}, ${String(conflicts)} with conflicts\\.|` +
      `Terminy do ${until}: ${String(count)}, w tym z kolizjami: ${String(conflicts)}\\.)$`,
  )
}

type WizardInput = {
  group: RegExp
  name: string
  place: RegExp
  coach: { lastName: string; fullName: string }
  startsOn: string
  start: string
  end: string
  weekday: WeekdayCode
  until: string
}

/**
 * Fills the activity wizard (`/backend/activities/activities/create`): group, name, place, coach (a person combobox
 * searched by last name), first day, wall times and a weekly rule on one weekday ending on `until`. The type keeps its
 * default, `training`. The selects load their options after hydration, so they are opened once the page has settled.
 */
async function fillActivityWizard(page: Page, input: WizardInput): Promise<void> {
  await page.goto('/backend/activities/activities/create')
  await expect(page.getByRole('heading', { level: 1, name: /^New activity$|^Nowe zajęcia$/ })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await chooseCrudOption(page, 'groupId', input.group)
  await page.locator('[data-crud-field-id="name"] input').fill(input.name)
  await chooseCrudOption(page, 'placeId', input.place)
  const coach = page.locator('[data-crud-field-id="coachPersonId"] input[role="combobox"]')
  await coach.fill(input.coach.lastName)
  await page.getByRole('option', { name: input.coach.fullName }).click()
  await expect(coach).toHaveValue(input.coach.fullName)
  await page.locator('[data-crud-field-id="startsOn"] input').fill(input.startsOn)
  await page.locator('[data-crud-field-id="startTime"] input').fill(input.start)
  await page.locator('[data-crud-field-id="endTime"] input').fill(input.end)
  await page.getByTestId('activities-repeat-weekly').click()
  const day = page.getByTestId(`activities-weekday-${input.weekday}`)
  await day.click()
  await expect(day).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('activities-recurrence-end-until').click()
  await page.getByTestId('activities-recurrence-until').fill(input.until)
}

/** Creates the filled-in activity and returns its id from the record page the form redirects to. */
async function saveActivityWizard(page: Page): Promise<string> {
  await page.getByRole('button', { name: CREATE }).first().click()
  await expect(page).toHaveURL(/\/backend\/activities\/activities\/[0-9a-f-]{36}$/)
  return page.url().split('/').pop() as string
}

/** Adds a person to the roster of the open group record (`RosterPanel`) with a role. */
async function addToRoster(page: Page, person: { lastName: string; fullName: string }, role: RegExp): Promise<void> {
  const form = page.getByRole('form', { name: ADD_TO_GROUP })
  await lookupPerson(form, person.lastName, person.fullName)
  await form.locator('#groups-membership-role').click()
  await page.getByRole('option', { name: role }).click()
  await form.getByRole('button', { name: ADD_TO_GROUP }).click()
  await expect(
    page
      .getByRole('list', { name: /Members of the group|Członkowie grupy/ })
      .getByRole('listitem')
      .filter({ hasText: person.fullName }),
  ).toBeVisible()
}

/** Opens the member calendar as a coach on the week of `date` (`/club/calendar`, "Show" → "As coach"). */
async function openCoachCalendar(page: Page, date: string): Promise<void> {
  await page.goto('/club/calendar')
  await page.getByLabel(/^(Show|Pokaż)$/).click()
  await page.getByRole('option', { name: /As coach|Jako trener/ }).click()
  await showCalendarWeekOf(page, date)
}

test('J-002 training with declaration and attendance on a fresh tenant, without the substitution steps: the series in the wizard with its preview and place conflict, the role calendars, the pool class group of the second section in the same guardian calendar, absence-only and confirm declarations with the guardian decision, check-off with a version conflict and close, the errors; phase 2 exit gate', async ({
  page,
  request,
  browser,
}, testInfo) => {
  const club = await createClub(request, 'j-002')
  try {
    page.setDefaultTimeout(30_000)
    const admin = club.adminToken
    const today = calendarDate()
    const tomorrow = addDays(today, 1)
    const since = addDays(today, -30)
    const horizon = addDays(today, HORIZON_DAYS)
    // "Until a date some weeks ahead": beyond the 16-week horizon, so the horizon decides how far the sessions go.
    const until = addDays(today, 20 * 7)
    // The calendar week J-002's guardian looks at: next Monday–Sunday, so the test passes on every weekday, Sunday
    // included (the member calendar opens on today's week and moves forward with `showCalendarWeekOf`).
    const nextMonday = addDays(mondayOf(today), 7)
    const tuesday = addDays(nextMonday, 1)
    const thursday = addDays(nextMonday, 3)
    // The Tuesday of the week after, when another team already plays on the pitch: the wizard's place conflict.
    const clashDay = addDays(nextMonday, 8)
    const matchDay = nextWeekday(addDays(today, 2), 'SA')
    const allTuesdays = weekdaysBetween(tomorrow, horizon, 'TU')
    const trainingDays = allTuesdays.filter((day) => day !== clashDay)
    const classDays = weekdaysBetween(tomorrow, horizon, 'TH')

    // --- Setup J-002 does not describe ---
    // The club: account threshold 13 (Ola, 14, has an account; J-001 step 1) and the default declaration policies
    // `setup.ts` seeds for a club set up by `mercato init`.
    const settings = await updateClubSettings(request, admin, { ownAccountMinAge: 13 })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    await ensureDefaultPolicies(request, club)
    // Two sections, the pitch under "Orlik 2024" (one group at a time) and the pool.
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const pool = await createStructure(request, admin, 'sections', { name: 'Basen' })
    const orlik = await createStructure(request, admin, 'places', { name: 'Orlik 2024', kind: 'complex' })
    const pitch = await createStructure(request, admin, 'places', {
      name: PITCH,
      kind: 'pitch',
      parentPlaceId: orlik,
      capacityGroups: 1,
    })
    const poolPlace = await createStructure(request, admin, 'places', { name: POOL_PLACE, kind: 'pool' })
    // The academy's teams: Żaki (Jaś) and Trampkarze (Ola, 14).
    const zaki = await createGroup(request, admin, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const trampkarze = await createGroup(request, admin, { sectionId: academy, name: 'Trampkarze', kind: 'team' })
    // Staff. J-002 does not name "the coordinator" of step 1: J-001 makes Marek the academy's coordinator, while J-002
    // step 4 has a coordinator other than Marek. The academy gets its own coordinator, so Marek acts only as the coach of
    // Żaki and his check-off is recorded as a coach's. Ewa coordinates the pool; Bartek coaches Trampkarze, so he is a
    // coach from outside Żaki (step 6). The instructor needs no account.
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Krystyna',
      lastName: 'Zajac',
      role: 'coordinator',
      sectionId: academy,
    })
    const ewa = await signedInStaff(request, club, {
      firstName: 'Ewa',
      lastName: 'Wrona',
      role: 'coordinator',
      sectionId: pool,
    })
    const marek = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Lis', role: 'coach' })
    const bartek = await signedInStaff(request, club, { firstName: 'Bartek', lastName: 'Sowa', role: 'coach' })
    await addMembership(request, admin, { groupId: zaki, personId: marek.personId, role: 'coach', validFrom: since })
    await addMembership(request, admin, {
      groupId: trampkarze,
      personId: bartek.personId,
      role: 'coach',
      validFrom: since,
    })
    const instructorId = await createPerson(request, admin, {
      firstName: 'Irena',
      lastName: 'Fala',
      birthDate: birthDateTurning(31),
    })
    // The family of J-001: Kasia, the guardian of Jaś (9, Żaki) and Ola (14, Trampkarze, with an account).
    const kasiaId = await createPerson(request, admin, {
      firstName: 'Kasia',
      lastName: 'Nowak',
      birthDate: birthDateTurning(38, -30),
    })
    const jasId = await createPerson(request, admin, {
      firstName: 'Jaś',
      lastName: 'Nowak',
      birthDate: birthDateTurning(9, -30),
    })
    const olaId = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Nowak',
      birthDate: birthDateTurning(14, -30),
    })
    for (const wardPersonId of [jasId, olaId]) {
      await createGuardianship(request, admin, {
        guardianPersonId: kasiaId,
        wardPersonId,
        isPrimaryPayer: true,
        consents: { regulations: true },
        validFrom: since,
      })
    }
    await addMembership(request, admin, { groupId: zaki, personId: jasId, role: 'participant', validFrom: since })
    await addMembership(request, admin, {
      groupId: trampkarze,
      personId: olaId,
      role: 'participant',
      validFrom: since,
    })
    const kasia = await memberAccount(request, club, kasiaId, 'kasia')
    const ola = await memberAccount(request, club, olaId, 'ola')
    // Trampkarze's sessions on the same pitch: a sparring on the Tuesday of the week after next (17:30–19:00, the clash
    // the wizard shows) and Ola's Saturday match (`confirm`).
    await createActivity(request, coordinator.token, {
      groupId: trampkarze,
      name: SPARRING,
      type: 'sparring',
      placeId: pitch,
      startsOn: clashDay,
      startTime: '17:30',
      endTime: '19:00',
    })
    const match = await createActivity(request, coordinator.token, {
      groupId: trampkarze,
      name: MATCH,
      type: 'match',
      placeId: pitch,
      startsOn: matchDay,
      startTime: '10:00',
      endTime: '11:30',
    })
    const matchSession = (await sessionsOf(request, club, match.id)).at(0)
    if (!matchSession) throw new Error('[internal] the match has no session')
    expect(matchSession.occurrenceDate).toBe(matchDay)
    // The last-name search behind the person pickers runs on search tokens that are built after the write.
    for (const [lastName, ids] of [
      ['Lis', [marek.personId]],
      ['Fala', [instructorId]],
      ['Nowak', [jasId, kasiaId, olaId].sort()],
    ] as const) {
      await expect
        .poll(async () => (await persons(request, admin, `&lastName=${lastName}`)).items.map((p) => p.id).sort())
        .toEqual(ids)
    }

    let trainingId = ''
    await test.step('step 1: the coordinator creates "Żaki training" in the wizard; the preview shows the first sessions and a place conflict before saving', async () => {
      await signIn(page, request, club, coordinator)
      await fillActivityWizard(page, {
        group: /^Żaki$/,
        name: TRAINING,
        place: new RegExp(`^Orlik 2024 › ${PITCH}$`),
        coach: { lastName: 'Lis', fullName: 'Marek Lis' },
        startsOn: tomorrow,
        start: '17:00',
        end: '18:30',
        weekday: 'TU',
        until,
      })

      // The preview lists the series' sessions in the 16-week horizon; Trampkarze's sparring clashes on one Tuesday.
      await page.getByTestId('activities-preview-button').click()
      const summary = page.getByTestId('activities-preview-summary')
      await expect(summary).toHaveText(previewSummary(allTuesdays.length, horizon, 1))
      const previewTable = page.getByTestId('activities-preview-table')
      await expect(previewTable.getByText(CONFLICT_STATUS)).toHaveCount(1)
      await expect(previewTable.getByText(SPARRING)).toBeVisible()
      await expect(previewTable.getByText('17:00–18:30').first()).toBeVisible()

      // A save with the clash would be refused (no "save anyway", TEST-012): the coordinator skips that Tuesday with an
      // exception date and previews again — every session is free.
      await page.getByTestId('activities-exdate-input').fill(clashDay)
      await page.getByTestId('activities-exdate-add').click()
      await expect(page.getByTestId(`activities-exdate-remove-${clashDay}`)).toBeVisible()
      await page.getByTestId('activities-preview-button').click()
      await expect(summary).toHaveText(previewSummary(trainingDays.length, horizon, 0))
      await expect(previewTable.getByText(CONFLICT_STATUS)).toHaveCount(0)

      trainingId = await saveActivityWizard(page)
      await expect(page.getByRole('heading', { level: 1, name: TRAINING })).toBeVisible()
      const stored = await getActivity(request, admin, trainingId)
      expect(stored.status, JSON.stringify(stored.body)).toBe(200)
      expect(stored.body).toMatchObject({
        groupId: zaki,
        name: TRAINING,
        type: 'training',
        placeId: pitch,
        coachPersonId: marek.personId,
        startsOn: tomorrow,
        startTime: '17:00',
        endTime: '18:30',
        generatedUntil: horizon,
        isActive: true,
      })
      const compact = (date: string) => date.replaceAll('-', '')
      expect(stored.body?.recurrenceRule).toContain('FREQ=WEEKLY')
      expect(stored.body?.recurrenceRule).toContain('BYDAY=TU')
      expect(stored.body?.recurrenceRule).toContain(`UNTIL=${compact(until)}`)
      expect(stored.body?.recurrenceRule).toContain(`EXDATE:${compact(clashDay)}`)
    })

    let tuesdaySessionId = ''
    await test.step('step 2: the sessions are generated for the 16-week horizon and fill the coach and guardian calendars', async () => {
      const sessions = await sessionsOf(request, club, trainingId)
      expect(sessions.map((session) => session.occurrenceDate)).toEqual(trainingDays)
      for (const session of sessions) {
        expect(session).toMatchObject({
          groupId: zaki,
          placeId: pitch,
          coachPersonId: marek.personId,
          status: 'planned',
          isDetached: false,
        })
        expect([wallTime(String(session.startAt)), wallTime(String(session.endAt))]).toEqual(['17:00', '18:30'])
      }
      tuesdaySessionId = String(sessions.find((session) => session.occurrenceDate === tuesday)?.id)

      // The role calendars (at most 62 days per read): Marek's coach perspective and Kasia's guardian perspective list
      // the same Tuesdays, the guardian's for Jaś only.
      const window = `from=${tomorrow}&to=${addDays(tomorrow, 61)}`
      const inWindow = trainingDays.filter((day) => day <= addDays(tomorrow, 61))
      const coachEntries = (await calendarItems(request, marek.token, `${window}&as=coach`)).filter(
        (entry) => entry.occurrence.activityId === trainingId,
      )
      expect(coachEntries.map((entry) => entry.occurrence.occurrenceDate)).toEqual(inWindow)
      expect(coachEntries[0]?.summary).toMatchObject({ kind: 'absence_only', expected: 1, absent: 0 })
      const guardianEntries = (await calendarItems(request, kasia.token, `${window}&as=guardian`)).filter(
        (entry) => entry.occurrence.activityId === trainingId,
      )
      expect(guardianEntries.map((entry) => entry.occurrence.occurrenceDate)).toEqual(inWindow)
      for (const entry of guardianEntries) {
        expect(entry.persons.map((person) => person.personId)).toEqual([jasId])
        expect(entry.declarationKind).toBe('absence_only')
      }

      // Marek sees next week's training in his calendar on `/club/calendar`.
      await signIn(page, request, club, marek)
      await openCoachCalendar(page, tuesday)
      const item = page.getByTestId('calendar-item').filter({ hasText: TRAINING })
      await expect(item).toHaveCount(1)
      await expect(item).toContainText('17:00')
      await expect(item).toContainText(PITCH)
      await expect(item).toContainText(/Expected: 1 · absent: 0|Oczekiwani: 1 · nieobecni: 0/)
    })

    let poolGroupId = ''
    let classId = ''
    await test.step('step 3: Ewa creates the class group "Basen — początkujący" with the instructor and Jaś, and its weekly class', async () => {
      const ewaToken = await signIn(page, request, club, ewa)
      await page.goto('/backend/groups/groups/create')
      await page.locator('[data-crud-field-id="name"] input').fill(POOL_GROUP)
      await chooseCrudOption(page, 'kind', /Class group|Grupa zajęciowa/)
      await chooseCrudOption(page, 'sectionId', /^Basen$/)
      await page.getByRole('button', { name: CREATE }).first().click()
      await expect(page).toHaveURL(/\/backend\/groups\/groups\/[0-9a-f-]{36}$/)
      await expect(page.getByRole('heading', { level: 1, name: POOL_GROUP })).toBeVisible()
      poolGroupId = page.url().split('/').pop() as string

      // The roster: the instructor (a class group's coach) and Jaś, who is now in groups of both sections.
      await addToRoster(page, { lastName: 'Fala', fullName: 'Irena Fala' }, /^Instructor$|^Instruktor$/)
      await addToRoster(page, { lastName: 'Nowak', fullName: 'Jaś Nowak' }, /^Participant$|^Uczestnik$/)
      const members = await roster(request, admin, poolGroupId)
      expect(members.status).toBe(200)
      expect(
        Object.fromEntries(members.items.map((item) => [item.personId, [item.role, item.validFrom, item.validTo]])),
      ).toEqual({ [instructorId]: ['coach', today, null], [jasId]: ['participant', today, null] })

      // The weekly class on Thursdays 16:00–17:00 at the pool, led by the instructor. The wizard's group select loads
      // its options once, from the group list, so the new group must be listed for Ewa before the wizard opens.
      await expect
        .poll(async () => (await listGroups(request, ewaToken, '&isActive=true')).items.map((group) => group.id))
        .toContain(poolGroupId)
      await fillActivityWizard(page, {
        group: new RegExp(`^${POOL_GROUP}$`),
        name: CLASS,
        place: new RegExp(`^${POOL_PLACE}$`),
        coach: { lastName: 'Fala', fullName: 'Irena Fala' },
        startsOn: tomorrow,
        start: '16:00',
        end: '17:00',
        weekday: 'TH',
        until,
      })
      await page.getByTestId('activities-preview-button').click()
      await expect(page.getByTestId('activities-preview-summary')).toHaveText(
        previewSummary(classDays.length, horizon, 0),
      )
      classId = await saveActivityWizard(page)
      const stored = await getActivity(request, admin, classId)
      expect(stored.body).toMatchObject({
        groupId: poolGroupId,
        sectionId: pool,
        name: CLASS,
        type: 'training',
        placeId: poolPlace,
        coachPersonId: instructorId,
        startTime: '16:00',
        endTime: '17:00',
      })
      expect((await sessionsOf(request, club, classId)).map((session) => session.occurrenceDate)).toEqual(classDays)
    })

    let thursdaySessionId = ''
    let kasiaToken = ''
    await test.step('step 3: Kasia sees the Żaki training and the pool class for Jaś in one calendar and reports absence for the class only', async () => {
      kasiaToken = await signIn(page, request, club, kasia)
      await page.goto('/club/calendar')
      await showCalendarWeekOf(page, tuesday)
      const training = page.getByTestId('calendar-item').filter({ hasText: TRAINING })
      const poolClass = page.getByTestId('calendar-item').filter({ hasText: CLASS })
      await expect(training).toHaveCount(1)
      await expect(poolClass).toHaveCount(1)
      for (const [item, time, place, section] of [
        [training, '17:00', PITCH, 'Akademia piłkarska'],
        [poolClass, '16:00', POOL_PLACE, 'Basen'],
      ] as const) {
        await expect(item).toContainText('Jaś')
        await expect(item).toContainText(time)
        await expect(item).toContainText(place)
        await expect(item).toContainText(section)
        await expect(item).toContainText(/Jaś: (Expected|Spodziewany)/)
      }

      // Both use `absence_only`: "Report absence" for the Thursday class; the Tuesday training needs no answer.
      await poolClass.getByRole('button', { name: /^(Report absence|Zgłoś nieobecność) — Jaś$/ }).click()
      await expect(poolClass).toContainText(/Jaś: (Absent|Nieobecny)/)
      await expect(training).toContainText(/Jaś: (Expected|Spodziewany)/)

      const week = await calendarItems(
        request,
        kasiaToken,
        `from=${nextMonday}&to=${addDays(nextMonday, 6)}&as=guardian`,
      )
      const trainingEntry = entryOf(week, tuesdaySessionId)
      const classEntry = week.find(
        (entry) => entry.occurrence.activityId === classId && entry.occurrence.occurrenceDate === thursday,
      )
      if (!classEntry)
        throw new Error(`[test] the class of ${thursday} is not in the calendar: ${JSON.stringify(week)}`)
      thursdaySessionId = classEntry.occurrence.id
      expect(
        [trainingEntry, classEntry].map((entry) => [
          entry.occurrence.sectionName,
          entry.occurrence.groupName,
          entry.declarationKind,
          entry.persons.map((person) => person.personId),
        ]),
      ).toEqual([
        ['Akademia piłkarska', 'Żaki', 'absence_only', [jasId]],
        ['Basen', POOL_GROUP, 'absence_only', [jasId]],
      ])
      expect(personOf(trainingEntry, jasId).declaration).toBeNull()
      expect(personOf(classEntry, jasId).declaration).toMatchObject({ declared: 'no', declarationStatus: 'final' })
    })

    let olaAttendanceId = ''
    let olaToken = ''
    await test.step('step 3: Ola declares for the Saturday match herself and waits for the guardian; the 24-hour policy applies', async () => {
      olaToken = await signIn(page, request, club, ola)
      await page.goto('/club/calendar')
      await showCalendarWeekOf(page, matchDay)
      const item = page.getByTestId('calendar-item').filter({ hasText: MATCH })
      await expect(item).toHaveCount(1)
      await item.getByRole('link').first().click()
      await expect(page).toHaveURL(new RegExp(`/club/occurrences/${matchSession.id}`))
      await expect(page.getByTestId('club-session-title')).toHaveText(MATCH)
      const own = page.getByTestId('club-session-person').filter({ hasText: 'Ola' })
      await expect(own).toContainText(/Your guardian confirms your answer|Twój opiekun potwierdza/)
      await own.getByRole('button', { name: /^(Attending|Będzie) — Ola$/ }).click()
      await expect(own.getByTestId('club-session-declaration')).toHaveText(
        /^(Awaiting guardian confirmation|Czeka na potwierdzenie opiekuna)$/,
      )

      const stored = await readCalendarItem(request, olaToken, matchSession.id, 'as=self')
      expect(stored.status, JSON.stringify(stored.body)).toBe(200)
      expect(stored.body?.declarationKind).toBe('confirm')
      const declaration = personOf(stored.body as never, olaId).declaration
      expect(declaration).toMatchObject({ declared: 'yes', declarationStatus: 'pending_guardian' })
      olaAttendanceId = String(declaration?.attendanceId)
      // The default match policy (`guardian_confirm`, 24 hours, then the ward's answer stands): the deadline is 24
      // hours after the declaration. The expiry itself is driven through the CLI in TEST-009, not waited for here.
      expect(Date.parse(String(declaration?.pendingUntil)) - Date.parse(String(declaration?.declaredAt))).toBe(
        24 * 3_600_000,
      )
      const policies = await listPolicies(request, admin)
      expect(
        policies.items.find((item) => item.scope === 'activity_type' && item.activityType === 'match'),
      ).toMatchObject({
        minorDeclarationMode: 'guardian_confirm',
        confirmTimeoutHours: 24,
        defaultAfterTimeout: 'declared',
      })
    })

    await test.step("step 3: Kasia gets the notification and approves Ola's answer", async () => {
      const query = `&type=activities.guardian_confirmation_needed&sourceEntityId=${olaAttendanceId}`
      await expect
        .poll(async () => (await readNotifications(request, kasiaToken, query)).length, { timeout: 30_000 })
        .toBe(1)
      const notice = (await readNotifications(request, kasiaToken, query)).at(0)
      expect(notice?.titleVariables).toMatchObject({
        ward: 'Ola Nowak',
        activity: MATCH,
        date: matchDay,
        time: '10:00',
      })
      // Ola, who declared, is not notified.
      expect(await readNotifications(request, olaToken, query)).toEqual([])

      kasiaToken = await signIn(page, request, club, kasia)
      await page.goto('/club')
      await page.getByTestId('club-today-pending').filter({ hasText: MATCH }).click()
      await expect(page.getByTestId('club-session-title')).toHaveText(MATCH)
      const ward = page.getByTestId('club-session-person').filter({ hasText: 'Ola' })
      await ward
        .getByTestId('club-session-decision')
        .getByRole('button', { name: /^(Approve|Zatwierdź) — Ola$/ })
        .click()
      await expect(ward.getByTestId('club-session-declaration')).toHaveText(/^(Attending|Będzie)$/)
      await expect(ward.getByTestId('club-session-decision')).toHaveCount(0)
      const decided = await readCalendarItem(request, kasiaToken, matchSession.id, `as=guardian&personId=${olaId}`)
      expect(personOf(decided.body as never, olaId).declaration).toMatchObject({
        attendanceId: olaAttendanceId,
        declared: 'yes',
        declarationStatus: 'final',
        pendingUntil: null,
      })
      expect(personOf(decided.body as never, olaId).declaration?.guardianDecidedAt).not.toBeNull()
    })

    await test.step('step 6: once the training has started, declarations are closed', async () => {
      // The session cannot be waited for: it is moved (as the administrator) to have started 30 minutes ago. It keeps
      // its date, so the roster stays the same.
      await startNow(request, club, tuesdaySessionId)
      await page.goto(`/club/occurrences/${tuesdaySessionId}`)
      await expect(page.getByTestId('club-session-title')).toHaveText(TRAINING)
      await expect(page.getByTestId('club-session-closed')).toHaveText(
        /Declarations closed: the session has started\.|Deklaracje zamknięte: zajęcia już się rozpoczęły\./,
      )
      await expect(page.getByRole('button', { name: /Report absence|Zgłoś nieobecność/ })).toHaveCount(0)
      const late = await declare(request, kasiaToken, {
        occurrenceId: tuesdaySessionId,
        personId: jasId,
        declared: 'no',
      })
      expect(late.status, JSON.stringify(late.body)).toBe(409)
      expect(late.body?.code).toBe('declaration_closed')
      // The class Kasia reported an absence for has not started: it keeps her answer.
      const classStored = await readCalendarItem(request, kasiaToken, thursdaySessionId, 'as=guardian')
      expect(personOf(classStored.body as never, jasId).declaration?.declared).toBe('no')
    })

    const attendanceUrl = `/club/occurrences/${tuesdaySessionId}/attendance`
    const row = (scope: Page) => scope.getByTestId('club-attendance-row').filter({ hasText: 'Jaś' })

    await test.step('steps 5 and 6: Marek checks off on his phone; the coordinator saved meanwhile, so Marek gets a version conflict and a refreshed list', async () => {
      await signIn(page, request, club, marek)
      await prepareForAccessibilityScan(page)
      await page.setViewportSize({ width: 375, height: 812 })
      // From the coach calendar to the attendance list of the started training.
      await openCoachCalendar(page, tuesday)
      const item = page.getByTestId('calendar-item').filter({ hasText: TRAINING })
      await item.getByRole('link').first().click()
      await expect(page).toHaveURL(new RegExp(`${attendanceUrl}$`))
      await expect(page.getByTestId('club-attendance-title')).toContainText(TRAINING)
      await expect(page.getByTestId('club-attendance-summary')).toHaveText(
        /^(Expected: 1 · absent: 0|Oczekiwani: 1 · nieobecni: 0)$/,
      )
      await expect(page.getByTestId('club-attendance-not-started')).toHaveCount(0)
      await expect(page.getByTestId('club-attendance-row')).toHaveCount(1)
      await expect(row(page).getByTestId('club-attendance-expectation')).toHaveText(/^(Expected|Oczekiwany)$/)
      await row(page).getByRole('radio', { name: PRESENT }).click()

      // At the same time the academy's coordinator checks off the same list on another device and saves first.
      const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL, timezoneId: 'Europe/Warsaw' })
      try {
        const coordinatorPage = await other.newPage()
        coordinatorPage.setDefaultTimeout(30_000)
        await signInBrowser(coordinatorPage, request, club, coordinator.userId, coordinator.email)
        await coordinatorPage.goto(attendanceUrl)
        await row(coordinatorPage).getByRole('radio', { name: LATE }).click()
        await coordinatorPage.getByTestId('club-attendance-save').click()
        await expect(coordinatorPage.getByTestId('club-attendance-announcement')).toHaveText(
          /Attendance saved|Obecność zapisana/,
        )
      } finally {
        await other.close()
      }

      // Marek saves second: 409, the shared conflict bar, the list refreshed with the coordinator's mark and his own
      // selection kept.
      const [refused] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/activities/occurrences/${tuesdaySessionId}/attendance`) &&
            response.request().method() === 'PUT',
        ),
        page.getByTestId('club-attendance-save').click(),
      ])
      expect(refused.status()).toBe(409)
      await expect(page.getByTestId('record-conflict-banner')).toBeVisible()
      await expect(row(page).getByTestId('club-attendance-marked-by')).toContainText(/coordinator|koordynator/)
      await expect(row(page).getByRole('radio', { name: PRESENT })).toBeChecked()

      // Saving again with the refreshed version succeeds; the row says Marek marked it as the coach.
      await page.getByTestId('club-attendance-save').click()
      await expect(page.getByTestId('club-attendance-announcement')).toHaveText(/Attendance saved|Obecność zapisana/)
      await expect(row(page).getByTestId('club-attendance-marked-by')).toContainText('Marek Lis')
      await expect(row(page).getByTestId('club-attendance-marked-by')).toContainText(/coach|trener/)
      const stored = await readAttendanceList(request, admin, tuesdaySessionId)
      expect(stored.status, JSON.stringify(stored.body)).toBe(200)
      expect(stored.body && rowOf(stored.body, jasId)).toMatchObject({
        actual: 'present',
        markedByPersonId: marek.personId,
        markedAsRole: 'coach',
      })
      expect(stored.body?.occurrence?.status).toBe('planned')
    })

    await test.step('exit gate: the attendance list at 375 px in light and dark mode, and the 320 px reflow', async () => {
      await page.setViewportSize({ width: 375, height: 812 })
      const violations = await scanInColorSchemes(
        page,
        testInfo,
        '/club/occurrences/[id]/attendance',
        () => expect(row(page).getByRole('radio', { name: PRESENT })).toBeChecked(),
        { platformBaseline: true },
      )
      await expectNoPageOverflow(page)
      expect(violations).toEqual({})
      await page.setViewportSize({ width: 375, height: 812 })
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
      await page.reload()
    })

    await test.step('step 5: Marek closes the session, which becomes done', async () => {
      await page.getByTestId('club-attendance-close').click()
      const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: /^(Close session|Zamknij zajęcia)$/ }).click()
      await expect(page.getByTestId('club-attendance-done')).toBeVisible()
      await expect(page.getByRole('radio')).toHaveCount(0)
      await expect(row(page).getByTestId('club-attendance-actual')).toHaveText(PRESENT)
      const closed = await getOccurrence(request, admin, tuesdaySessionId)
      expect(closed.body?.status).toBe('done')
      await page.setViewportSize({ width: 1280, height: 720 })
    })

    await test.step('step 6: a coach from outside the group opens the list and gets 403', async () => {
      const bartekToken = await signIn(page, request, club, bartek)
      const [read] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith(`/api/activities/occurrences/${tuesdaySessionId}/attendance`) &&
            response.request().method() === 'GET',
        ),
        page.goto(attendanceUrl),
      ])
      expect(read.status()).toBe(403)
      // The page shows its own forbidden state, not the load error: the read opts out of the platform's 403 throw
      // (`OWN_FORBIDDEN_STATE`; lesson `apifetch-403-throws-before-page-branch`).
      await expect(page.getByTestId('club-attendance-missing')).toContainText(
        /This is not your session|To nie są Twoje zajęcia/,
      )
      await expect(
        page.getByText(/attendance list could not be loaded|Nie udało się wczytać listy obecności/),
      ).toHaveCount(0)
      await expect(page.getByText('Jaś Nowak')).toHaveCount(0)
      await expect(page.getByTestId('club-attendance-row')).toHaveCount(0)
      const refused = await readAttendanceList(request, bartekToken, tuesdaySessionId)
      expect(refused.status, JSON.stringify(refused.body)).toBe(403)
      expect(refused.body?.rows).toBeUndefined()
    })
  } finally {
    await club.cleanup()
  }
})
