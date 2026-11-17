import { expect, test } from '@playwright/test'
import {
  addDays,
  createActivity,
  getActivity,
  listOccurrences,
  moveOccurrence,
  nextWeekday,
  readNotifications,
  scheduleFor,
  updateActivity,
} from '../_fixtures/activities'
import { birthDateTurning, calendarDate, createClub, createStaff, signInAs } from '../_fixtures/club'
import { awaitEmails, emailsTo, getThread, listThreads } from '../_fixtures/communication'
import { addMembership } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'

// TEST-A14 (groups and activities parity spec REQ-A09, DD-A08, AC-A11; #271): a weekly series with ten future sessions,
// one of them detached. Changing the series' start time sends one notice per recipient — one in-app notice, one e-mail
// and one message in the activity's thread — naming the first changed date and nine sessions (the detached one is not
// moved and not counted). Changing only the description sends none.
test.describe.configure({ timeout: 600_000 })

const SUBJECT = 'Zmiana planu: Trening Żaków'

test('TEST-A14 a series change is announced once with the first changed date and the number of moved sessions; a description change is not', async ({
  request,
}) => {
  const club = await createClub(request, 'test-a14')
  try {
    const admin = club.adminToken
    const settings = await updateClubSettings(request, admin, { defaultLocale: 'pl' })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)
    const { pitch, zaki, coordinator } = await scheduleFor(request, club)
    const today = calendarDate()
    const since = addDays(today, -30)
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
    await addMembership(request, admin, {
      groupId: zaki,
      personId: adult.personId,
      role: 'participant',
      validFrom: since,
    })
    await addMembership(request, admin, { groupId: zaki, personId: coach.personId, role: 'coach', validFrom: since })

    // Ten Tuesdays from the next one.
    const first = nextWeekday(addDays(today, 1), 'TU')
    const last = addDays(first, 63)
    const { id: activityId } = await createActivity(request, admin, {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      coachPersonId: coach.personId,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${last.replace(/-/g, '')}`,
      startsOn: first,
      startTime: '17:00',
      endTime: '18:30',
    })
    const sessions = (await listOccurrences(request, admin, `&activityId=${activityId}`)).items
    expect(sessions).toHaveLength(10)

    // The first session is detached by a coach change alone (announced nowhere).
    const detached = sessions[0]
    if (!detached) throw new Error('[internal] the series has no session')
    const recoached = await moveOccurrence(request, admin, detached.id, { coachPersonId: null }, detached.updatedAt)
    expect(recoached.status, JSON.stringify(recoached.body)).toBe(200)

    // The coordinator moves the series by half an hour.
    const before = await getActivity(request, admin, activityId)
    const changed = await updateActivity(
      request,
      coordinator,
      { id: activityId, startTime: '17:30', endTime: '19:00' },
      before.body?.updatedAt,
    )
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)

    // One message in the activity's thread naming the first changed date (the second Tuesday) and nine sessions.
    let threadId = ''
    await expect
      .poll(
        async () => {
          const threads = await listThreads(request, admin, `&scopeType=activity&scopeId=${activityId}`)
          threadId = threads.at(0)?.id ?? ''
          return threads.length
        },
        { timeout: 60_000, message: 'the activity thread exists' },
      )
      .toBe(1)
    const thread = await getThread(request, admin, threadId)
    expect(thread.body?.messages).toHaveLength(1)
    const body = thread.body?.messages.at(0)?.body ?? ''
    const [year, month, day] = addDays(first, 7).split('-')
    expect(body).toContain(`${day}.${month}.${year}`)
    expect(body).toContain('(9)')
    expect(body).toContain('17:30–19:00')
    expect(body).toContain('Krystyna Koordynator')

    // One e-mail and one in-app notice per recipient.
    for (const address of [adult.email, coach.email]) await awaitEmails(address, SUBJECT)
    const adultToken = await signInAs(request, club, adult.userId, adult.email)
    await expect
      .poll(async () => (await readNotifications(request, adultToken, '&type=activities.occurrence_moved')).length, {
        timeout: 30_000,
      })
      .toBe(1)

    // A description change alone moves nothing and sends nothing.
    const current = await getActivity(request, admin, activityId)
    const described = await updateActivity(
      request,
      coordinator,
      { id: activityId, description: 'Zabierzcie bidony' },
      current.body?.updatedAt,
    )
    expect(described.status, JSON.stringify(described.body)).toBe(200)
    await expect
      .poll(async () => (await getThread(request, admin, threadId)).body?.messages.length, { timeout: 10_000 })
      .toBe(1)
    for (const address of [adult.email, coach.email]) expect(emailsTo(address, SUBJECT), address).toHaveLength(1)
    expect(await readNotifications(request, adultToken, '&type=activities.occurrence_moved')).toHaveLength(1)
  } finally {
    await club.cleanup()
  }
})
