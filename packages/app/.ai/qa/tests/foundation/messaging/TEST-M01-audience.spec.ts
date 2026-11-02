import { expect, test } from '@playwright/test'
import { createActivity, listOccurrences } from '../../_fixtures/activities'
import { birthDateTurning, calendarDate, createAccount, createClub, createPerson } from '../../_fixtures/club'
import { create as createStructure } from '../../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../../_fixtures/groups'
import { updateClubSettings } from '../../_fixtures/members'
import {
  outputOf,
  runProbe,
  uniqueAddress,
  type ProbeDelivery,
  type ProbeError,
  type ProbeRecipient,
} from '../../_fixtures/messaging'
import { createGuardianship } from '../../_fixtures/people'

// TEST-M01 (foundation III REQ-M01, AC-M01): an audience of each kind resolves through the providers `people`, `groups`
// and `activities` register — a group with participants aged 9 (no account), 14 (with an account) and 19; guardians with
// and without an account, one without an e-mail; a guardian of two children of the group; a coach who is also a
// guardian; a `persons` audience with a person outside the coach's scope; an unregistered kind. The expansion itself is
// unit-tested in `@vereino/core` (`audience.test.mjs`).
test.describe.configure({ timeout: 600_000 })

type AudienceOutput = { counts?: Record<string, number>; recipients?: ProbeRecipient[]; error?: ProbeError }

const SINCE = '2024-09-01'

