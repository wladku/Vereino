import { expect, test, type APIRequestContext } from '@playwright/test'
import { createActivity } from '../_fixtures/activities'
import {
  ensureDefaultPolicies,
  memberAccount,
  readAttendanceList,
  rowOf,
  saveAttendanceList,
  sessionsOf,
  startNow,
} from '../_fixtures/attendance'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  getPerson,
  mercato,
  uniqueSuffix,
} from '../_fixtures/club'
import { create } from '../_fixtures/club-structure'
import { getThread, listThreads, postReply, postThread } from '../_fixtures/communication'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { getCharge, listCharges, recordPayment } from '../_fixtures/payments'
import { uiTextIn } from '../_fixtures/ui-text'

// People life-cycle spec AC-L06 (REQ-L05; #599, found by the close-out #568): TEST-L24 — the history an anonymised
// person leaves on other modules' screens reads "Former member", with no former name or contact, through the routes
// those screens use. A coach (Tomasz) runs a session this month and marks a participant (Kasia) present, posts a group
// announcement Kasia replies to, and Kasia pays a charge. Both leave today, the next day's job closes their accounts,
// erasure requests are recorded and both are anonymised. Then, read by the club administrator (who may still see the held name on the
// person record): the attendance list (Kasia's row and the "marked by" name), the coach units report and its CSV
// (Tomasz's row), the thread and the thread list (the announcement's author, Kasia's reply), and the charges list
// (Kasia as the person charged) all read "Former member" — the counts, marks and amounts stay. Before the
// anonymisation the same reads show the real names (the oracle).
test.describe.configure({ timeout: 420_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const FORMER_MEMBER = [uiTextIn('en', 'people.person.formerMember'), uiTextIn('pl', 'people.person.formerMember')]

type CoachUnitsRow = { personId: string; coachName: string | null; planned: number; balance: number }

async function coachUnits(request: APIRequestContext, token: string, month: string): Promise<CoachUnitsRow[]> {
  const result = await call<{ items?: CoachUnitsRow[] }>(
    request,
    'GET',
    `/api/activities/reports/coach-units?month=${month}`,
    token,
  )
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body?.items ?? []
}

async function coachUnitsCsv(request: APIRequestContext, token: string, month: string): Promise<string> {
  const response = await request.get(`/api/activities/reports/coach-units?month=${month}&format=csv`, {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(response.status(), await response.text()).toBe(200)
  return response.text()
}

/**
 * Departs the persons today (they are former at once) through the preview and the confirm; `handOver` leaves a
 * leaving coach's groups unassigned.
 */
async function departToday(
  request: APIRequestContext,
  token: string,
  personIds: string[],
  handOver: { groupId: string; toPersonId: string | null }[],
): Promise<void> {
  const lastDay = calendarDate()
  const preview = await call<{ previewToken?: string }>(request, 'POST', '/api/people/departures/preview', token, {
    data: { personIds, lastDay },
  })
  expect(preview.status, JSON.stringify(preview.body)).toBe(200)
  const confirmed = await call(request, 'POST', '/api/people/departures', token, {
    data: { personIds, lastDay, previewToken: preview.body?.previewToken, handOver },
  })
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
}

/** Records the erasure request and anonymises the person (`people.persons.anonymize`). */
async function anonymise(request: APIRequestContext, token: string, personId: string, lastName: string) {
  const recorded = await call<{ id?: string }>(request, 'POST', '/api/people/departure-requests', token, {
    data: { subjectPersonId: personId, requesterKind: 'self', erasure: true, note: 'Letter of 22 November' },
  })
  expect(recorded.status, JSON.stringify(recorded.body)).toBe(201)
  const read = await getPerson(request, token, personId)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  const done = await call(request, 'POST', `/api/people/persons/${personId}/anonymize`, token, {
    data: { requestId: recorded.body?.id, confirmLastName: lastName },
    headers: { [OPTIMISTIC_LOCK_HEADER]: String((read.body as { updatedAt?: string }).updatedAt) },
  })
  expect(done.status, JSON.stringify(done.body)).toBe(200)
}

test('TEST-L24 after anonymisation the attendance list, units report, message thread and charges list read Former member', async ({
  request,
}) => {
  const club = await createClub(request, 'test-l24-former-member')
  try {
    const admin = club.adminToken
    const suffix = uniqueSuffix()
      .replace(/[^a-z]/gi, '')
      .slice(0, 6)
    const month = calendarDate().slice(0, 7)
    const since = calendarDate(-30)
    await ensureDefaultPolicies(request, club)

    const section = await create(request, admin, 'sections', { name: `Akademia ${suffix}` })
    const place = await create(request, admin, 'places', { name: `Boisko ${suffix}`, kind: 'pitch' })
    const group = await createGroup(request, admin, { sectionId: section, name: `Żaki ${suffix}`, kind: 'team' })

    // Kasia: an adult participant with an account; Tomasz: the group's coach with an account.
    const kasiaLast = `Zawadzka${suffix}`
    const kasiaEmail = `kasia-${suffix}@example.org`
    const kasia = await createPerson(request, admin, {
      firstName: 'Kasia',
      lastName: kasiaLast,
      birthDate: birthDateTurning(30),
      email: kasiaEmail,
      phone: '+48600100200',
    })
    await addMembership(request, admin, { groupId: group, personId: kasia, role: 'participant', validFrom: since })
    const kasiaMember = await memberAccount(request, club, kasia, 'kasia')
    const coachLast = `Trener${suffix}`
    const coach = await signedInStaff(request, club, { firstName: 'Tomasz', lastName: coachLast, role: 'coach' })
    await addMembership(request, admin, {
      groupId: group,
      personId: coach.personId,
      role: 'coach',
      validFrom: since,
    })
    const leaks = ['Kasia', kasiaLast, kasiaEmail, kasiaMember.email, '+48600100200', 'Tomasz', coachLast, coach.email]

    // --- History: a closed session with Kasia marked present by Tomasz ---
    const { id: activityId } = await createActivity(request, admin, {
      groupId: group,
      name: `Trening ${suffix}`,
      type: 'training',
      placeId: place,
      coachPersonId: coach.personId,
      startsOn: calendarDate(),
      startTime: '20:00',
      endTime: '20:45',
    })
    const session = (await sessionsOf(request, club, activityId)).at(0)
    if (!session) throw new Error('[test] the training has no session')
    const version = await startNow(request, club, session.id)
    const marked = await saveAttendanceList(
      request,
      coach.token,
      session.id,
      { entries: [{ personId: kasia, actual: 'present' }], complete: true },
      version,
    )
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)

    // --- History: Tomasz's announcement to the group and Kasia's reply ---
    const subject = `Zbiórka ${suffix}`
    const posted = await postThread(request, coach.token, {
      audience: { kind: 'group', ids: [group] },
      subject,
      body: 'Zbiórka o 17:45 przy szatni.',
    })
    expect(posted.status, JSON.stringify(posted.body)).toBe(201)
    const threadId = String(posted.body?.threadId)
    const reply = await postReply(request, kasiaMember.token, threadId, 'Będę na czas.')
    expect(reply.status, JSON.stringify(reply.body)).toBe(201)
    const replyId = String(reply.body?.messageId)

    // --- History: a charge of Kasia, paid in full (no open charge blocks the erasure) ---
    const charged = await call<{ chargeId?: string }>(request, 'POST', '/api/payments/charges', admin, {
      data: { personId: kasia, description: 'Składka', amount: 9_000, dueDate: calendarDate(7) },
    })
    expect(charged.status, JSON.stringify(charged.body)).toBe(201)
    const chargeId = String(charged.body?.chargeId)
    const paid = await recordPayment(request, admin, chargeId, (await getCharge(request, admin, chargeId)).updatedAt, {
      amount: 9_000,
      method: 'transfer',
      paidOn: calendarDate(),
    })
    expect(paid.status, JSON.stringify(paid.body)).toBe(201)

    // --- The oracle: before the anonymisation every screen names them ---
    const listBefore = await readAttendanceList(request, admin, session.id)
    expect(listBefore.status, JSON.stringify(listBefore.body)).toBe(200)
    expect(rowOf(listBefore.body ?? {}, kasia)).toMatchObject({
      firstName: 'Kasia',
      lastName: kasiaLast,
      actual: 'present',
      markedByName: `Tomasz ${coachLast}`,
    })
    expect((await coachUnits(request, admin, month)).find((row) => row.personId === coach.personId)?.coachName).toBe(
      `Tomasz ${coachLast}`,
    )
    const threadBefore = await getThread(request, admin, threadId)
    expect(threadBefore.status, JSON.stringify(threadBefore.body)).toBe(200)
    expect(threadBefore.body?.authorName).toBe(`Tomasz ${coachLast}`)
    expect(threadBefore.body?.messages.find((message) => message.id === replyId)?.authorName).toBe(`Kasia ${kasiaLast}`)
    const chargesBefore = await listCharges(request, admin, `&personId=${kasia}`)
    expect(chargesBefore.find((charge) => charge.id === chargeId)?.person).toEqual({
      firstName: 'Kasia',
      lastName: kasiaLast,
    })

    // --- Both leave today; requests recorded; anonymised ---
    await departToday(request, admin, [kasia, coach.personId], [{ groupId: group, toPersonId: null }])
    // The daily job of the next day closes both accounts (Q-L09): an open account refuses the erasure.
    mercato([
      'people',
      'sync-role-expiry',
      '--tenant',
      club.tenant.tenantId,
      '--org',
      club.tenant.organizationId,
      '--today',
      calendarDate(1),
    ])
    for (const personId of [kasia, coach.personId]) {
      expect(((await getPerson(request, admin, personId)).body as { userId?: string | null }).userId ?? null).toBeNull()
    }
    await anonymise(request, admin, kasia, kasiaLast)
    await anonymise(request, admin, coach.personId, coachLast)

    const expectNoLeak = (label: string, value: unknown) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      for (const leak of leaks) expect(text, `${label} leaks ${leak}`).not.toContain(leak)
    }

    // The attendance list: Kasia's row and the "marked by" name read Former member; the mark stays.
    const listAfter = await readAttendanceList(request, admin, session.id)
    expect(listAfter.status, JSON.stringify(listAfter.body)).toBe(200)
    const row = rowOf(listAfter.body ?? {}, kasia)
    expect(FORMER_MEMBER).toContain(row.firstName)
    expect(row.lastName).toBe('')
    expect(row.actual).toBe('present')
    expect(FORMER_MEMBER).toContain(row.markedByName)
    expectNoLeak('attendance list', listAfter.body)

    // The coach units report and its CSV: Tomasz's row reads Former member; the count stays.
    const unitsAfter = await coachUnits(request, admin, month)
    const unitsRow = unitsAfter.find((item) => item.personId === coach.personId)
    expect(unitsRow, JSON.stringify(unitsAfter)).toMatchObject({ planned: 1, balance: 1 })
    expect(FORMER_MEMBER).toContain(unitsRow?.coachName)
    expectNoLeak('units report', unitsAfter)
    const csv = await coachUnitsCsv(request, admin, month)
    expect(
      FORMER_MEMBER.some((label) => csv.includes(label)),
      csv,
    ).toBe(true)
    expectNoLeak('units CSV', csv)

    // The thread and the thread list: the author and the reply read Former member; the bodies stay.
    const threadAfter = await getThread(request, admin, threadId)
    expect(threadAfter.status, JSON.stringify(threadAfter.body)).toBe(200)
    expect(FORMER_MEMBER).toContain(threadAfter.body?.authorName)
    const replyAfter = threadAfter.body?.messages.find((message) => message.id === replyId)
    expect(FORMER_MEMBER).toContain(replyAfter?.authorName)
    expect(replyAfter?.body).toBe('Będę na czas.')
    expectNoLeak('thread', threadAfter.body)
    const listed = (await listThreads(request, admin)).find((item) => item.id === threadId)
    expect(listed?.subject).toBe(subject)
    expect(FORMER_MEMBER).toContain(listed?.authorName)
    expect(FORMER_MEMBER).toContain(listed?.lastMessage?.authorName)
    expectNoLeak('thread list', listed)

    // The charges list: Kasia reads Former member; the amount and the payment stay.
    const chargesAfter = await listCharges(request, admin, `&personId=${kasia}`)
    const charge = chargesAfter.find((item) => item.id === chargeId)
    expect(charge, JSON.stringify(chargesAfter)).toMatchObject({ amount: 9_000, status: 'paid' })
    expect(FORMER_MEMBER).toContain(charge?.person?.firstName)
    expect(charge?.person?.lastName).toBe('')
    expectNoLeak('charges list', chargesAfter)
  } finally {
    await club.cleanup()
  }
})
