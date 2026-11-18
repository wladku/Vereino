import { expect, test, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  addDays,
  createActivity,
  getOccurrence,
  moveOccurrence,
  readNotifications,
  type NotificationItem,
} from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import {
  addParticipants,
  declare,
  familyFor,
  readAttendanceList,
  saveAttendanceList,
  sessionsOf,
} from '../_fixtures/attendance'
import { calendarDate, call, createClub, mercato, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// TEST-A20 (groups and activities parity spec REQ-A14, AC-A15, J-A04 steps 3–5; E10-S07 #272):
// - the attendance list of a training opens 30 minutes before the start: 31 minutes before, a save answers 409
//   `attendance_not_started` and the list says when it opens; 29 minutes before, the coach on a phone (375 px, light and
//   dark) taps "Mark expected participants as present" — 8 of 10 participants, the two reported absences stay unmarked
//   — and "Close session" records those two as absent;
// - `mercato activities set-up-club` run twice for a club set up before the job registers the schedule once;
// - an unassigned session of the group starting in 90 minutes: the warning job run twice warns the section's
//   coordinator, the group's coach and its assistant once each, and nothing about a session with a coach; the assistant
//   takes the session over (a history entry), the group's coach then gets 409 `occurrence_has_coach`, and the pool
//   instructor (another group) 403.
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const PRESENT = uiText('activities.club.attendance.actual.present', { exact: true })
const SESSION_WITHOUT_COACH = 'activities.session_without_coach'

/** Moves the session (as the administrator) to start `minutes` from now, for 90 minutes. */
async function startIn(request: APIRequestContext, club: Club, id: string, minutes: number): Promise<string> {
  const current = await getOccurrence(request, club.adminToken, id)
  expect(current.status, JSON.stringify(current.body)).toBe(200)
  const startAt = new Date(Date.now() + minutes * 60_000)
  const endAt = new Date(startAt.getTime() + 90 * 60_000)
  const moved = await moveOccurrence(
    request,
    club.adminToken,
    id,
    { startAt: startAt.toISOString(), endAt: endAt.toISOString() },
    current.body?.updatedAt,
  )
  expect(moved.status, JSON.stringify(moved.body)).toBe(200)
  return startAt.toISOString()
}

function warningsAbout(items: NotificationItem[], occurrenceId: string): NotificationItem[] {
  return items.filter((item) => item.type === SESSION_WITHOUT_COACH && item.sourceEntityId === occurrenceId)
}

async function warnSchedules(organizationId: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ schedule_value: string }>(
      `select schedule_value from scheduled_jobs where organization_id = $1 and name = $2 and deleted_at is null`,
      [organizationId, 'activities:warn-unassigned-sessions'],
    )
    return rows
  })
}

