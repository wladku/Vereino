import { expect, test } from '@playwright/test'
import {
  addDays,
  createActivity,
  createEvent,
  getOccurrence,
  moveOccurrence,
  zoneInstant,
} from '../_fixtures/activities'
import {
  declare,
  familyFor,
  guardianDecide,
  readAttendanceList,
  readCalendarItem,
  sessionsOf,
} from '../_fixtures/attendance'
import { birthDateTurning, calendarDate, createClub, createPerson, mercato, uniqueSuffix } from '../_fixtures/club'
import { awaitEmails, emailsTo } from '../_fixtures/communication'
import { linkApi, passDeadline, publicCall, requestLink, tokenFromEmail } from '../_fixtures/declaration-links'
import { addMembership } from '../_fixtures/groups'
import { updateClubSettings } from '../_fixtures/members'
import { uniqueAddress } from '../_fixtures/messaging'
import { createGuardianship } from '../_fixtures/people'
import { publish } from '../_fixtures/publication'

// Groups and activities parity spec TEST-A09 (REQ-A07, DD-A01, DD-A02; D-031 §5; #269): a match (`confirm`) carries a
// declaration deadline as minutes before its start. Before it the guardian, the ward with guardian_confirm and the
// personal link declare; after it (written into the fixture, no test waits for the clock) the guardian and the link
// answer 409 `declaration_deadline_passed` with `confirmBy`, while the coach still records a declaration and
// the guardian still decides a declaration the ward made before the deadline. A training (`absence_only`) ignores a
// deadline value. A move keeps the offset, so `confirmBy` moves with the session; a move whose kept deadline falls in
// the past answers 422 `occurrence_confirm_by_in_past` until `confirmBy` is sent. The coach's list counts and lists
// first who has not answered. The evening reminder goes on the evening before the deadline's day and never after it.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

