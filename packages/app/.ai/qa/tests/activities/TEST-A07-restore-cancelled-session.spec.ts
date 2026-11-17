import { expect, test, type APIRequestContext } from '@playwright/test'
import {
  addDays,
  cancelOccurrence,
  createEvent,
  getOccurrence,
  moveOccurrence,
  scheduleFor,
  zoneInstant,
  type CodedError,
} from '../_fixtures/activities'
import { OPTIMISTIC_LOCK_HEADER, call, calendarDate, createClub, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { uiText } from '../_fixtures/ui-text'

// TEST-A07 (#268; groups and activities parity spec REQ-A05, AC-A05, Q-A20; club spec glossary *Session*): the club
// administrator restores a cancelled future session with a reason of 3–500 characters — refused with the collision list
// while its place is taken meanwhile, accepted once it is free; a cancelled session that has ended answers 409
// `occurrence_already_ended`; a planned one `occurrence_not_cancelled`; a coordinator gets 403. The record offers
// "Restore" to the administrator only. The moved-session notice of a restore arrives with E10-S06.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

async function oneOff(
  request: APIRequestContext,
  club: Club,
  input: { groupId: string; placeId: string; name: string; date: string; start: string; end: string },
): Promise<string> {
  const created = await createEvent(request, club.adminToken, {
    groupId: input.groupId,
    type: 'other',
    name: input.name,
    placeId: input.placeId,
    startsAt: zoneInstant(input.date, input.start),
    endsAt: zoneInstant(input.date, input.end),
  })
  expect(created.status, `POST /api/activities/events ${JSON.stringify(created.body)}`).toBe(201)
  return String(created.body?.occurrenceId)
}

async function cancel(request: APIRequestContext, club: Club, id: string): Promise<void> {
  const current = await getOccurrence(request, club.adminToken, id)
  const result = await cancelOccurrence(request, club.adminToken, id, 'Boisko zamknięte', current.body?.updatedAt)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
}

async function restore(
  request: APIRequestContext,
  token: string,
  id: string,
  reason: string,
  lockToken?: string | null,
) {
  return call<CodedError & { status?: string }>(request, 'POST', `/api/activities/occurrences/${id}/restore`, token, {
    data: { reason },
    headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
  })
}

test('TEST-A07 the administrator restores a cancelled future session; collisions, an ended session and a coordinator are refused', async ({
  page,
  request,
}) => {
  const club = await createClub(request, 'test-a07-restore')
  try {
    const { pitch, zaki, orliki, coordinator } = await scheduleFor(request, club)
    const admin = club.adminToken
    const day = addDays(calendarDate(), 3)
    const future = await oneOff(request, club, {
      groupId: zaki,
      placeId: pitch,
      name: 'Trening odwołany',
      date: day,
      start: '17:00',
      end: '18:00',
    })
    await cancel(request, club, future)
    // Orliki take the freed pitch meanwhile.
    const taker = await oneOff(request, club, {
      groupId: orliki,
      placeId: pitch,
      name: 'Trening Orlików',
      date: day,
      start: '17:00',
      end: '18:00',
    })
    const lock = async (id: string) => (await getOccurrence(request, admin, id)).body?.updatedAt ?? null

    // A coordinator may not restore (administrator only).
    const denied = await restore(request, coordinator, future, 'Boisko jednak wolne', await lock(future))
    expect(denied.status, JSON.stringify(denied.body)).toBe(403)

    // The reason is required (3–500 characters).
    const short = await restore(request, admin, future, 'ab', await lock(future))
    expect(short.status, JSON.stringify(short.body)).toBe(400)

    // The place is taken: 409 with the collision list, the session stays cancelled.
    const collided = await restore(request, admin, future, 'Boisko jednak wolne', await lock(future))
    expect(collided.status, JSON.stringify(collided.body)).toBe(409)
    expect(collided.body?.code).toBe('occurrence_place_conflict')
    expect(collided.body?.conflicts?.[0]?.sessions.map((entry) => entry.id)).toContain(taker)
    expect((await getOccurrence(request, admin, future)).body?.status).toBe('cancelled')

    // Once the place is free again, the restore is accepted.
    await cancel(request, club, taker)
    const restored = await restore(request, admin, future, 'Boisko jednak wolne', await lock(future))
    expect(restored.status, JSON.stringify(restored.body)).toBe(200)
    expect((await getOccurrence(request, admin, future)).body).toMatchObject({ status: 'planned', cancelReason: null })

    // A planned session is not restored again.
    const planned = await restore(request, admin, future, 'Jeszcze raz', await lock(future))
    expect(planned.status, JSON.stringify(planned.body)).toBe(409)
    expect(planned.body?.code).toBe('occurrence_not_cancelled')

    // A cancelled session that has ended answers 409 `occurrence_already_ended`.
    const past = await oneOff(request, club, {
      groupId: zaki,
      placeId: pitch,
      name: 'Trening miniony',
      date: addDays(calendarDate(), 6),
      start: '17:00',
      end: '18:00',
    })
    // Moved into the past (an hour long, ended an hour ago), then cancelled.
    const hour = 60 * 60 * 1000
    const pastMove = await moveOccurrence(
      request,
      admin,
      past,
      { startAt: new Date(Date.now() - 2 * hour).toISOString(), endAt: new Date(Date.now() - hour).toISOString() },
      await lock(past),
    )
    expect(pastMove.status, JSON.stringify(pastMove.body)).toBe(200)
    await cancel(request, club, past)
    const ended = await restore(request, admin, past, 'Za późno', await lock(past))
    expect(ended.status, JSON.stringify(ended.body)).toBe(409)
    expect(ended.body?.code).toBe('occurrence_already_ended')

    // The record: the administrator restores through the dialog.
    await cancel(request, club, future)
    page.setDefaultTimeout(30_000)
    await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.goto(`/backend/activities/occurrences/${future}`)
    await page.getByTestId('occurrence-restore-button').click()
    await page.getByTestId('occurrence-restore-reason').fill('Boisko jednak wolne')
    await page.getByTestId('occurrence-restore-confirm').click()
    await expect(page.getByText(uiText('activities.occurrences.flash.restored', { exact: true }))).toBeVisible()
    await expect(page.getByTestId('occurrence-restore-button')).toHaveCount(0)
    // signInBrowser ended the administrator's API token (lesson sign-in-browser-ends-the-api-token): check the page.
    await expect(page.getByTestId('occurrence-cancelled')).toHaveCount(0)
  } finally {
    await club.cleanup()
  }
})
