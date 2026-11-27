import { expect, test, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { getAuthToken } from '../_fixtures/auth'
import { addDays, cancelOccurrence, createActivity, getOccurrence, moveOccurrence } from '../_fixtures/activities'
import { expectNoPageOverflow, prepareForAccessibilityScan, scanInColorSchemes } from '../_fixtures/axe'
import { familyFor, readAttendanceList, sessionsOf } from '../_fixtures/attendance'
import { calendarDate, call, createClub, uniqueSuffix, type Club } from '../_fixtures/club'
import { signInBrowser, switchBrowserUser } from '../_fixtures/club-structure'
import { awaitEmails } from '../_fixtures/communication'
import {
  acceptApplication,
  applicationIn,
  childApplication,
  confirmedApplication,
  notificationRows,
  openApplications,
} from '../_fixtures/enrolment'
import { roster } from '../_fixtures/groups'
import { uiText } from '../_fixtures/ui-text'

// TEST-J10 (section sign-up form spec phase 4, E26-S05 #801; REQ-J12 trial, REQ-J16, DD-J12, Q-J07, AC-J07, AC-J10):
// the trial session runs in the app. On a phone (375 px, light and dark) the section's coordinator opens an application
// that wants a trial and proposes one of the group's next sessions; the applicant gets the date, time, place and what to
// bring. A second trial while the first is still to come answers 409 (one at a time) and a session that is not the
// group's 422. The coach sees the child under "Trial participants" on the session's attendance page — not on the
// regular list — and marks her present; the read is recorded first, and a coach of another group gets 404. Another
// applicant's proposed session is withdrawn (e-mail, back to New), proposed again and then cancelled by the coordinator,
// which also returns it to New with an e-mail and an in-app notice. The regular attendance list, the coach units report
// and the PZPN attendance export are the same before and after; the child has no person and no membership until the
// coordinator accepts her after the trial, when the card no longer lists her.
test.describe.configure({ timeout: 480_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type TrialSessions = { items: Array<{ occurrenceId: string; placeLabel: string | null }> }
type TrialCard = {
  markable: boolean
  items: Array<{ applicationId: string; firstName: string; phone: string | null; outcome: string | null }>
}

const trialApi = (id: string) => `/api/enrolment/applications/${id}/trial`

function proposeTrial(request: APIRequestContext, token: string, id: string, data: Record<string, unknown>) {
  return call<{ state?: string; updatedAt?: string; code?: string }>(request, 'POST', trialApi(id), token, { data })
}

function withdrawTrial(request: APIRequestContext, token: string, id: string, updatedAt: string | undefined) {
  return call<{ state?: string; updatedAt?: string; code?: string }>(request, 'DELETE', trialApi(id), token, {
    data: { updatedAt },
  })
}

function trialCard(request: APIRequestContext, token: string, occurrenceId: string) {
  return call<TrialCard>(request, 'GET', `/api/enrolment/trials?occurrenceId=${occurrenceId}`, token)
}

async function reportsOf(request: APIRequestContext, token: string, groupId: string, from: string, to: string) {
  const headers = { authorization: `Bearer ${token}`, cookie: 'locale=en' }
  const month = from.slice(0, 7)
  const units = await request.get(`/api/activities/reports/coach-units?month=${month}&format=csv`, { headers })
  expect(units.status(), await units.text()).toBe(200)
  const params = new URLSearchParams({ groupId, from, to, format: 'csv' })
  const pzpn = await request.get(`/api/activities/reports/pzpn-attendance?${params.toString()}`, { headers })
  expect(pzpn.status(), await pzpn.text()).toBe(200)
  return { units: await units.text(), pzpn: await pzpn.text() }
}

/** Moves a session (as the administrator) to start `minutes` from now, for 60 minutes. */
async function startIn(request: APIRequestContext, club: Club, id: string, minutes: number): Promise<void> {
  const current = await getOccurrence(request, club.adminToken, id)
  expect(current.status, JSON.stringify(current.body)).toBe(200)
  const startAt = new Date(Date.now() + minutes * 60_000)
  const endAt = new Date(startAt.getTime() + 60 * 60_000)
  const moved = await moveOccurrence(
    request,
    club.adminToken,
    id,
    { startAt: startAt.toISOString(), endAt: endAt.toISOString() },
    current.body?.updatedAt,
  )
  expect(moved.status, JSON.stringify(moved.body)).toBe(200)
}

function trialRows(club: Club, id: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{
      state: string
      trial_occurrence_id: string | null
      trial_outcome: string | null
    }>(
      `select state, trial_occurrence_id, trial_outcome from enrolment_applications where organization_id = $1 and id = $2`,
      [club.tenant.organizationId, id],
    )
    return rows[0]
  })
}

function readLogs(club: Club, occurrenceId: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ acting_role: string; resource_ids: string[]; purpose: string }>(
      `select acting_role, resource_ids, purpose from enrolment_trial_read_logs
        where organization_id = $1 and occurrence_id = $2 order by created_at asc`,
      [club.tenant.organizationId, occurrenceId],
    )
    return rows
  })
}

