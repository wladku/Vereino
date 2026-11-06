import { expect, test } from '@playwright/test'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import {
  addDays,
  cancelOccurrence,
  createActivity,
  getOccurrence,
  juneThirtiethNextYear,
  listOccurrences,
  readNotifications,
  scheduleFor,
} from '../_fixtures/activities'
import { birthDateTurning, calendarDate, createClub, createPerson, createStaff, signInAs } from '../_fixtures/club'
import { awaitEmails, emailsTo, getThread, listThreads } from '../_fixtures/communication'
import { addMembership } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { runProbe, uniqueAddress } from '../_fixtures/messaging'
import { actionLogEntries, createGuardianship } from '../_fixtures/people'

// TEST-M07 (foundation III REQ-M07, AC-M07; club spec J-003 step 1): cancelling a planned session creates the session
// thread with a system message carrying the reason and e-mails the session audience once per cancellation event — the
// guardian of a minor (with and without an account), an adult participant, the coach — never the canceller. A replayed
// event and copies delivered concurrently add nothing (one thread, one message, one e-mail each); no second in-app
// notice appears (the phase 2 `activities.occurrence_cancelled` stays the only one); reopening the session (the undo of
// the cancellation) and cancelling it again adds a message and one more e-mail.
test.describe.configure({ timeout: 600_000 })

const SUBJECT = 'Odwołane: Trening Żaków'

