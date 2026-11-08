import { expect, test } from '@playwright/test'
import {
  addDays,
  cancelOccurrence,
  createActivity,
  getActivity,
  getOccurrence,
  moveOccurrence,
  updateActivity,
  weekdayOf,
  zoneInstant,
} from '../_fixtures/activities'
import { expectNoPageOverflow } from '../_fixtures/axe'
import { familyFor, readCalendarItem, sessionsOf } from '../_fixtures/attendance'
import { calendarDate, createClub, uniqueSuffix } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { awaitEmails, shareText } from '../_fixtures/communication'
import { publicGet, publish } from '../_fixtures/publication'

// Issue #136 (club spec DD-43; messaging spec DD-M14): a session carries an optional gathering time. The activity holds
// the default in minutes before the start, each session its own offset; a moved session keeps the offset, a series
// change re-plans the movable sessions, a session edit overrides it, and a forged gathering at or after the start (or
// more than 12 hours before it) answers 422. A guardian sees "Gathering {time}" before the start on Today, the
// calendar and the session page, the coach on the attendance list header, a guest on the public session page; the
// share text and the cancellation e-mail name it; a session without one shows nothing.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const HOUR_MS = 3_600_000

test('ISSUE-136 gathering time: default and override, kept on a move, 422 when forged, shown on Today, the calendar, the session, the attendance list and the public page, carried in the share text and the cancellation e-mail', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'issue-136-gathering')
  try {
    const admin = club.adminToken
    const family = await familyFor(request, club)
    const coordinator = family.academyCoordinator.token
    const today = calendarDate()
    const tomorrow = addDays(today, 1)
    const slug = `g136-${uniqueSuffix()}`.toLowerCase()
    await publish(request, admin, slug, [])

    // A match tomorrow at 10:00 gathering 45 minutes before: 09:15.
    const match = await createActivity(request, coordinator, {
      groupId: family.zaki,
      name: 'Mecz z Polonią',
      type: 'match',
      placeId: family.pitch,
      startsOn: tomorrow,
      startTime: '10:00',
      endTime: '11:30',
      gatheringMinutesBefore: 45,
    })
    expect((await getActivity(request, admin, match.id)).body?.gatheringMinutesBefore).toBe(45)
    const [matchSession] = await sessionsOf(request, club, match.id)
    const matchDetail = await getOccurrence(request, admin, matchSession.id)
    expect(matchDetail.body).toMatchObject({
      startAt: new Date(zoneInstant(tomorrow, '10:00')).toISOString(),
      gatheringAt: new Date(zoneInstant(tomorrow, '09:15')).toISOString(),
      gatheringMinutesBefore: 45,
    })
    const guardianItem = await readCalendarItem(request, family.guardian.token, matchSession.id, 'as=guardian')
    expect(guardianItem.status, JSON.stringify(guardianItem.body)).toBe(200)
    expect(guardianItem.body?.occurrence?.gatheringAt).toBe(new Date(zoneInstant(tomorrow, '09:15')).toISOString())

    // A session without a gathering time carries null.
    const plain = await createActivity(request, coordinator, {
      groupId: family.zaki,
      name: 'Trening bez zbiórki',
      type: 'training',
      placeId: family.pitch,
      startsOn: tomorrow,
      startTime: '17:00',
      endTime: '18:00',
    })
    const [plainSession] = await sessionsOf(request, club, plain.id)
    expect((await getOccurrence(request, admin, plainSession.id)).body?.gatheringAt).toBeNull()

    // A weekly series gathering 30 minutes before; its first two sessions.
    const firstDay = addDays(today, 7)
    const series = await createActivity(request, coordinator, {
      groupId: family.zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: family.pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=${weekdayOf(firstDay)};COUNT=3`,
      startsOn: firstDay,
      startTime: '16:00',
      endTime: '17:30',
      gatheringMinutesBefore: 30,
    })
    const [moved, kept] = await sessionsOf(request, club, series.id)
    const movedBefore = (await getOccurrence(request, admin, moved.id)).body
    expect(movedBefore?.gatheringAt).toBe(new Date(zoneInstant(String(moved.occurrenceDate), '15:30')).toISOString())

    // Moved by two hours: the gathering moves with it (the offset is kept).
    const newStart = new Date(new Date(String(movedBefore?.startAt)).getTime() + 2 * HOUR_MS)
    const newEnd = new Date(new Date(String(movedBefore?.endAt)).getTime() + 2 * HOUR_MS)
    const move = await moveOccurrence(
      request,
      coordinator,
      moved.id,
      { startAt: newStart.toISOString(), endAt: newEnd.toISOString() },
      movedBefore?.updatedAt,
    )
    expect(move.status, JSON.stringify(move.body)).toBe(200)
    const movedAfter = (await getOccurrence(request, admin, moved.id)).body
    expect(movedAfter).toMatchObject({ isDetached: true, gatheringMinutesBefore: 30 })
    expect(movedAfter?.gatheringAt).toBe(new Date(newStart.getTime() - 30 * 60_000).toISOString())

    // Forged gathering times are refused: at or after the start, or more than 12 hours before it.
    for (const [gatheringAt, code] of [
      [newStart.toISOString(), 'occurrence_gathering_after_start'],
      [new Date(newStart.getTime() + 15 * 60_000).toISOString(), 'occurrence_gathering_after_start'],
      [new Date(newStart.getTime() - 13 * HOUR_MS).toISOString(), 'occurrence_gathering_too_early'],
    ] as const) {
      const forged = await moveOccurrence(request, coordinator, moved.id, { gatheringAt }, movedAfter?.updatedAt)
      expect(forged.status, JSON.stringify(forged.body)).toBe(422)
      expect(forged.body?.code).toBe(code)
    }
    // A per-session override: one hour before.
    const override = await moveOccurrence(
      request,
      coordinator,
      moved.id,
      { gatheringAt: new Date(newStart.getTime() - HOUR_MS).toISOString() },
      movedAfter?.updatedAt,
    )
    expect(override.status, JSON.stringify(override.body)).toBe(200)
    expect((await getOccurrence(request, admin, moved.id)).body?.gatheringMinutesBefore).toBe(60)

    // A series change re-plans the movable sessions only; the moved one keeps its own gathering time.
    const seriesRow = (await getActivity(request, admin, series.id)).body
    const changed = await updateActivity(
      request,
      coordinator,
      { id: series.id, gatheringMinutesBefore: 20 },
      seriesRow?.updatedAt,
    )
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect((await getOccurrence(request, admin, kept.id)).body?.gatheringAt).toBe(
      new Date(zoneInstant(String(kept.occurrenceDate), '15:40')).toISOString(),
    )
    expect((await getOccurrence(request, admin, moved.id)).body?.gatheringMinutesBefore).toBe(60)
    // An out-of-range default is refused by the request schema.
    const tooEarly = await updateActivity(
      request,
      coordinator,
      { id: series.id, gatheringMinutesBefore: 721 },
      (await getActivity(request, admin, series.id)).body?.updatedAt,
    )
    expect([400, 422], JSON.stringify(tooEarly.body)).toContain(tooEarly.status)

    // The share text of the planned match names the gathering time.
    const planned = await shareText(request, coordinator, `occurrenceId=${matchSession.id}`)
    expect(planned.status, JSON.stringify(planned.body)).toBe(200)
    expect(planned.body?.text).toContain('09:15')
    expect(planned.body?.text).toContain('10:00')
    expect((await shareText(request, coordinator, `occurrenceId=${plainSession.id}`)).body?.text).not.toMatch(
      /gathering|zbiórka/i,
    )

    // ---- The browser at 375 px ----
    page.setDefaultTimeout(30_000)
    await page.setViewportSize({ width: 375, height: 812 })

    // The guardian: Today, the session page and the calendar show the gathering before the start.
    await signInBrowser(page, request, club, family.guardian.userId, family.guardian.email)
    await page.goto('/club')
    const todayLine = page.getByTestId('club-today-session').filter({ hasText: '10:00' }).first()
    await expect(todayLine.getByTestId('club-today-gathering')).toContainText('09:15')
    const todayText = (await todayLine.textContent()) ?? ''
    expect(todayText.indexOf('09:15')).toBeLessThan(todayText.indexOf('10:00'))
    await expect(
      page.getByTestId('club-today-session').filter({ hasText: '17:00' }).getByTestId('club-today-gathering'),
    ).toHaveCount(0)
    await expectNoPageOverflow(page)

    await page.goto(`/club/occurrences/${matchSession.id}`)
    await expect(page.getByTestId('club-session-gathering')).toHaveText('09:15')
    await expectNoPageOverflow(page)
    await page.goto(`/club/occurrences/${plainSession.id}`)
    await expect(page.getByRole('heading', { level: 1, name: /Trening bez zbiórki/ })).toBeVisible()
    await expect(page.getByTestId('club-session-gathering')).toHaveCount(0)

    // The sessions are tomorrow: on a Sunday that is the next Monday-Sunday week, so open today to tomorrow.
    await page.goto(`/club/calendar?from=${today}&to=${tomorrow}`)
    const calendarItem = page.locator(`[data-testid="calendar-item"][data-item-id="${matchSession.id}"]`)
    await expect(calendarItem.getByTestId('calendar-item-gathering')).toContainText('09:15')
    await expect(
      page
        .locator(`[data-testid="calendar-item"][data-item-id="${plainSession.id}"]`)
        .getByTestId('calendar-item-gathering'),
    ).toHaveCount(0)
    await expectNoPageOverflow(page)

    // The coach: the attendance list header.
    await signInBrowser(page, request, club, family.coach.userId, family.coach.email)
    await page.goto(`/club/occurrences/${matchSession.id}/attendance`)
    await expect(page.getByTestId('club-attendance-gathering')).toContainText('09:15')
    await expectNoPageOverflow(page)

    // The coordinator: B-14 sets the series default, B-15 shows and overrides one session's gathering time.
    await signInBrowser(page, request, club, family.academyCoordinator.userId, family.academyCoordinator.email)
    await page.goto(`/backend/activities/activities/${series.id}`)
    const minutes = page.locator('[data-crud-field-id="gatheringMinutesBefore"] input')
    await expect(minutes).toHaveValue('20')
    await minutes.fill('25')
    await page
      .getByRole('button', { name: /^Save$|^Zapisz$/ })
      .first()
      .click()
    await expect.poll(async () => (await getActivity(request, admin, series.id)).body?.gatheringMinutesBefore).toBe(25)

    await page.goto(`/backend/activities/occurrences/${matchSession.id}`)
    await expect(page.getByText('09:15').first()).toBeVisible()
    await page.getByTestId('occurrence-move-button').click()
    const gathering = page.locator('[data-crud-field-id="gatheringTime"] input')
    await expect(gathering).toHaveValue('09:15')
    await gathering.fill('09:00')
    await page.getByRole('button', { name: /^Move session$|^Przenieś termin$/ }).click()
    await expect
      .poll(async () => (await getOccurrence(request, admin, matchSession.id)).body?.gatheringMinutesBefore)
      .toBe(60)

    // Cancelled: the share text, the cancellation e-mail and the public page name the same gathering time (09:00).
    // The browser sign-in replaced the coordinator's password, so their API token is stale: the administrator acts.
    const current = (await getOccurrence(request, admin, matchSession.id)).body
    const cancelled = await cancelOccurrence(request, admin, matchSession.id, 'Boisko zamknięte', current?.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    const cancelledText = await shareText(request, admin, `occurrenceId=${matchSession.id}`)
    expect(cancelledText.body?.text).toContain('09:00')
    expect(cancelledText.body?.text).not.toContain('09:15')
    const [mail] = await awaitEmails(family.guardian.email, 'Mecz z Polonią')
    expect(mail?.text).toContain('09:00')
    expect(mail?.text).not.toContain('09:15')

    const api = await publicGet(request, `/api/activities/public/${slug}/sessions/${matchSession.id}`)
    expect(api.status).toBe(200)
    expect((api.body?.session as { gatheringAt?: string }).gatheringAt).toBe(
      new Date(zoneInstant(tomorrow, '09:00')).toISOString(),
    )
    const guest = await page.context().browser()?.newContext({ timezoneId: 'Europe/Warsaw' })
    if (!guest) throw new Error('[internal] no browser')
    try {
      const guestPage = await guest.newPage()
      await guestPage.setViewportSize({ width: 375, height: 812 })
      await guestPage.goto(
        new URL(`/p/${slug}/s/${matchSession.id}`, process.env.BASE_URL || 'http://localhost:3000').toString(),
      )
      await expect(guestPage.getByTestId('public-session-gathering')).toContainText('09:00')
      const when = (await guestPage.getByTestId('public-session-when').textContent()) ?? ''
      expect(when.indexOf('09:00')).toBeLessThan(when.indexOf('10:00'))
      await guestPage.goto(
        new URL(`/p/${slug}/s/${plainSession.id}`, process.env.BASE_URL || 'http://localhost:3000').toString(),
      )
      await expect(guestPage.getByTestId('public-session-when')).toContainText('17:00')
      await expect(guestPage.getByTestId('public-session-gathering')).toHaveCount(0)
    } finally {
      await guest.close()
    }
  } finally {
    await club.cleanup()
  }
})