test('TEST-J10 propose a trial session, the coach marks the trial participant, a cancelled session returns the application', async ({
  page,
  request,
}, testInfo) => {
  const club = await createClub(request, 'test-j10-trial')
  try {
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `j10-${tag}`
    const sectionSlug = `akademia-${tag}`
    const family = await familyFor(request, club)
    await openApplications(request, club, { clubSlug, sectionId: family.academy, sectionSlug, groupIds: [family.zaki] })

    // Two sessions of Żaki ahead (tomorrow and the day after) and one of the pool group (not Żaki's).
    const sessionOn = async (groupId: string, placeId: string, days: number, name: string) => {
      const activity = await createActivity(request, admin, {
        groupId,
        placeId,
        name,
        type: 'training',
        coachPersonId: groupId === family.zaki ? family.coach.personId : family.instructor.personId,
        startsOn: addDays(calendarDate(), days),
        startTime: '17:00',
        endTime: '18:00',
      })
      const id = (await sessionsOf(request, club, activity.id)).at(0)?.id
      if (!id) throw new Error('[test] the activity has no session')
      return id
    }
    const first = await sessionOn(family.zaki, family.pitch, 1, 'Trening Żaków')
    const second = await sessionOn(family.zaki, family.pitch, 2, 'Trening Żaków II')
    const pool = await sessionOn(family.poolGroup, family.poolPlace, 1, 'Basen')
    // The first session starts in 25 minutes: still ahead when it is proposed, and its list (and the trial marks) open
    // 30 minutes before the start, so the coach marks it within this test.
    await startIn(request, club, first, 25)
    const rosterBefore = (await roster(request, admin, family.zaki)).items.length
    const today = calendarDate()

    // --- Two applicants who want a trial ---
    const anna = `anna-${tag}@example.test`
    const piotr = `piotr-${tag}@example.test`
    await confirmedApplication(
      clubSlug,
      sectionSlug,
      childApplication(anna, { groupId: family.zaki, chooseForUs: false }),
    )
    await confirmedApplication(
      clubSlug,
      sectionSlug,
      childApplication(piotr, {
        groupId: family.zaki,
        chooseForUs: false,
        participantFirstName: 'Jan',
        participantLastName: 'Wiśniewski',
        participantBirthDate: '2017-06-01',
        guardianFirstName: 'Piotr',
        guardianLastName: 'Wiśniewski',
      }),
    )
    let coordinator = family.academyCoordinator.token
    const ola = await applicationIn(request, coordinator, 'new', 'Ola Nowak')
    const jan = await applicationIn(request, coordinator, 'new', 'Jan Wiśniewski')
    expect(ola?.flags).toContain('wants_trial')
    const olaId = String(ola?.id)
    const janId = String(jan?.id)

    // The picker lists Żaki's next sessions with the place, never the pool's.
    const options = await call<TrialSessions>(request, 'GET', `${trialApi(olaId)}-sessions`, coordinator)
    expect(options.status, JSON.stringify(options.body)).toBe(200)
    const offered = options.body?.items.map((item) => item.occurrenceId) ?? []
    expect(offered).toEqual(expect.arrayContaining([first, second]))
    expect(offered).not.toContain(pool)
    expect(options.body?.items.find((item) => item.occurrenceId === first)?.placeLabel).toBe('Boisko A')

    // --- On a phone the coordinator proposes the first session to Ola ---
    page.setDefaultTimeout(30_000)
    const coordinatorPassword = await signInBrowser(
      page,
      request,
      club,
      family.academyCoordinator.userId,
      family.academyCoordinator.email,
    )
    // The browser sign-in ends the coordinator's API tokens (lesson `sign-in-browser-ends-the-api-token`).
    coordinator = await getAuthToken(request, family.academyCoordinator.email, coordinatorPassword)
    await prepareForAccessibilityScan(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/club/applications/${olaId}`)
    await page.getByTestId('enrolment-action-trial').click()
    const sheet = page.getByTestId('enrolment-trial-sheet')
    await expect(sheet.getByTestId('enrolment-trial-session')).toHaveCount(2)
    await sheet.locator(`[data-occurrence-id="${first}"]`).click()
    await sheet.getByTestId('enrolment-trial-submit').click()
    await expect(page.getByTestId('enrolment-decision-done')).toHaveText(
      uiText('enrolment.club.trial.done', { exact: true }),
    )
    await expect(page.getByTestId('enrolment-application-state')).toHaveAttribute('data-state', 'trial')
    await expect(page.getByTestId('enrolment-trial-info')).toContainText('Boisko A')
    const violations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/applications/[id] (trial)',
      async () => {
        await expect(page.getByTestId('enrolment-trial-info')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(violations).toEqual({})
    await expectNoPageOverflow(page)
    await switchBrowserUser(page, request, club, family.coach.userId, family.coach.email)

    const invitation = await awaitEmails(anna, 'Trial session: Żaki')
    expect(invitation[0].text).toContain('Boisko A')
    expect(invitation[0].text).toContain('free')
    expect(await applicationIn(request, admin, 'trial', 'Ola Nowak')).toMatchObject({ state: 'trial' })

    // One trial at a time (Q-J07); a session of another group is refused.
    const olaNow = await call<{ updatedAt: string }>(request, 'GET', `/api/enrolment/applications/${olaId}`, admin)
    const again = await proposeTrial(request, admin, olaId, { occurrenceId: second, updatedAt: olaNow.body?.updatedAt })
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body?.code).toBe('application_state_conflict')
    const janNow = await call<{ updatedAt: string }>(request, 'GET', `/api/enrolment/applications/${janId}`, admin)
    const wrongGroup = await proposeTrial(request, admin, janId, {
      occurrenceId: pool,
      updatedAt: janNow.body?.updatedAt,
    })
    expect(wrongGroup.status, JSON.stringify(wrongGroup.body)).toBe(422)
    expect(wrongGroup.body?.code).toBe('trial_session_invalid')

    // --- Jan: proposed, withdrawn (e-mail, back to New), proposed again, then the session is cancelled ---
    const janProposed = await proposeTrial(request, admin, janId, {
      occurrenceId: second,
      updatedAt: janNow.body?.updatedAt,
    })
    expect(janProposed.status, JSON.stringify(janProposed.body)).toBe(200)
    const janWithdrawn = await withdrawTrial(request, admin, janId, janProposed.body?.updatedAt)
    expect(janWithdrawn.status, JSON.stringify(janWithdrawn.body)).toBe(200)
    expect(janWithdrawn.body?.state).toBe('new')
    await awaitEmails(piotr, 'Trial session cancelled')
    const janAgain = await proposeTrial(request, admin, janId, {
      occurrenceId: second,
      updatedAt: janWithdrawn.body?.updatedAt,
    })
    expect(janAgain.status, JSON.stringify(janAgain.body)).toBe(200)
    const secondNow = await getOccurrence(request, admin, second)
    const cancelled = await cancelOccurrence(request, coordinator, second, 'Pitch closed', secondNow.body?.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    await expect.poll(async () => (await trialRows(club, janId))?.state, { timeout: 30_000 }).toBe('new')
    expect(await trialRows(club, janId)).toMatchObject({ trial_occurrence_id: null, trial_outcome: null })
    await awaitEmails(piotr, 'Trial session cancelled', 2)
    await expect
      .poll(async () => (await notificationRows(club, 'enrolment.trial_session_cancelled')).length, { timeout: 30_000 })
      .toBeGreaterThan(0)
    expect((await notificationRows(club, 'enrolment.trial_session_cancelled'))[0].body).not.toContain('Jan')

    // The reports and the regular list before the coach marks (after the cancellation above, which changes them).
    const reportsBefore = await reportsOf(request, admin, family.zaki, today, addDays(today, 3))
    const listBefore = await readAttendanceList(request, admin, first)
    expect(listBefore.status, JSON.stringify(listBefore.body)).toBe(200)

    // --- The first session is about to start: the coach marks Ola on the attendance page ---
    await page.goto(`/club/occurrences/${first}/attendance`)
    const card = page.getByTestId('enrolment-trial-card')
    await expect(card).toBeVisible()
    await expect(card.getByTestId('enrolment-trial-participant')).toHaveCount(1)
    await expect(card).toContainText('Ola Nowak')
    // The regular list shows the group's three participants only.
    await expect(page.getByTestId('club-attendance-row')).toHaveCount(3)
    await expect(page.getByTestId('club-attendance-row').filter({ hasText: 'Ola' })).toHaveCount(0)
    const cardViolations = await scanInColorSchemes(
      page,
      testInfo,
      '/club/occurrences/[id]/attendance (trial card)',
      async () => {
        await expect(page.getByTestId('enrolment-trial-card')).toBeVisible()
      },
      { platformBaseline: true },
    )
    expect(cardViolations).toEqual({})
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.reload()
    await card.getByTestId('enrolment-trial-mark-present').click()
    await expect(card.getByTestId('enrolment-trial-participant')).toHaveAttribute('data-outcome', 'present')
    await expect(card.getByTestId('enrolment-trial-mark-present')).toHaveAttribute('aria-pressed', 'true')
    await expectNoPageOverflow(page)
    expect(await trialRows(club, olaId)).toMatchObject({ state: 'trial', trial_outcome: 'present' })
    const logs = await readLogs(club, first)
    expect(logs.length).toBeGreaterThan(0)
    expect(logs[0]).toMatchObject({ acting_role: 'coach', purpose: 'trial_card', resource_ids: [olaId] })

    // A coach of another group sees nothing of the session's trial participants.
    const instructorCard = await trialCard(request, family.instructor.token, first)
    expect(instructorCard.status, JSON.stringify(instructorCard.body)).toBe(404)
    const instructorMark = await call(request, 'PUT', `/api/enrolment/trials/${olaId}`, family.instructor.token, {
      data: { outcome: 'absent', updatedAt: new Date().toISOString() },
    })
    expect(instructorMark.status, JSON.stringify(instructorMark.body)).toBe(404)

    // The regular attendance data and the reports are unchanged; Ola is no person and no member.
    const list = await readAttendanceList(request, admin, first)
    expect(list.body?.rows).toEqual(listBefore.body?.rows)
    expect(JSON.stringify(list.body)).not.toContain('Ola')
    expect((await roster(request, admin, family.zaki)).items.length).toBe(rosterBefore)
    const reportsAfter = await reportsOf(request, admin, family.zaki, today, addDays(today, 3))
    expect(reportsAfter).toEqual(reportsBefore)

    // --- After the trial the coordinator accepts Ola; the card no longer lists her ---
    const olaDetail = await call<{ trial: { outcome: string | null } | null; updatedAt: string }>(
      request,
      'GET',
      `/api/enrolment/applications/${olaId}`,
      admin,
    )
    expect(olaDetail.body?.trial?.outcome).toBe('present')
    const accepted = await acceptApplication(request, admin, olaId, {
      groupId: family.zaki,
      startDay: addDays(today, 1),
      sendInvitation: false,
      updatedAt: olaDetail.body?.updatedAt,
    })
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    const after = await trialCard(request, admin, first)
    expect(after.status, JSON.stringify(after.body)).toBe(200)
    expect(after.body?.items).toEqual([])
  } finally {
    await club.cleanup()
  }
})
