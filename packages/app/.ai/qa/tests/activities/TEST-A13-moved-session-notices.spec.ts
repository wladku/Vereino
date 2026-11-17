import { expect, test } from '@playwright/test'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import {
  addDays,
  createActivity,
  createEvent,
  getOccurrence,
  juneThirtiethNextYear,
  listOccurrences,
  moveOccurrence,
  readNotifications,
  scheduleFor,
  zoneInstant,
} from '../_fixtures/activities'
import { birthDateTurning, calendarDate, createClub, createPerson, createStaff, signInAs } from '../_fixtures/club'
import { awaitEmails, emailsTo, getThread, listThreads, settledDeliveries } from '../_fixtures/communication'
import { addMembership, signedInStaff } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { runProbe } from '../_fixtures/messaging'
import { actionLogEntries, createGuardianship } from '../_fixtures/people'

// TEST-A13 (groups and activities parity spec REQ-A09, AC-A10; J-A03 steps 3–5; D-031 §7; #271): a planned future
// session with two guardians of a minor (one without an account or address), an adult participant with an account and
// a coach. The coordinator moves its time: each recipient with an account gets one in-app notice
// (`activities.occurrence_moved`) and one e-mail with the old and the new values, the session thread gets one system
// message naming who moved it, the mover gets nothing, and the guardian without an account is shown as skipped. A
// replayed event and copies delivered at once add nothing; the undo of the move is announced again; a change of the
// coach alone or of the deadline alone announces nothing; a coach's move of a one-off event also tells the section's
// coordinator; a session moved from the past to the past announces nothing.
test.describe.configure({ timeout: 600_000 })

const SUBJECT = 'Zmiana terminu: Trening Żaków'

type ThreadMessageWithKind = { kind?: string; system: boolean; body: string | null; authorName: string | null }

