import { expect, test, type APIRequestContext } from '@playwright/test'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { getOccurrence } from '../_fixtures/activities'
import {
  bothSeries,
  familyFor,
  firstSession,
  readAttendanceList,
  rowOf,
  saveAttendanceList,
  startNow,
} from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, call, createClub } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { actionLogEntries } from '../_fixtures/people'
import { uiText } from '../_fixtures/ui-text'

// Issue #588 (foundation II spec AC-G02; owner decision 2026-11-24, modelled on the restore of #268): the club
// administrator reopens a done session (`done → planned`) with a reason of 3–500 characters, kept in the audit log; the
// attendance checked off on it stays, the coach checks off again and closes it once more. A coordinator and a coach get
// 403, a short reason 400, a missing lock token 400 `lock_token_required`, a session that is not done 409
// `occurrence_not_done`. The undo closes the session again. The record offers "Reopen session" to the administrator only
// on a done session.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type Reopened = { code?: string; status?: string; actingRole?: string; updatedAt?: string }

async function reopen(request: APIRequestContext, token: string, id: string, reason: string, lock?: string | null) {
  return call<Reopened>(request, 'POST', `/api/activities/occurrences/${id}/reopen`, token, {
    data: { reason },
    headers: lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {},
  })
}

test('ISSUE-588 the administrator reopens a done session with a reason; the attendance stays; others are refused', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'issue-588-reopen')
  try {
    const admin = club.adminToken
    const family = await familyFor(request, club)
    const { training } = await bothSeries(request, club, family)
    const session = firstSession(training.sessions)
    const lock = async () => (await getOccurrence(request, admin, session.id)).body?.updatedAt ?? null

    // The coach checks off one child and closes the session.
    const started = await startNow(request, club, session.id)
    const closed = await saveAttendanceList(
      request,
      family.coach.token,
      session.id,
      { entries: [{ personId: family.elder.personId, actual: 'present' }], complete: true },
      started,
    )
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    expect(closed.body?.occurrence?.status).toBe('done')

    // Administrator only: a coordinator and the coach get 403.
    for (const token of [family.academyCoordinator.token, family.coach.token]) {
      const denied = await reopen(request, token, session.id, 'Brakuje obecności', await lock())
      expect(denied.status, JSON.stringify(denied.body)).toBe(403)
    }
    // The reason has 3–500 characters; the lock token is required.
    const short = await reopen(request, admin, session.id, 'ab', await lock())
    expect(short.status, JSON.stringify(short.body)).toBe(400)
    const unlocked = await reopen(request, admin, session.id, 'Brakuje obecności')
    expect(unlocked.status, JSON.stringify(unlocked.body)).toBe(400)
    expect(unlocked.body?.code).toBe('lock_token_required')
    expect((await getOccurrence(request, admin, session.id)).body?.status).toBe('done')

    // The administrator reopens it: planned again, the checked-off attendance stays, the reason is in the audit log.
    const doneDetail = await getOccurrence(request, admin, session.id)
    expect(doneDetail.body?.mayReopen).toBe(true)
    const reopened = await reopen(request, admin, session.id, 'Brakuje obecności', doneDetail.body?.updatedAt)
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(200)
    expect(reopened.body).toMatchObject({ status: 'planned', actingRole: 'club_admin' })
    const planned = await getOccurrence(request, admin, session.id)
    expect(planned.body).toMatchObject({ status: 'planned', mayReopen: false })
    const kept = await readAttendanceList(request, admin, session.id)
    expect(kept.body && rowOf(kept.body, family.elder.personId).actual).toBe('present')
    const reopenLogs = async () =>
      (await actionLogEntries(request, admin, session.id)).filter(
        (entry) => entry.commandId === 'activities.occurrences.reopen',
      )
    const reopenLog = (await reopenLogs()).at(0)
    expect(reopenLog?.context).toMatchObject({ reason: 'Brakuje obecności' })

    // A session that is not done is not reopened.
    const notDone = await reopen(request, admin, session.id, 'Jeszcze raz', planned.body?.updatedAt)
    expect(notDone.status, JSON.stringify(notDone.body)).toBe(409)
    expect(notDone.body?.code).toBe('occurrence_not_done')

    // The undo closes the session again.
    expect(reopenLog?.undoToken).toBeTruthy()
    const undone = await undoByToken(request, admin, String(reopenLog?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    const closedAgain = await getOccurrence(request, admin, session.id)
    expect(closedAgain.body?.status).toBe('done')

    // Reopened once more, the coach checks off the second child and closes the session.
    const second = await reopen(request, admin, session.id, 'Brakuje obecności', closedAgain.body?.updatedAt)
    expect(second.status, JSON.stringify(second.body)).toBe(200)
    const list = await readAttendanceList(request, family.coach.token, session.id)
    expect(list.body?.checkOff).toBe('open')
    const recheck = await saveAttendanceList(
      request,
      family.coach.token,
      session.id,
      { entries: [{ personId: family.younger.personId, actual: 'late' }], complete: true },
      list.body?.occurrence?.updatedAt,
    )
    expect(recheck.status, JSON.stringify(recheck.body)).toBe(200)
    expect(recheck.body?.occurrence?.status).toBe('done')
    const final = recheck.body
    if (!final) throw new Error('[test] empty list after the second close')
    expect(rowOf(final, family.elder.personId).actual).toBe('present')
    expect(rowOf(final, family.younger.personId).actual).toBe('late')

    // The record: the administrator reopens the done session through the dialog.
    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.goto(`/backend/activities/occurrences/${session.id}`)
    await expect(page.getByTestId('occurrence-restore-button')).toHaveCount(0)
    await page.getByTestId('occurrence-reopen-button').click()
    await page.getByTestId('occurrence-reopen-confirm').click()
    await expect(page.getByTestId('occurrence-reopen-problem')).toBeVisible()
    await page.getByTestId('occurrence-reopen-reason').fill('Poprawka obecności')
    await page.getByTestId('occurrence-reopen-confirm').click()
    await expect(page.getByText(uiText('activities.occurrences.flash.reopened', { exact: true }))).toBeVisible()
    await expect(page.getByTestId('occurrence-reopen-button')).toHaveCount(0)
    // signInBrowser ended the administrator's API token (lesson sign-in-browser-ends-the-api-token): check the page.
    await expect(page.getByTestId('occurrence-move-button')).toBeVisible()
  } finally {
    await club.cleanup()
  }
})