test('TEST-M07 session cancellation: one session thread, a system message, one e-mail per recipient per event, replays and concurrency are no-ops, a second cancellation adds one', async ({
  request,
}) => {
  const club = await createClub(request, 'test-m07')
  try {
    const admin = club.adminToken
    const settings = await updateClubSettings(request, admin, { defaultLocale: 'pl' })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const { pitch, zaki } = await scheduleFor(request, club)
    const today = calendarDate()
    const since = addDays(today, -30)

    const child = await createPerson(request, admin, {
      firstName: 'Jan',
      lastName: 'Mały',
      birthDate: birthDateTurning(8),
    })
    const guardian = await createStaff(request, club, {
      firstName: 'Anna',
      lastName: 'Mała',
      birthDate: birthDateTurning(38),
    })
    const offlineAddress = uniqueAddress('offline-guardian')
    const offlineGuardian = await createPerson(request, admin, {
      firstName: 'Piotr',
      lastName: 'Bezkonta',
      birthDate: birthDateTurning(40),
      email: offlineAddress,
    })
    for (const guardianPersonId of [guardian.personId, offlineGuardian]) {
      await createGuardianship(request, admin, { guardianPersonId, wardPersonId: child, validFrom: since })
    }
    const adult = await createStaff(request, club, {
      firstName: 'Iga',
      lastName: 'Dorosła',
      birthDate: birthDateTurning(19),
    })
    const coach = await createStaff(request, club, {
      firstName: 'Marek',
      lastName: 'Trener',
      birthDate: birthDateTurning(40),
    })
    for (const personId of [child, adult.personId]) {
      await addMembership(request, admin, { groupId: zaki, personId, role: 'participant', validFrom: since })
    }
    await addMembership(request, admin, { groupId: zaki, personId: coach.personId, role: 'coach', validFrom: since })
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
    const recipients = [guardian.email, offlineAddress, adult.email, coach.email]

    // The administrator cancels (they are not in the session's audience).
    const reason = 'Ulewa — boisko zamknięte'
    const cancelled = await cancelOccurrence(request, admin, session.id, reason, session.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    const eventKey = `${session.id}:${String(cancelled.body?.updatedAt)}`

    // The same event delivered three more times at once (beside the app's own delivery): one wins, the rest are no-ops;
    // whatever the probe's process enqueued is delivered by its drain.
    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const concurrent = runProbe(scope, [
      {
        op: 'command',
        id: 'communication.threads.record_cancellation',
        input: {
          occurrenceId: session.id,
          eventKey,
          actorUserId: club.adminUserId,
          actorPersonId: club.adminPersonId,
          actingRole: 'club_admin',
        },
        times: 3,
      },
      { op: 'drain' },
    ])
    expect(concurrent.result.failure).toBeNull()
    const runs = (concurrent.result.outputs[0] as { results: { result?: { created?: boolean }; error?: unknown }[] })
      .results
    expect(runs.every((run) => run.error === undefined)).toBe(true)
    expect(runs.filter((run) => run.result?.created === true).length).toBeLessThanOrEqual(1)

    // One session thread with one system message carrying the reason.
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
    // #139: the notice names who cancelled and in which role (R01) and stays a system message.
    expect(thread.body?.messages.at(0)).toMatchObject({ system: true, body: reason, actingRole: 'club_admin' })
    expect(thread.body?.messages.at(0)?.authorName).toBeTruthy()

    // One e-mail per recipient, in Polish (the club's language), with the reason; none for the canceller.
    for (const address of recipients) {
      const [mail] = await awaitEmails(address, SUBJECT)
      expect(mail?.text).toContain(reason)
      expect(mail?.links.some((link) => link.includes(`/club/messages/${threadId}`))).toBe(true)
    }

    // A replay after everything settled adds nothing.
    const replay = runProbe(scope, [
      {
        op: 'command',
        id: 'communication.threads.record_cancellation',
        input: {
          occurrenceId: session.id,
          eventKey,
          actorUserId: club.adminUserId,
          actorPersonId: club.adminPersonId,
          actingRole: 'club_admin',
        },
      },
      { op: 'drain' },
    ])
    expect(
      (replay.result.outputs[0] as { results: { result?: { created?: boolean } }[] }).results[0]?.result?.created,
    ).toBe(false)
    for (const address of recipients) expect(emailsTo(address, SUBJECT), address).toHaveLength(1)
    expect((await getThread(request, admin, threadId)).body?.messages).toHaveLength(1)

    // No second in-app notice: only the phase 2 one.
    const guardianToken = await signInAs(request, club, guardian.userId, guardian.email)
    await expect
      .poll(
        async () =>
          (
            await readNotifications(
              request,
              guardianToken,
              `&type=activities.occurrence_cancelled&sourceEntityId=${session.id}`,
            )
          ).length,
        { timeout: 30_000 },
      )
      .toBe(1)
    expect(await readNotifications(request, guardianToken, '&type=communication.announcement')).toEqual([])
    expect(await readNotifications(request, guardianToken, '&type=communication.reply')).toEqual([])

    // Reopen (the undo of the cancellation) and cancel again: one more message and one more e-mail each.
    const cancelLog = (await actionLogEntries(request, admin, session.id)).find(
      (entry) => entry.commandId === 'activities.occurrences.cancel',
    )
    const undone = await undoByToken(request, admin, String(cancelLog?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    const reopened = await getOccurrence(request, admin, session.id)
    expect(reopened.body?.status).toBe('planned')
    const again = await cancelOccurrence(request, admin, session.id, 'Mróz', reopened.body?.updatedAt)
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    await expect
      .poll(async () => (await getThread(request, admin, threadId)).body?.messages.length, { timeout: 60_000 })
      .toBe(2)
    expect((await getThread(request, admin, threadId)).body?.messages.at(1)).toMatchObject({
      system: true,
      body: 'Mróz',
    })
    for (const address of recipients) await awaitEmails(address, SUBJECT, 2)
    for (const address of recipients) expect(emailsTo(address, SUBJECT), address).toHaveLength(2)
    expect(await listThreads(request, admin, `&scopeType=occurrence&scopeId=${session.id}`)).toHaveLength(1)
    expect(
      await readNotifications(
        request,
        guardianToken,
        `&type=activities.occurrence_cancelled&sourceEntityId=${session.id}`,
      ),
    ).toHaveLength(1)
  } finally {
    await club.cleanup()
  }
})