test('TEST-A13 a moved session is announced once in the thread, in the app and by e-mail; replays, coach and deadline changes and past moves announce nothing', async ({
  request,
}) => {
  const club = await createClub(request, 'test-a13')
  try {
    const admin = club.adminToken
    const settings = await updateClubSettings(request, admin, { defaultLocale: 'pl' })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const { pitch, zaki, coordinator, coordinatorUserId } = await scheduleFor(request, club)
    const today = calendarDate()
    const since = addDays(today, -30)

    const child = await createPerson(request, admin, {
      firstName: 'Jaś',
      lastName: 'Mały',
      birthDate: birthDateTurning(8),
    })
    const guardian = await createStaff(request, club, {
      firstName: 'Kasia',
      lastName: 'Mała',
      birthDate: birthDateTurning(38),
    })
    // The second guardian has neither an account nor an address: shown as skipped.
    const offlineGuardian = await createPerson(request, admin, {
      firstName: 'Piotr',
      lastName: 'Bezkonta',
      birthDate: birthDateTurning(40),
    })
    for (const guardianPersonId of [guardian.personId, offlineGuardian]) {
      await createGuardianship(request, admin, { guardianPersonId, wardPersonId: child, validFrom: since })
    }
    const adult = await createStaff(request, club, {
      firstName: 'Iga',
      lastName: 'Dorosła',
      birthDate: birthDateTurning(19),
    })
    // A coach with the coach role (`activities.coach`), so they may move the one-off event of their group (DD-A05).
    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trener', role: 'coach' })
    const secondCoach = await createStaff(request, club, {
      firstName: 'Tomasz',
      lastName: 'Zastępca',
      birthDate: birthDateTurning(35),
    })
    for (const personId of [child, adult.personId]) {
      await addMembership(request, admin, { groupId: zaki, personId, role: 'participant', validFrom: since })
    }
    for (const personId of [coach.personId, secondCoach.personId]) {
      await addMembership(request, admin, { groupId: zaki, personId, role: 'coach', validFrom: since })
    }
    const { id: activityId } = await createActivity(request, admin, {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      coachPersonId: coach.personId,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: addDays(today, 1),
      startTime: '17:00',
      endTime: '18:30',
    })
    const session = (await listOccurrences(request, admin, `&activityId=${activityId}`)).items.at(0)
    if (!session) throw new Error('[internal] the series has no session')
    const recipients = [guardian.email, adult.email, coach.email]
    const tokens = {
      guardian: await signInAs(request, club, guardian.userId, guardian.email),
      adult: await signInAs(request, club, adult.userId, adult.email),
      coach: coach.token,
    }
    const movedNotices = (token: string, id = session.id) =>
      readNotifications(request, token, `&type=activities.occurrence_moved&sourceEntityId=${id}`)

    // The coordinator moves the session by a day.
    const newDate = addDays(String(session.occurrenceDate), 1)
    const moved = await moveOccurrence(
      request,
      coordinator,
      session.id,
      { startAt: zoneInstant(newDate, '17:00'), endAt: zoneInstant(newDate, '18:30') },
      session.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    // Told: the child, both guardians, the adult and the coaches of the group — never the mover.
    expect((moved.body as { notified?: number }).notified).toBe(6)
    const eventKey = `${session.id}:${String(moved.body?.updatedAt)}`

    // One session thread with one system message naming the coordinator and the old and the new time.
    let threadId = ''
    await expect
      .poll(
        async () => {
          const threads = await listThreads(request, admin, `&scopeType=occurrence&scopeId=${session.id}`)
          threadId = threads.at(0)?.id ?? ''
          return threads.length
        },
        { timeout: 60_000, message: 'the session thread exists' },
      )
      .toBe(1)
    const thread = await getThread(request, admin, threadId)
    expect(thread.body?.messages).toHaveLength(1)
    const notice = thread.body?.messages.at(0) as ThreadMessageWithKind | undefined
    expect(notice).toMatchObject({ system: true, kind: 'reschedule' })
    expect(notice?.body).toContain('Krystyna Koordynator')
    expect(notice?.body).toContain('→')
    expect(notice?.body).toContain('Boisko A')

    // One e-mail per recipient with an address, in Polish, with both times; the guardian without one is skipped.
    for (const address of recipients) {
      const [mail] = await awaitEmails(address, SUBJECT)
      expect(mail?.text).toContain('→')
      expect(mail?.links.some((link) => link.includes(`/club/messages/${threadId}`))).toBe(true)
    }
    const delivered = await settledDeliveries(request, admin, threadId)
    expect(delivered.find((item) => item.personId === offlineGuardian)?.status).toBe('skipped')

    // One in-app notice per recipient with an account; none for the mover.
    for (const token of Object.values(tokens)) {
      await expect.poll(async () => (await movedNotices(token)).length, { timeout: 30_000 }).toBe(1)
    }
    expect(await movedNotices(coordinator)).toEqual([])

    // The same event delivered three times at once, then once more: nothing is added.
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const input = {
      occurrenceId: session.id,
      eventKey,
      change: {
        kinds: ['time'],
        before: {
          startAt: session.startAt,
          endAt: session.endAt,
          placeId: pitch,
          venueName: null,
          gatheringMinutesBefore: null,
        },
      },
      actorUserId: coordinatorUserId,
      actingRole: 'coordinator',
    }
    const replays = runProbe(scope, [
      { op: 'command', id: 'communication.threads.record_reschedule', input, times: 3 },
      { op: 'command', id: 'communication.threads.record_reschedule', input },
      { op: 'drain' },
    ])
    expect(replays.result.failure).toBeNull()
    for (const index of [0, 1]) {
      const runs = (replays.result.outputs[index] as { results: { result?: { created?: boolean }; error?: unknown }[] })
        .results
      expect(runs.every((run) => run.error === undefined && run.result?.created !== true)).toBe(true)
    }
    expect((await getThread(request, admin, threadId)).body?.messages).toHaveLength(1)
    for (const address of recipients) expect(emailsTo(address, SUBJECT), address).toHaveLength(1)

    // The administrator moves it by one more hour and undoes that (undo is one's own action only): the move and its
    // undo are both announced (J-A03 step 5).
    const updates = async () =>
      (await actionLogEntries(request, admin, session.id)).filter(
        (entry) => entry.commandId === 'activities.occurrences.update',
      )
    const seen = new Set((await updates()).map((entry) => entry.id))
    const adminMove = await moveOccurrence(
      request,
      admin,
      session.id,
      { startAt: zoneInstant(newDate, '18:00'), endAt: zoneInstant(newDate, '19:30') },
      moved.body?.updatedAt,
    )
    expect(adminMove.status, JSON.stringify(adminMove.body)).toBe(200)
    await expect
      .poll(async () => (await getThread(request, admin, threadId)).body?.messages.length, { timeout: 60_000 })
      .toBe(2)
    const adminLog = (await updates()).find((entry) => !seen.has(entry.id))
    const undone = await undoByToken(request, admin, String(adminLog?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    await expect
      .poll(async () => (await getThread(request, admin, threadId)).body?.messages.length, { timeout: 60_000 })
      .toBe(3)
    for (const address of recipients) await awaitEmails(address, SUBJECT, 3)

    // A change of the coach alone, then of the deadline alone: nothing is announced.
    const current = await getOccurrence(request, admin, session.id)
    const recoached = await moveOccurrence(
      request,
      coordinator,
      session.id,
      { coachPersonId: secondCoach.personId },
      current.body?.updatedAt,
    )
    expect(recoached.status, JSON.stringify(recoached.body)).toBe(200)
    expect((recoached.body as { notified?: number }).notified).toBe(0)
    const deadlined = await moveOccurrence(
      request,
      coordinator,
      session.id,
      { confirmBy: zoneInstant(String(session.occurrenceDate), '12:00') },
      recoached.body?.updatedAt,
    )
    expect(deadlined.status, JSON.stringify(deadlined.body)).toBe(200)
    expect((deadlined.body as { notified?: number }).notified).toBe(0)

    // A coach moves the one-off event of their group: the section's coordinator is told too.
    const eventDay = addDays(today, 4)
    const event = await createEvent(request, admin, {
      groupId: zaki,
      type: 'other',
      name: 'Turniej Żaków',
      placeId: pitch,
      coachPersonId: coach.personId,
      startsAt: zoneInstant(eventDay, '10:00'),
      endsAt: zoneInstant(eventDay, '12:00'),
    })
    expect(event.status, JSON.stringify(event.body)).toBe(201)
    const eventId = String(event.body?.occurrenceId)
    const eventNow = await getOccurrence(request, admin, eventId)
    const coachMove = await moveOccurrence(
      request,
      tokens.coach,
      eventId,
      { startAt: zoneInstant(eventDay, '11:00'), endAt: zoneInstant(eventDay, '13:00') },
      eventNow.body?.updatedAt,
    )
    expect(coachMove.status, JSON.stringify(coachMove.body)).toBe(200)
    await expect.poll(async () => (await movedNotices(coordinator, eventId)).length, { timeout: 30_000 }).toBe(1)
    expect(await movedNotices(tokens.coach, eventId)).toEqual([])

    // A session moved from the past to the past announces nothing.
    const hour = 60 * 60 * 1000
    const intoPast = await moveOccurrence(
      request,
      admin,
      eventId,
      { startAt: new Date(Date.now() - 3 * hour).toISOString(), endAt: new Date(Date.now() - 2 * hour).toISOString() },
      coachMove.body?.updatedAt,
    )
    expect(intoPast.status, JSON.stringify(intoPast.body)).toBe(200)
    let eventThreadId = ''
    await expect
      .poll(
        async () => {
          const threads = await listThreads(request, admin, `&scopeType=occurrence&scopeId=${eventId}`)
          eventThreadId = threads.at(0)?.id ?? ''
          return eventThreadId ? (await getThread(request, admin, eventThreadId)).body?.messages.length : 0
        },
        { timeout: 60_000 },
      )
      .toBe(2)
    const withinPast = await moveOccurrence(
      request,
      admin,
      eventId,
      { startAt: new Date(Date.now() - 5 * hour).toISOString(), endAt: new Date(Date.now() - 4 * hour).toISOString() },
      intoPast.body?.updatedAt,
    )
    expect(withinPast.status, JSON.stringify(withinPast.body)).toBe(200)
    expect((withinPast.body as { notified?: number }).notified).toBe(0)
    // The two thread messages stay two; the notice subscribers have had the time the earlier polls gave them.
    await expect
      .poll(async () => (await getThread(request, admin, eventThreadId)).body?.messages.length, { timeout: 10_000 })
      .toBe(2)
  } finally {
    await club.cleanup()
  }
})