test('TEST-A09 declaration deadline: 409 after it for guardian and link, staff and pending decisions accepted, absence_only unaffected, moves keep the offset or need confirmBy, unanswered first, reminder before the deadline day', async ({
  request,
}) => {
  const club = await createClub(request, 'test-a09')
  try {
    const admin = club.adminToken
    const family = await familyFor(request, club)
    expect((await updateClubSettings(request, admin, { defaultLocale: 'en' })).status).toBe(200)
    const coordinator = family.academyCoordinator.token
    const slug = `ta09-${uniqueSuffix()}`.toLowerCase()
    await publish(request, admin, slug, [])
    const today = calendarDate()
    const since = addDays(today, -30)

    // A guardian without an account (the personal link) with a child in Żaki.
    const ewaEmail = uniqueAddress('ewa-a09')
    const ewa = await createPerson(request, admin, {
      firstName: 'Ewa',
      lastName: 'Terminowa',
      birthDate: birthDateTurning(38),
      email: ewaEmail,
    })
    const zosia = await createPerson(request, admin, {
      firstName: 'Zosia',
      lastName: 'Terminowa',
      birthDate: birthDateTurning(9),
    })
    await createGuardianship(request, admin, {
      guardianPersonId: ewa,
      wardPersonId: zosia,
      isPrimaryPayer: true,
      consents: { regulations: true },
      validFrom: since,
    })
    await addMembership(request, admin, {
      groupId: family.zaki,
      personId: zosia,
      role: 'participant',
      validFrom: since,
    })

    // --- A match in three days at 10:00, confirm by the day before at 10:00 ---
    const matchDate = addDays(today, 3)
    const match = await createActivity(request, coordinator, {
      groupId: family.zaki,
      name: 'Mecz z terminem',
      type: 'match',
      placeId: family.pitch,
      startsOn: matchDate,
      startTime: '10:00',
      endTime: '11:30',
      confirmByMinutesBefore: 1440,
    })
    const [matchSession] = await sessionsOf(request, club, match.id)
    const matchStart = zoneInstant(matchDate, '10:00')
    const before = (await getOccurrence(request, admin, matchSession.id)).body
    expect(before).toMatchObject({
      confirmByMinutesBefore: 1440,
      confirmBy: new Date(new Date(matchStart).getTime() - DAY_MS).toISOString(),
      deadlinePassed: false,
    })
    const guardianBefore = await readCalendarItem(request, family.guardian.token, matchSession.id, 'as=guardian')
    expect(guardianBefore.status, JSON.stringify(guardianBefore.body)).toBe(200)
    expect(guardianBefore.body?.occurrence).toMatchObject({ confirmBy: before?.confirmBy, deadlinePassed: false })
    expect(guardianBefore.body?.persons?.every((person) => person.canDeclare)).toBe(true)

    // Before the deadline: the guardian declares, the 16-year-old's own "yes" waits for the guardian, the link works.
    const early = await declare(request, family.guardian.token, {
      occurrenceId: matchSession.id,
      personId: family.younger.personId,
      declared: 'yes',
    })
    expect(early.status, JSON.stringify(early.body)).toBe(201)
    const pending = await declare(request, family.elder.token, {
      occurrenceId: matchSession.id,
      personId: family.elder.personId,
      declared: 'yes',
    })
    expect(pending.status, JSON.stringify(pending.body)).toBe(201)
    expect(pending.body?.declarationStatus).toBe('pending_guardian')
    expect((await requestLink(ewaEmail, slug, matchSession.id)).status).toBe(202)
    const linkToken = tokenFromEmail((await awaitEmails(ewaEmail, 'Mecz z terminem'))[0])

    // --- A training (absence_only) with a deadline value: members never see it, absences stay accepted ---
    const training = await createActivity(request, coordinator, {
      groupId: family.zaki,
      name: 'Trening z terminem',
      type: 'training',
      placeId: family.pitch,
      startsOn: matchDate,
      startTime: '17:00',
      endTime: '18:00',
      confirmByMinutesBefore: 120,
    })
    const [trainingSession] = await sessionsOf(request, club, training.id)

    // --- The deadline passes (written into the fixture) ---
    await passDeadline(matchSession.id)
    await passDeadline(trainingSession.id)
    const passed = (await getOccurrence(request, admin, matchSession.id)).body
    expect(passed?.deadlinePassed).toBe(true)

    const late = await declare(request, family.guardian.token, {
      occurrenceId: matchSession.id,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(late.status, JSON.stringify(late.body)).toBe(409)
    expect(late.body).toMatchObject({ code: 'declaration_deadline_passed' })
    // The error factory spreads the details into the body, next to `code` and `error` (S6.7).
    expect((late.body as { confirmBy?: string } | null)?.confirmBy).toBe(passed?.confirmBy)
    const lateLink = await publicCall('POST', linkApi(linkToken), { personId: zosia, declared: 'yes' })
    expect(lateLink.status, lateLink.text).toBe(409)
    expect(lateLink.body?.code).toBe('declaration_deadline_passed')

    // The member read closes the person's controls but keeps the session open for the pending decision.
    const guardianAfter = await readCalendarItem(request, family.guardian.token, matchSession.id, 'as=guardian')
    expect(guardianAfter.body?.occurrence).toMatchObject({ deadlinePassed: true })
    expect(guardianAfter.body?.declarationsOpen).toBe(true)
    expect(guardianAfter.body?.persons?.some((person) => person.canDeclare)).toBe(false)

    // A pending decision on a declaration made before the deadline is accepted until the start.
    const decided = await guardianDecide(
      request,
      family.guardian.token,
      String(pending.body?.id),
      true,
      pending.body?.updatedAt,
    )
    expect(decided.status, JSON.stringify(decided.body)).toBe(200)
    // The coach still records a declaration.
    const byCoach = await declare(request, family.coach.token, {
      occurrenceId: matchSession.id,
      personId: zosia,
      declared: 'yes',
    })
    expect(byCoach.status, JSON.stringify(byCoach.body)).toBe(201)

    // The coach's list: how many have not answered, and they come first.
    const list = await readAttendanceList(request, family.coach.token, matchSession.id)
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    expect(list.body?.unansweredCount).toBe(1)
    expect(list.body?.rows?.[0]).toMatchObject({ personId: family.other.child.personId, expectation: 'unanswered' })

    // The training ignores its deadline value: no deadline for members, the absence is accepted.
    const trainingItem = await readCalendarItem(request, family.guardian.token, trainingSession.id, 'as=guardian')
    expect(trainingItem.body?.occurrence).toMatchObject({ confirmBy: null, deadlinePassed: false })
    const absence = await declare(request, family.guardian.token, {
      occurrenceId: trainingSession.id,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(absence.status, JSON.stringify(absence.body)).toBe(201)

    // --- Moves keep the offset ---
    const start = new Date(String(passed?.startAt)).getTime()
    const end = new Date(String(passed?.endAt)).getTime()
    const later = await moveOccurrence(
      request,
      coordinator,
      matchSession.id,
      { startAt: new Date(start + DAY_MS).toISOString(), endAt: new Date(end + DAY_MS).toISOString() },
      passed?.updatedAt,
    )
    expect(later.status, JSON.stringify(later.body)).toBe(200)
    const moved = (await getOccurrence(request, admin, matchSession.id)).body
    expect(new Date(String(moved?.confirmBy)).getTime()).toBe(new Date(String(passed?.confirmBy)).getTime() + DAY_MS)
    expect(moved?.deadlinePassed).toBe(false)
    // Back by a day: the kept deadline would be in the past, so the move must send confirmBy.
    const back = { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() }
    const refused = await moveOccurrence(request, coordinator, matchSession.id, back, moved?.updatedAt)
    expect(refused.status, JSON.stringify(refused.body)).toBe(422)
    expect(refused.body?.code).toBe('occurrence_confirm_by_in_past')
    for (const [confirmBy, code] of [
      [new Date(start).toISOString(), 'occurrence_confirm_by_after_start'],
      [new Date(start - 15 * DAY_MS).toISOString(), 'occurrence_confirm_by_too_early'],
      [new Date(Date.now() - HOUR_MS).toISOString(), 'occurrence_confirm_by_in_past'],
    ] as const) {
      const forged = await moveOccurrence(
        request,
        coordinator,
        matchSession.id,
        { ...back, confirmBy },
        moved?.updatedAt,
      )
      expect(forged.status, JSON.stringify(forged.body)).toBe(422)
      expect(forged.body?.code).toBe(code)
    }
    const accepted = await moveOccurrence(
      request,
      coordinator,
      matchSession.id,
      { ...back, confirmBy: new Date(start - HOUR_MS).toISOString() },
      moved?.updatedAt,
    )
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    const reset = (await getOccurrence(request, admin, matchSession.id)).body
    expect(reset).toMatchObject({ confirmByMinutesBefore: 60, deadlinePassed: false })
    const cleared = await moveOccurrence(request, coordinator, matchSession.id, { confirmBy: null }, reset?.updatedAt)
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    expect((await getOccurrence(request, admin, matchSession.id)).body?.confirmBy).toBeNull()

    // A one-off event whose own deadline is already in the past is refused.
    const pastEvent = await createEvent(request, coordinator, {
      groupId: family.zaki,
      type: 'other',
      name: 'Wydarzenie po terminie',
      placeId: family.pitch,
      startsAt: zoneInstant(addDays(today, 1), '12:00'),
      endsAt: zoneInstant(addDays(today, 1), '13:00'),
      confirmByMinutesBefore: 3 * 1440,
    })
    expect(pastEvent.status, JSON.stringify(pastEvent.body)).toBe(422)
    expect(pastEvent.body?.code).toBe('occurrence_confirm_by_in_past')

    // --- The evening reminder: before the deadline's day, never after the deadline ---
    // Mecz C on day 4 at 10:00, confirm by day 1 at 12:00: reminded on the evening of day 0.
    const cDate = addDays(today, 4)
    const cOffset = Math.round(
      (new Date(zoneInstant(cDate, '10:00')).getTime() - new Date(zoneInstant(addDays(today, 1), '12:00')).getTime()) /
        60_000,
    )
    await createActivity(request, coordinator, {
      groupId: family.zaki,
      name: 'Mecz C',
      type: 'match',
      placeId: family.pitch,
      startsOn: cDate,
      startTime: '10:00',
      endTime: '11:30',
      confirmByMinutesBefore: cOffset,
    })
    // Mecz E on day 2 at 10:00, confirm by day 0 at 10:00: no reminder on the evening before the session.
    await createActivity(request, coordinator, {
      groupId: family.zaki,
      name: 'Mecz E',
      type: 'match',
      placeId: family.pitch,
      startsOn: addDays(today, 2),
      startTime: '10:00',
      endTime: '11:30',
      confirmByMinutesBefore: 2 * 1440,
    })
    const scope = ['--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]
    const eveOfDeadline = mercato([
      'activities',
      'send-declaration-reminders',
      ...scope,
      '--now',
      `${today}T17:00:00.000Z`,
    ]) as { processed?: number; failed?: number }
    expect(eveOfDeadline.failed).toBe(0)
    const [reminder] = await awaitEmails(ewaEmail, 'Mecz C')
    expect(reminder.subject).toContain('Confirm by')
    const eveOfSession = mercato([
      'activities',
      'send-declaration-reminders',
      ...scope,
      '--now',
      `${addDays(today, 1)}T17:00:00.000Z`,
    ]) as { processed?: number; failed?: number }
    expect(eveOfSession).toMatchObject({ processed: 0, failed: 0 })
    expect(emailsTo(ewaEmail, 'Mecz E')).toHaveLength(0)
  } finally {
    await club.cleanup()
  }
})