test('TEST-A20 the list opens 30 minutes before the start, the quick fill marks the expected, the unstaffed warning arrives once and an assistant takes the session over', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-a20')
  try {
    const family = await familyFor(request, club)
    const scope = ['--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]
    // Ten participants of Żaki: the family's three and seven more.
    await addParticipants(request, club, family.zaki, 7)
    const since = addDays(calendarDate(), -30)
    const assistant = await signedInStaff(request, club, { firstName: 'Tomek', lastName: 'Asystent', role: 'coach' })
    await addMembership(request, club.adminToken, {
      groupId: family.zaki,
      personId: assistant.personId,
      role: 'assistant',
      validFrom: since,
    })

    // --- The training: two absences reported, the list opens 30 minutes before the start ---
    const tomorrow = addDays(calendarDate(), 1)
    const training = await createActivity(request, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening poranny',
      type: 'training',
      coachPersonId: family.coach.personId,
      startsOn: tomorrow,
      startTime: '07:00',
      endTime: '08:30',
    })
    const trainingId = (await sessionsOf(request, club, training.id)).at(0)?.id
    if (!trainingId) throw new Error('[test] the training has no session')
    for (const [token, personId] of [
      [family.guardian.token, family.younger.personId],
      [family.other.guardian.token, family.other.child.personId],
    ] as const) {
      const reported = await declare(request, token, { occurrenceId: trainingId, personId, declared: 'no' })
      expect(reported.status, JSON.stringify(reported.body)).toBe(201)
    }

    const startAt = await startIn(request, club, trainingId, 31)
    const early = await readAttendanceList(request, family.coach.token, trainingId)
    expect(early.status, JSON.stringify(early.body)).toBe(200)
    expect(early.body?.checkOff).toBe('not_started')
    expect((early.body as { checkOffOpensAt?: string } | null)?.checkOffOpensAt).toBe(
      new Date(Date.parse(startAt) - 30 * 60_000).toISOString(),
    )
    expect(early.body?.summary).toMatchObject({ kind: 'absence_only', expected: 8, absent: 2 })
    const refused = await saveAttendanceList(
      request,
      family.coach.token,
      trainingId,
      { entries: [{ personId: family.elder.personId, actual: 'present' }] },
      early.body?.occurrence?.updatedAt,
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body?.code).toBe('attendance_not_started')

    await startIn(request, club, trainingId, 29)
    const open = await readAttendanceList(request, family.coach.token, trainingId)
    expect(open.body?.checkOff).toBe('open')

    // --- On a phone: one tap fills the 8 expected, the close records the two absences ---
    page.setDefaultTimeout(30_000)
    const password = await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    const coachToken = await getAuthToken(request, family.coach.email, password)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/club/occurrences/${trainingId}/attendance`)
    await expect(page.getByTestId('club-attendance-row')).toHaveCount(10)
    // Light and dark before the fill: the scan reloads the page, which drops unsaved marks.
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/occurrences/[id]/attendance (training)',
      async () => {
        await expect(page.getByTestId('club-attendance-row')).toHaveCount(10)
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()
    await expect(page.getByTestId('club-attendance-row')).toHaveCount(10)
    const fill = page.getByTestId('club-attendance-fill-declared')
    await expect(fill).toHaveAttribute('data-kind', 'absence_only')
    await expect(fill).toHaveText(uiText('activities.club.attendance.fillExpected', { exact: true }))
    await fill.click()
    await expect(page.getByRole('radio', { name: PRESENT, checked: true })).toHaveCount(8)
    for (const name of [family.younger.firstName, family.other.child.firstName]) {
      const row = page.getByTestId('club-attendance-row').filter({ hasText: name })
      await expect(row.getByRole('radio', { checked: true })).toHaveCount(0)
    }
    // Nothing is left to fill: the button is disabled and says why.
    await expect(fill).toBeDisabled()
    await expect(page.getByTestId('club-attendance-fill-nothing')).toHaveText(
      uiText('activities.club.attendance.fillNothing.absence_only', { exact: true }),
    )
    await expectNoPageOverflow(page)
    await page.getByTestId('club-attendance-close').click()
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await dialog.getByRole('button', { name: uiText('activities.club.attendance.close', { exact: true }) }).click()
    await expect(page).toHaveURL(/\/club$/)
    const closed = await readAttendanceList(request, coachToken, trainingId)
    expect(closed.body?.occurrence?.status).toBe('done')
    const marks = (closed.body?.rows ?? []).map((row) => row.actual)
    expect(marks.filter((mark) => mark === 'present')).toHaveLength(8)
    expect(marks.filter((mark) => mark === 'absent')).toHaveLength(2)

    // --- The schedule: registered once for a club set up before the job ---
    for (let run = 0; run < 2; run += 1) {
      expect(mercato(['activities', 'set-up-club', ...scope])).toMatchObject({
        schedules: { warnUnassignedSessions: true },
      })
    }
    expect(await warnSchedules(club.tenant.organizationId)).toEqual([{ schedule_value: '15m' }])

    // --- An unassigned session of Żaki in 90 minutes, and one with a coach at the same time ---
    const unstaffedActivity = await createActivity(request, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.poolPlace,
      name: 'Trening dodatkowy bez trenera',
      type: 'training',
      startsOn: tomorrow,
      startTime: '12:00',
      endTime: '13:00',
    })
    const unstaffedId = (await sessionsOf(request, club, unstaffedActivity.id)).at(0)?.id
    if (!unstaffedId) throw new Error('[test] the unstaffed activity has no session')
    await startIn(request, club, unstaffedId, 90)

    const recipients = [family.academyCoordinator.token, coachToken, assistant.token]
    for (let run = 0; run < 2; run += 1) {
      const result = mercato(['activities', 'warn-unassigned-sessions', ...scope]) as {
        sessions: number
        notified: number
        failed: number
      }
      expect(result.failed).toBe(0)
      // The first run tells the three; the second tells nobody again.
      expect(result.notified).toBe(run === 0 ? 3 : 0)
    }
    for (const token of recipients) {
      expect(warningsAbout(await readNotifications(request, token), unstaffedId)).toHaveLength(1)
    }
    // The pool's coordinator and the pool instructor are not told about Żaki; the closed training warns nobody.
    expect(warningsAbout(await readNotifications(request, family.poolCoordinator.token), unstaffedId)).toHaveLength(0)
    expect(warningsAbout(await readNotifications(request, family.instructor.token), unstaffedId)).toHaveLength(0)
    expect(warningsAbout(await readNotifications(request, coachToken), trainingId)).toHaveLength(0)

    // --- The take-over: the assistant first, then the coach (409) and the pool instructor (403) ---
    const asCoach = await call<{ mayTakeOver?: boolean }>(
      request,
      'GET',
      `/api/activities/calendar/${unstaffedId}?as=coach`,
      assistant.token,
    )
    expect(asCoach.body?.mayTakeOver).toBe(true)
    const takeOver = (token: string) =>
      call<{ coachPersonId?: string; kind?: string; code?: string }>(
        request,
        'POST',
        `/api/activities/occurrences/${unstaffedId}/take-over`,
        token,
        { data: {} },
      )
    const taken = await takeOver(assistant.token)
    expect(taken.status, JSON.stringify(taken.body)).toBe(200)
    expect(taken.body).toMatchObject({ coachPersonId: assistant.personId, kind: 'substitute_assigned' })
    const second = await takeOver(coachToken)
    expect(second.status, JSON.stringify(second.body)).toBe(409)
    expect(second.body?.code).toBe('occurrence_has_coach')
    const outside = await takeOver(family.instructor.token)
    expect(outside.status, JSON.stringify(outside.body)).toBe(403)

    const record = await call<{ coachPersonId?: string; substitutions?: Array<Record<string, unknown>> }>(
      request,
      'GET',
      `/api/activities/occurrences/${unstaffedId}`,
      club.adminToken,
    )
    expect(record.body?.coachPersonId).toBe(assistant.personId)
    expect(record.body?.substitutions).toEqual([
      expect.objectContaining({
        kind: 'substitute_assigned',
        previousCoachPersonId: null,
        newCoachPersonId: assistant.personId,
        decidedByPersonId: assistant.personId,
      }),
    ])
    // A session with a coach is not warned about any more.
    const after = mercato(['activities', 'warn-unassigned-sessions', ...scope]) as { sessions: number }
    expect(after.sessions).toBe(0)
  } finally {
    await club.cleanup()
  }
})