test('TEST-M01 audience: every kind, the minor rule, channels, unreachable, scope, unregistered kind', async ({
  request,
}) => {
  const club = await createClub(request, 'test-m01')
  try {
    const admin = club.adminToken
    const person = (input: Record<string, unknown>) => createPerson(request, admin, input)
    const settings = await updateClubSettings(request, admin, { ownAccountMinAge: 13, defaultLocale: 'pl' })
    expect(settings.status, JSON.stringify(settings.body)).toBe(200)

    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia' })
    const pool = await createStructure(request, admin, 'sections', { name: 'Basen' })
    const pitch = await createStructure(request, admin, 'places', { name: 'Boisko', kind: 'pitch', capacityGroups: 1 })
    const rocznik = await createGroup(request, admin, { sectionId: academy, name: 'Rocznik 2017', kind: 'team' })
    const swimmers = await createGroup(request, admin, { sectionId: pool, name: 'Pływacy', kind: 'class_group' })

    // Participants: 9 without an account (an address of their own that must not be used), 14 with an account, 19.
    const p9 = await person({
      firstName: 'Ala',
      lastName: 'Dziewięć',
      birthDate: birthDateTurning(9, -30),
      email: uniqueAddress('p9'),
    })
    const p14 = await person({ firstName: 'Ola', lastName: 'Czternaście', birthDate: birthDateTurning(14, -30) })
    const p14Account = await createAccount(request, admin, p14, uniqueAddress('p14'))
    expect(p14Account.status, JSON.stringify(p14Account.body)).toBe(201)
    club.extraUserIds.push(String(p14Account.body?.userId))
    const p19 = await person({
      firstName: 'Iga',
      lastName: 'Dziewiętnaście',
      birthDate: birthDateTurning(19, -30),
      email: uniqueAddress('p19'),
    })

    // Guardians: one of two children with an account (English), one without an account, one with neither.
    const gBoth = await person({
      firstName: 'Anna',
      lastName: 'Dwoje',
      preferredLocale: 'en',
      birthDate: birthDateTurning(40),
    })
    const gBothAccount = await createAccount(request, admin, gBoth, uniqueAddress('g-both'))
    expect(gBothAccount.status, JSON.stringify(gBothAccount.body)).toBe(201)
    club.extraUserIds.push(String(gBothAccount.body?.userId))
    const gNoAccount = await person({ firstName: 'Piotr', lastName: 'Bezkonta', email: uniqueAddress('g-na') })
    const gNothing = await person({ firstName: 'Ewa', lastName: 'Bezadresu' })

    // The coach of the group, who is also a guardian of the 9-year-old.
    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, { groupId: rocznik, personId: coach.personId, role: 'coach', validFrom: SINCE })
    for (const ward of [p9, p14, p19]) {
      await addMembership(request, admin, { groupId: rocznik, personId: ward, role: 'participant', validFrom: SINCE })
    }
    for (const [guardianPersonId, wardPersonId] of [
      [gBoth, p9],
      [gBoth, p14],
      [gNoAccount, p14],
      [gNothing, p9],
      [coach.personId, p9],
    ]) {
      await createGuardianship(request, admin, { guardianPersonId, wardPersonId, relation: 'parent', validFrom: SINCE })
    }
    // A swimmer in the other section: outside the coach's scope.
    const outsider = await person({
      firstName: 'Jan',
      lastName: 'Obcy',
      birthDate: birthDateTurning(30),
      email: uniqueAddress('out'),
    })
    await addMembership(request, admin, {
      groupId: swimmers,
      personId: outsider,
      role: 'participant',
      validFrom: SINCE,
    })

    // An activity of the group with one session next week, coached by the coach.
    const activity = await createActivity(request, admin, {
      groupId: rocznik,
      name: 'Trening',
      type: 'training',
      placeId: pitch,
      startsOn: calendarDate(7),
      startTime: '17:00',
      endTime: '18:30',
      coachPersonId: coach.personId,
    })
    const sessions = await listOccurrences(request, admin, `&activityId=${activity.id}`)
    const sessionId = String(sessions.items.at(0)?.id)

    const scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const groupSpec = { kind: 'group', ids: [rocznik] }
    const run = runProbe(scope, [
      { op: 'audience', spec: groupSpec },
      { op: 'audience', spec: { kind: 'section', ids: [academy] } },
      { op: 'audience', spec: { kind: 'club' } },
      { op: 'audience', spec: { kind: 'activity', ids: [activity.id] } },
      { op: 'audience', spec: { kind: 'occurrence', ids: [sessionId] } },
      // 5–7: the coach as the author: their group without themself; persons inside and outside their scope.
      { op: 'audience', spec: groupSpec, authorUserId: coach.userId, exclude: [coach.personId] },
      { op: 'audience', spec: { kind: 'persons', ids: [p19, p14] }, authorUserId: coach.userId },
      { op: 'audience', spec: { kind: 'persons', ids: [p19, outsider] }, authorUserId: coach.userId },
      // 8: the club administrator may address anyone.
      { op: 'audience', spec: { kind: 'persons', ids: [p19, outsider] }, authorUserId: club.adminUserId },
      // 9–10: one delivery per person and channel, with every reason.
      {
        op: 'enqueue',
        template: 'qa_probe.message',
        params: { subject: 'Trening', body: 'Treść' },
        audience: groupSpec,
        sourceId: rocznik,
        idempotencyKey: `test-m01:${rocznik}`,
        publish: false,
        as: 'dispatch',
      },
      { op: 'deliveries', dispatch: 'dispatch' },
      // 11–13: an unknown kind, and a kind whose module is absent from the deployment.
      { op: 'audience', spec: { kind: 'direct', ids: [p19] } },
      { op: 'hideProviders', tokens: ['vereino.audience.activity'] },
      { op: 'audience', spec: { kind: 'activity', ids: [activity.id] } },
    ])
    expect(run.result.failure).toBeNull()

    const audienceAt = (index: number) => outputOf(run, index) as AudienceOutput
    const byPerson = (output: AudienceOutput) =>
      new Map((output.recipients ?? []).map((recipient) => [recipient.personId, recipient]))

    // The group: the 9-year-old reached through the guardians only; the 14-year-old with an account kept beside their
    // guardians; the 19-year-old kept on e-mail; the guardian of two children once; the coach-guardian once with both
    // reasons; no account → e-mail only; neither → unreachable.
    const group = audienceAt(0)
    expect(group.error, JSON.stringify(group.error)).toBeUndefined()
    const members = byPerson(group)
    expect(members.has(p9)).toBe(false)
    expect(members.get(p14)).toMatchObject({ reasons: ['participant'], channels: ['in_app', 'email'], locale: 'pl' })
    expect(members.get(p19)).toMatchObject({ reasons: ['participant'], channels: ['email'] })
    expect(members.get(gBoth)).toMatchObject({ reasons: ['guardian'], channels: ['in_app', 'email'], locale: 'en' })
    expect(members.get(coach.personId)).toMatchObject({ reasons: ['coach', 'guardian'], channels: ['in_app', 'email'] })
    expect(members.get(gNoAccount)).toMatchObject({ reasons: ['guardian'], channels: ['email'], userId: null })
    expect(members.get(gNothing)).toMatchObject({ reasons: ['guardian'], channels: [] })
    expect([...members.keys()].sort()).toEqual([p14, p19, gBoth, gNoAccount, gNothing, coach.personId].sort())
    expect(group.counts).toEqual({ recipients: 5, withoutEmail: 0, unreachable: 1 })

    // The section, the activity and the session reach the same people; the club adds the other section's swimmer.
    for (const index of [1, 3, 4]) {
      const output = audienceAt(index)
      expect(output.error, `step ${String(index)} ${JSON.stringify(output.error)}`).toBeUndefined()
      expect([...byPerson(output).keys()].sort(), `step ${String(index)}`).toEqual([...members.keys()].sort())
    }
    const clubWide = byPerson(audienceAt(2))
    expect([...clubWide.keys()].sort()).toEqual([...members.keys(), outsider].sort())

    // The author is excluded, also where they are a guardian.
    const withoutAuthor = byPerson(audienceAt(5))
    expect(withoutAuthor.has(coach.personId)).toBe(false)
    expect(withoutAuthor.size).toBe(members.size - 1)

    // `persons`: inside the coach's scope resolves (the 14-year-old with an account is reached directly and their
    // guardians are added); one id outside refuses the whole request with 403; the administrator may address both.
    const inScope = audienceAt(6)
    expect(inScope.error, JSON.stringify(inScope.error)).toBeUndefined()
    expect(byPerson(inScope).get(p14)).toMatchObject({ reasons: ['direct'] })
    expect(byPerson(inScope).get(gBoth)).toMatchObject({ reasons: ['guardian'] })
    expect(audienceAt(7).error).toMatchObject({ status: 403, code: 'scope_denied' })
    expect(audienceAt(8).error).toBeUndefined()
    expect([...byPerson(audienceAt(8)).keys()].sort()).toEqual([p19, outsider].sort())

    // One delivery per person and channel; the coach-guardian's rows carry both reasons; the unreachable guardian has
    // one skipped row; nobody without an account gets an in-app row; the 9-year-old has none.
    const deliveries = (outputOf(run, 10) as { items: ProbeDelivery[] }).items
    const rowsOf = (personId: string) => deliveries.filter((row) => row.personId === personId)
    expect(rowsOf(coach.personId).map((row) => [row.channel, row.reasons])).toEqual([
      ['email', ['coach', 'guardian']],
      ['in_app', ['coach', 'guardian']],
    ])
    expect(rowsOf(gBoth).map((row) => row.channel)).toEqual(['email', 'in_app'])
    expect(rowsOf(p14).map((row) => row.channel)).toEqual(['email', 'in_app'])
    expect(rowsOf(p19).map((row) => row.channel)).toEqual(['email'])
    expect(rowsOf(gNoAccount).map((row) => row.channel)).toEqual(['email'])
    expect(rowsOf(gNothing)).toEqual([
      expect.objectContaining({ channel: 'email', status: 'skipped', skipReason: 'unreachable', hasEmail: false }),
    ])
    expect(rowsOf(p9)).toEqual([])
    expect(new Set(deliveries.map((row) => `${String(row.personId)}:${row.channel}`)).size).toBe(deliveries.length)
    expect(rowsOf(gBoth).find((row) => row.channel === 'email')?.locale).toBe('en')

    // An unknown kind and a kind no registered module provides fail closed with 422.
    expect(audienceAt(11).error).toMatchObject({ status: 422, code: 'audience_kind_unavailable' })
    expect(audienceAt(13).error).toMatchObject({ status: 422, code: 'audience_kind_unavailable' })
  } finally {
    await club.cleanup()
  }
})
