import { expect, test } from '@playwright/test'
import {
  addDays,
  cancelOccurrence,
  createActivity,
  juneThirtiethNextYear,
  listOccurrences,
  scheduleFor,
} from '../_fixtures/activities'
import { birthDateTurning, calendarDate, createClub, createPerson, uniqueSuffix } from '../_fixtures/club'
import { listThreads, postThread, shareText } from '../_fixtures/communication'
import { addMembership } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { publicGet, publish } from '../_fixtures/publication'

// TEST-M08 (foundation III REQ-M08, AC-M08; club spec DD-17, J-003 step 2): the share text of a cancelled session
// carries the public session page `/p/[clubSlug]/s/[occurrenceId]`, the share text of a group thread the member link
// `/club/messages/[threadId]`. Signed out, the session page and its API show the activity name, the date, the time and
// the status only — no names, no roster, no counts; the same id under another club's slug answers 404 without detail;
// the thread link asks for a sign-in.
test.describe.configure({ timeout: 600_000 })

test('TEST-M08 share text and the public session page: session and thread texts, only name/date/time/status signed out, another club 404, the thread URL needs a sign-in', async ({
  request,
  page,
}) => {
  const club = await createClub(request, 'test-m08')
  const other = await createClub(request, 'test-m08-other')
  try {
    const admin = club.adminToken
    expect((await updateClubSettings(request, admin, { defaultLocale: 'pl' })).status).toBe(200)
    const slug = `m08-${uniqueSuffix()}`.toLowerCase()
    await publish(request, admin, slug, [])
    const otherSlug = `m08-other-${uniqueSuffix()}`.toLowerCase()
    await publish(request, other.adminToken, otherSlug, [])

    const { pitch, zaki, coordinator } = await scheduleFor(request, club)
    const today = calendarDate()
    const child = await createPerson(request, admin, {
      firstName: 'Zuzanna',
      lastName: 'Widoczna',
      birthDate: birthDateTurning(9),
    })
    await addMembership(request, admin, {
      groupId: zaki,
      personId: child,
      role: 'participant',
      validFrom: addDays(today, -30),
    })
    const { id: activityId } = await createActivity(request, admin, {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: addDays(today, 1),
      startTime: '17:00',
      endTime: '18:30',
    })
    const session = (await listOccurrences(request, admin, `&activityId=${activityId}`)).items.at(0)
    if (!session) throw new Error('[internal] the series has no session')
    const cancelled = await cancelOccurrence(request, coordinator, session.id, 'Ulewa', session.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)

    // The session's share text: the activity, the date and time, cancelled, and the public page.
    const sessionText = await shareText(request, coordinator, `occurrenceId=${session.id}`)
    expect(sessionText.status, JSON.stringify(sessionText.body)).toBe(200)
    const publicPath = `/p/${slug}/s/${session.id}`
    expect(sessionText.body?.url?.endsWith(publicPath)).toBe(true)
    expect(sessionText.body?.text).toContain('Trening Żaków')
    expect(sessionText.body?.text).toContain('17:00')
    expect(sessionText.body?.text).toContain('odwołane')
    expect(sessionText.body?.text).toContain(String(sessionText.body?.url))
    expect(sessionText.body?.text).not.toContain('Zuzanna')
    // The session thread has its own share text: the same session page.
    await expect
      .poll(async () => (await listThreads(request, admin, `&scopeType=occurrence&scopeId=${session.id}`)).length, {
        timeout: 60_000,
      })
      .toBe(1)

    // A group thread's share text: the subject and the sign-in link of the thread.
    const posted = await postThread(request, coordinator, {
      audience: { kind: 'group', ids: [zaki] },
      subject: 'Zbiórka przed meczem',
      body: 'Zbiórka o 9:30.',
    })
    expect(posted.status, JSON.stringify(posted.body)).toBe(201)
    const threadId = String(posted.body?.threadId)
    const threadText = await shareText(request, coordinator, `threadId=${threadId}`)
    expect(threadText.status, JSON.stringify(threadText.body)).toBe(200)
    expect(threadText.body?.url?.endsWith(`/club/messages/${threadId}`)).toBe(true)
    expect(threadText.body?.text).toBe(`Zbiórka przed meczem — ${String(threadText.body?.url)}`)
    // Neither or both targets: 400; a member has no share text (no `communication.post`).
    expect((await shareText(request, coordinator, '')).status).toBe(400)

    // Signed out: the public session API carries exactly the name, date, time and status.
    const api = await publicGet(request, `/api/activities/public/${slug}/sessions/${session.id}`)
    expect(api.status).toBe(200)
    expect(Object.keys(api.body?.session as object).sort()).toEqual(
      ['activityName', 'endAt', 'occurrenceDate', 'startAt', 'status', 'timeZone'].sort(),
    )
    expect(api.body?.session).toMatchObject({ activityName: 'Trening Żaków', status: 'cancelled' })
    expect(api.bytes.toString('utf8')).not.toContain('Zuzanna')
    expect(api.bytes.toString('utf8')).not.toContain('Ulewa')
    // The same id under another club's slug, an unknown slug and an unknown id: the same 404 without detail.
    for (const path of [
      `/api/activities/public/${otherSlug}/sessions/${session.id}`,
      `/api/activities/public/no-such-club-${uniqueSuffix()}/sessions/${session.id}`,
      `/api/activities/public/${slug}/sessions/00000000-0000-4000-8000-000000000000`,
    ]) {
      const missing = await publicGet(request, path)
      expect(missing.status, path).toBe(404)
      expect(missing.body?.code).toBe('public_session_not_found')
      expect(Object.keys(missing.body ?? {}).sort()).toEqual(['code', 'error'])
    }

    // The page itself, signed out: the activity, the date and time, "cancelled" and the sign-in, no names.
    const guest = await page.context().browser()?.newContext()
    if (!guest) throw new Error('[internal] no browser')
    try {
      const guestPage = await guest.newPage()
      await guestPage.goto(new URL(publicPath, process.env.BASE_URL || 'http://localhost:3000').toString())
      await expect(guestPage.getByTestId('public-session-activity')).toHaveText('Trening Żaków')
      await expect(guestPage.getByTestId('public-session-status')).toHaveAttribute('data-status', 'cancelled')
      await expect(guestPage.getByTestId('public-session-when')).toContainText('17:00')
      await expect(guestPage.getByTestId('public-session-sign-in')).toBeVisible()
      await expect(guestPage.locator('body')).not.toContainText('Zuzanna')
      await guestPage.goto(
        new URL(`/p/${otherSlug}/s/${session.id}`, process.env.BASE_URL || 'http://localhost:3000').toString(),
      )
      await expect(guestPage.getByTestId('public-session-not-found')).toBeVisible()
      // The thread link requires a sign-in.
      await guestPage.goto(
        new URL(`/club/messages/${threadId}`, process.env.BASE_URL || 'http://localhost:3000').toString(),
      )
      await expect(guestPage).toHaveURL(/\/login/)
    } finally {
      await guest.close()
    }
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
