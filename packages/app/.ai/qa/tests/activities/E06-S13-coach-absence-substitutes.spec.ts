import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  addDays,
  createActivity,
  getOccurrence,
  listOccurrences,
  readNotifications,
  type OccurrenceItem,
} from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, readCalendarItem, saveAttendanceList, sessionsOf, startNow } from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'

// Issue #95 (E06-S13; README M-04, B-15, B-01, flow F-03 path A; club spec REQ-008, DD-12, TEST-010): Marek, the
// assigned coach of a Żaki training tomorrow, reports an absence from his phone (375 px): the dialog, the toast and
// "Needs a coach"; the academy coordinator is notified and finds the session in "Needing a coach". The substitute
// dialog disables Irena, who runs the pool group at the same time, with "Busy: …", and a forged assignment of Irena
// answers 409 `occurrence_coach_conflict`; the coordinator assigns Bartek, who is notified. Closed by Bartek, the
// session keeps "Bartek for Marek" and its two entries, with the reasons encrypted at rest. A coach of another group
// gets 403 for the absence, and a session that ended over 24 hours ago without closing is "Unsettled" in the list, in
// the administrator's widget and on Marek's Today.
test.describe.configure({ timeout: 360_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const ABSENCE_REASON = 'Wyjazd służbowy do Krakowa'
const ASSIGN_REASON = 'Kurs trenerski Marka'

type AbsenceBody = { ok?: boolean; code?: string; substitutionEntryId?: string; coachPersonId?: string | null }
type AssignBody = {
  ok?: boolean
  code?: string
  kind?: string
  conflicts?: { kind: string; sessions: { id: string }[] }[]
}
type CoachOptions = {
  currentCoachPersonId: string | null
  items: { id: string; name: string; busy: { occurrenceId: string; activityName: string | null } | null }[]
}
type SessionDetail = OccurrenceItem & {
  substituteForPersonId: string | null
  substituteForName: string | null
  substitutions: {
    kind: string
    reason: string | null
    previousCoachPersonId: string | null
    newCoachPersonId: string | null
  }[]
}

const lock = (updatedAt: string | null | undefined): Record<string, string> =>
  updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: updatedAt } : {}

async function detail(request: APIRequestContext, token: string, id: string): Promise<SessionDetail> {
  const result = await getOccurrence(request, token, id)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body as SessionDetail
}

async function reportAbsence(
  request: APIRequestContext,
  token: string,
  id: string,
  updatedAt: string | null,
  data = {},
) {
  return call<AbsenceBody>(request, 'POST', `/api/activities/occurrences/${id}/absence`, token, {
    data,
    headers: lock(updatedAt),
  })
}

async function assignCoach(
  request: APIRequestContext,
  token: string,
  id: string,
  updatedAt: string | null,
  data: Record<string, unknown>,
) {
  return call<AssignBody>(request, 'POST', `/api/activities/occurrences/${id}/coach`, token, {
    data,
    headers: lock(updatedAt),
  })
}

/** A one-off training of `groupId` on `date` with the given coach; returns its session. */
async function training(
  request: APIRequestContext,
  club: Club,
  input: { groupId: string; placeId: string; name: string; date: string; coachPersonId: string },
): Promise<OccurrenceItem> {
  const { id } = await createActivity(request, club.adminToken, {
    groupId: input.groupId,
    name: input.name,
    type: 'training',
    placeId: input.placeId,
    coachPersonId: input.coachPersonId,
    startsOn: input.date,
    startTime: '17:00',
    endTime: '18:00',
  })
  const session = (await sessionsOf(request, club, id)).at(0)
  if (!session) throw new Error(`[test] the one-off ${input.name} has no session`)
  expect(session.coachPersonId).toBe(input.coachPersonId)
  return session
}

test('E06-S13 a coach reports an absence, the coordinator assigns a free substitute, the substitution is kept; unsettled sessions are listed', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'e06-s13')
  try {
    const family = await familyFor(request, club)
    const bartek = await signedInStaff(request, club, { firstName: 'Bartek', lastName: 'Zastępca', role: 'coach' })
    const tomorrow = addDays(calendarDate(), 1)
    const session = await training(request, club, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening Żaków',
      date: tomorrow,
      coachPersonId: family.coach.personId,
    })
    // Irena runs the pool group at the same time on another place: she is busy for the substitute dialog.
    const poolSession = await training(request, club, {
      groupId: family.poolGroup,
      placeId: family.poolPlace,
      name: 'Basen wieczorny',
      date: tomorrow,
      coachPersonId: family.instructor.personId,
    })

    // --- Negative: a coach of another group cannot report Marek's absence (403), nor a reason over 200 characters ---
    const foreign = await reportAbsence(request, family.instructor.token, session.id, session.updatedAt)
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)
    const tooLong = await reportAbsence(request, family.coach.token, session.id, session.updatedAt, {
      reason: 'x'.repeat(201),
    })
    expect(tooLong.status, JSON.stringify(tooLong.body)).toBe(400)
    expect((await detail(request, club.adminToken, session.id)).coachPersonId).toBe(family.coach.personId)

    // --- Marek on his phone (375 px): M-04 → "Report absence" → the dialog → the toast and "Needs a coach" ---
    page.setDefaultTimeout(30_000)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    // The browser sign-in sets a new password, which ends the API token: take a fresh one.
    family.coach.token = await getAuthToken(
      request,
      family.coach.email,
      await signInBrowser(page, request, club, family.coach.userId, family.coach.email),
    )
    await page.goto(`/club/occurrences/${session.id}?as=coach`)
    await expect(page.getByTestId('club-session-title')).toHaveText('Trening Żaków')
    await page.getByTestId('club-session-report-absence').click()
    const absenceDialog = page.getByTestId('club-absence-dialog')
    await expect(absenceDialog).toContainText(/Needing a coach|Do obsadzenia/)
    const dialogViolations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/occurrences/[id] report absence dialog',
      // The scan reloads the page for each scheme, which closes the dialog: open it again.
      async () => {
        await page.getByTestId('club-session-report-absence').click()
        await expect(page.getByTestId('club-absence-dialog')).toBeVisible()
      },
      { platformBaseline: true },
    )
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()
    await page.getByTestId('club-session-report-absence').click()
    await page.getByTestId('club-absence-reason').fill(ABSENCE_REASON)
    const absenceAnswer = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/activities/occurrences/${session.id}/absence`) &&
        response.request().method() === 'POST',
    )
    await page.getByTestId('club-absence-confirm').click()
    expect((await absenceAnswer).status()).toBe(200)
    await expect(
      page
        .getByText(
          /Absence reported — the coordinator has been notified|Zgłoszono nieobecność — koordynator dostał powiadomienie/,
        )
        .first(),
    ).toBeVisible()
    await expect(page.getByTestId('club-session-coach-needed')).toBeVisible()
    await expect(page.getByTestId('club-session-report-absence')).toHaveCount(0)
    await expectNoPageOverflow(page)

    // The session has no coach; the coordinator of the academy is notified, the coordinator of the pool is not.
    const afterAbsence = await detail(request, club.adminToken, session.id)
    expect(afterAbsence.coachPersonId).toBeNull()
    expect(afterAbsence.substitutions.map((entry) => entry.kind)).toEqual(['absence_reported'])
    expect(afterAbsence.substitutions[0]?.reason).toBe(ABSENCE_REASON)
    await expect
      .poll(async () =>
        (await readNotifications(request, family.academyCoordinator.token)).some(
          (item) => item.type === 'activities.coach_needed' && item.sourceEntityId === session.id,
        ),
      )
      .toBe(true)
    expect(
      (await readNotifications(request, family.poolCoordinator.token)).some(
        (item) => item.type === 'activities.coach_needed',
      ),
    ).toBe(false)
    // "Needing a coach": the academy coordinator's list has it, the pool coordinator's does not.
    const needing = await listOccurrences(request, family.academyCoordinator.token, '&unassigned=1')
    expect(needing.items.map((item) => item.id)).toContain(session.id)
    expect(needing.items.map((item) => item.id)).not.toContain(poolSession.id)
    const poolNeeding = await listOccurrences(request, family.poolCoordinator.token, '&unassigned=1')
    expect(poolNeeding.items.map((item) => item.id)).not.toContain(session.id)

    // --- The substitute dialog's options: Irena busy with the pool session, Marek and Bartek free ---
    const options = await call<CoachOptions>(
      request,
      'GET',
      `/api/activities/occurrences/${session.id}/coach`,
      family.academyCoordinator.token,
    )
    expect(options.status, JSON.stringify(options.body)).toBe(200)
    const byId = new Map((options.body?.items ?? []).map((item) => [item.id, item]))
    expect(byId.get(family.instructor.personId)?.busy).toMatchObject({
      occurrenceId: poolSession.id,
      activityName: 'Basen wieczorny',
    })
    expect(byId.get(bartek.personId)?.busy).toBeNull()
    expect(byId.get(family.coach.personId)?.busy).toBeNull()
    // The pool coordinator does not plan the academy's sessions.
    const foreignOptions = await call(
      request,
      'GET',
      `/api/activities/occurrences/${session.id}/coach`,
      family.poolCoordinator.token,
    )
    expect(foreignOptions.status).toBe(403)

    // Negative: a forged assignment of the busy Irena answers 409 with the overlapping session.
    const forged = await assignCoach(request, family.academyCoordinator.token, session.id, afterAbsence.updatedAt, {
      coachPersonId: family.instructor.personId,
    })
    expect(forged.status, JSON.stringify(forged.body)).toBe(409)
    expect(forged.body?.code).toBe('occurrence_coach_conflict')
    expect(forged.body?.conflicts?.[0]?.sessions.map((entry) => entry.id)).toEqual([poolSession.id])
    expect((await detail(request, club.adminToken, session.id)).coachPersonId).toBeNull()

    // --- The coordinator (desktop): B-15 "Needing a coach" → "Assign substitute" → Irena disabled → Bartek ---
    await page.setViewportSize({ width: 1280, height: 900 })
    family.academyCoordinator.token = await getAuthToken(
      request,
      family.academyCoordinator.email,
      await signInBrowser(page, request, club, family.academyCoordinator.userId, family.academyCoordinator.email),
    )
    await page.goto('/backend/activities/occurrences?perspective=unassigned')
    const row = page.getByRole('row').filter({ hasText: 'Trening Żaków' })
    await expect(row.getByTestId('occurrence-needs-coach')).toBeVisible()
    await row.getByRole('button', { name: /Open actions|Otwórz akcje/ }).click()
    await page.getByRole('menuitem', { name: /^(Assign substitute|Wskaż zastępcę)$/ }).click()
    const assignDialog = page.getByTestId('assign-coach-dialog')
    const irena = assignDialog.getByTestId('assign-coach-option').and(page.locator('[data-busy="true"]'))
    await expect(irena).toHaveCount(1)
    await expect(irena).toBeDisabled()
    await expect(assignDialog).toContainText(/Busy: Basen wieczorny|Zajęty: Basen wieczorny/)
    await assignDialog.getByRole('radio', { name: /Bartek Zastępca/ }).check()
    await assignDialog.getByTestId('assign-coach-reason').fill(ASSIGN_REASON)
    const assignAnswer = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/activities/occurrences/${session.id}/coach`) &&
        response.request().method() === 'POST',
    )
    await assignDialog.getByTestId('assign-coach-submit').click()
    const assigned = await assignAnswer
    expect(assigned.status()).toBe(200)
    expect(((await assigned.json()) as AssignBody).kind).toBe('substitute_assigned')
    await expect(
      page.getByText(/Bartek Zastępca will lead the session|Bartek Zastępca poprowadzi zajęcia/).first(),
    ).toBeVisible()

    // Bartek is notified and sees the session as the coach, with "(substitution)" for Marek.
    await expect
      .poll(async () =>
        (await readNotifications(request, bartek.token)).some(
          (item) => item.type === 'activities.substitution_assigned' && item.sourceEntityId === session.id,
        ),
      )
      .toBe(true)
    const asSubstitute = await readCalendarItem(request, bartek.token, session.id, 'as=coach')
    expect(asSubstitute.status, JSON.stringify(asSubstitute.body)).toBe(200)
    const substituteView = (asSubstitute.body as { occurrence?: SessionDetail } | null)?.occurrence
    expect(substituteView?.coachPersonId).toBe(bartek.personId)
    expect(substituteView?.substituteForPersonId).toBe(family.coach.personId)
    // The list row names whom Bartek stands in for.
    await expect
      .poll(async () => {
        const listed = await listOccurrences(request, family.academyCoordinator.token, '&unassigned=0')
        expect(listed.status).toBe(200)
        const row: (OccurrenceItem & { substituteForPersonId?: string | null }) | undefined = listed.items.find(
          (item) => item.id === session.id,
        )
        return row ? [row.coachPersonId, row.substituteForPersonId] : null
      })
      .toEqual([bartek.personId, family.coach.personId])

    // --- Bartek closes the session: the substitution stays, "Bartek for Marek" on the record ---
    const version = await startNow(request, club, session.id)
    const closed = await saveAttendanceList(request, bartek.token, session.id, { entries: [], complete: true }, version)
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    const done = await detail(request, club.adminToken, session.id)
    expect(done.status).toBe('done')
    expect(done.coachPersonId).toBe(bartek.personId)
    expect(done.substituteForName).toBe('Marek Trener')
    expect(
      done.substitutions.map((entry) => [entry.kind, entry.previousCoachPersonId, entry.newCoachPersonId]),
    ).toEqual([
      ['absence_reported', family.coach.personId, null],
      ['substitute_assigned', null, bartek.personId],
    ])
    await page.goto(`/backend/activities/occurrences/${session.id}`)
    await expect(page.getByTestId('occurrence-substitute-for')).toHaveText(
      /Bartek Zastępca for Marek Trener|Bartek Zastępca za Marek Trener/,
    )
    await expect(page.getByTestId('occurrence-substitutions').getByRole('listitem')).toHaveCount(2)
    // A closed session takes no more assignment, and the history is never rewritten by one.
    const late = await assignCoach(request, family.academyCoordinator.token, session.id, done.updatedAt, {
      coachPersonId: family.coach.personId,
    })
    expect(late.status, JSON.stringify(late.body)).toBe(409)

    // At rest: the two entries with their roles, the reasons encrypted.
    const stored = await withClient(async (client) => {
      const { rows } = await client.query<{ kind: string; reason: string | null; acting_role: string }>(
        'select kind, reason, acting_role from activities_substitution_entries where occurrence_id = $1 order by created_at, id',
        [session.id],
      )
      return rows
    })
    expect(stored.map((entry) => [entry.kind, entry.acting_role])).toEqual([
      ['absence_reported', 'coach'],
      ['substitute_assigned', 'coordinator'],
    ])
    for (const [entry, plain] of [
      [stored[0], ABSENCE_REASON],
      [stored[1], ASSIGN_REASON],
    ] as const) {
      expect(entry.reason).toBeTruthy()
      expect(entry.reason).not.toContain(plain)
    }

    // --- Unsettled: Marek's session three days ago was never closed ---
    const forgotten = await training(request, club, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening zapomniany',
      date: addDays(calendarDate(), 3),
      coachPersonId: family.coach.personId,
    })
    const threeDaysAgo = addDays(calendarDate(), -3)
    await withClient(async (client) => {
      await client.query(
        `update activities_occurrences set occurrence_date = $2, start_at = now() - interval '72 hours',
           end_at = now() - interval '71 hours' where id = $1`,
        [forgotten.id, threeDaysAgo],
      )
    })
    const forgottenNow = await detail(request, club.adminToken, forgotten.id)
    // Negative: an absence for a session that has started is refused.
    const tooLate = await reportAbsence(request, family.coach.token, forgotten.id, forgottenNow.updatedAt)
    expect(tooLate.status, JSON.stringify(tooLate.body)).toBe(409)
    expect(tooLate.body?.code).toBe('absence_after_start')
    const unsettled = await listOccurrences(request, family.academyCoordinator.token, '&unsettled=1')
    expect(unsettled.items.map((item) => item.id)).toEqual([forgotten.id])
    expect((await listOccurrences(request, family.poolCoordinator.token, '&unsettled=1')).items).toEqual([])

    // The administrator's dashboard widget counts it and opens B-15 "Unsettled".
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.goto('/backend')
    const widget = page.getByTestId('activities-widget-unsettledSessions')
    await expect(widget.getByTestId('activities-widget-unsettledSessions-count')).toHaveText('1')
    await expect(widget.getByRole('link', { name: /Trening zapomniany/ })).toBeVisible()
    await widget.getByRole('link', { name: /^(Open list|Otwórz listę)$/ }).click()
    await expect(page).toHaveURL(/\/backend\/activities\/occurrences\?perspective=unsettled$/)
    await expect(
      page.getByRole('row').filter({ hasText: 'Trening zapomniany' }).getByTestId('occurrence-unsettled'),
    ).toBeVisible()

    // Marek's Today (375 px): the "Unsettled session" alert leads to its attendance list.
    await page.setViewportSize({ width: 375, height: 812 })
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto('/club')
    const alert = page.getByTestId('club-today-unsettled-session').filter({ hasText: 'Trening zapomniany' })
    await expect(alert).toBeVisible()
    await alert.getByRole('link').click()
    await expect(page).toHaveURL(new RegExp(`/club/occurrences/${forgotten.id}/attendance$`))
    expect(dialogViolations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
