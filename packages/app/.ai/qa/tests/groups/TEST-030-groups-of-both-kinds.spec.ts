import { expect, test, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  addDays,
  createActivity,
  getOccurrence,
  listOccurrences,
  readNotifications,
  type OccurrenceItem,
} from '../_fixtures/activities'
import {
  addParticipants,
  familyFor,
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
} from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import {
  addMembership,
  createGroup,
  createSeason,
  deleteGroup,
  endMembership,
  getGroup,
  listGroups,
  postGroup,
  postMembership,
  roster,
  signedInStaff,
  updateGroup,
} from '../_fixtures/groups'

// TEST-030 (club spec phase 2 step 2; issue #30 criterion 1, membership part): a `team` group with a season in the
// academy and a `class_group` in a non-football section; both kinds go through the same membership cycle (add, read
// the roster, end, keep the history, add again); team fields on a class group → 422. The PZPN age category (the
// `dictionaries` module) is covered by `E06-S10-team-age-category.spec.ts` (#92); `match` → 422 for a class group by
// `E03-S02-scope-and-validation.spec.ts`. The second test (#592, AC-004) runs a training of each kind through an
// absence, a substitute and the attendance check-off and expects the same results for both.
test.describe.configure({ timeout: 300_000 })

test('TEST-030 a team and a class group go through the same membership cycle; team fields on a class group are refused with 422', async ({
  request,
}) => {
  const club = await createClub(request, 'test-030')
  try {
    const token = club.adminToken
    const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
    const pool = await createStructure(request, token, 'sections', { name: 'Basen' })
    const season = await createSeason(request, token, {
      name: '2026/2027',
      startsOn: '2026-08-01',
      endsOn: '2027-06-30',
    })

    // A team with its league and season; selectors (the list and the record) show the section and season names.
    const team = await createGroup(request, token, {
      sectionId: academy,
      name: 'Żaki',
      kind: 'team',
      league: 'Liga Żaków',
      seasonId: season,
    })
    const classGroup = await createGroup(request, token, {
      sectionId: pool,
      name: 'Basen — początkujący',
      kind: 'class_group',
      description: 'Dzieci 6–9 lat',
    })
    const listed = await listGroups(request, token)
    expect(listed.status).toBe(200)
    const listedTeam = listed.items.find((item) => item.id === team)
    expect(listedTeam).toMatchObject({ kind: 'team', sectionName: 'Akademia piłkarska', seasonName: '2026/2027' })
    expect(listed.items.find((item) => item.id === classGroup)).toMatchObject({
      kind: 'class_group',
      sectionName: 'Basen',
      league: null,
      seasonId: null,
      seasonName: null,
    })
    const teamRecord = await getGroup(request, token, team)
    expect(teamRecord.status).toBe(200)
    expect(teamRecord.body).toMatchObject({ league: 'Liga Żaków', seasonName: '2026/2027', actingRole: 'club_admin' })

    // Team fields on a class group → 422, on create and on update (the stored kind decides).
    const withLeague = await postGroup(request, token, {
      sectionId: pool,
      name: 'Zumba wtorek',
      kind: 'class_group',
      league: 'Liga',
    })
    expect(withLeague.status, JSON.stringify(withLeague.body)).toBe(422)
    expect(withLeague.body?.code).toBe('group_team_fields_on_class_group')
    const withSeason = await postGroup(request, token, {
      sectionId: pool,
      name: 'Zumba środa',
      kind: 'class_group',
      seasonId: season,
    })
    expect(withSeason.status).toBe(422)
    expect(withSeason.body?.code).toBe('group_team_fields_on_class_group')
    const classRecord = await getGroup(request, token, classGroup)
    const leagueOnClass = await updateGroup(
      request,
      token,
      { id: classGroup, league: 'Liga' },
      classRecord.body?.updatedAt,
    )
    expect(leagueOnClass.status).toBe(422)
    expect(leagueOnClass.body?.code).toBe('group_team_fields_on_class_group')
    // Turning the team into a class group keeps its team fields unless they are cleared.
    const kindOnly = await updateGroup(request, token, { id: team, kind: 'class_group' }, teamRecord.body?.updatedAt)
    expect(kindOnly.status).toBe(422)
    expect(kindOnly.body?.code).toBe('group_team_fields_on_class_group')
    expect((await getGroup(request, token, team)).body?.kind).toBe('team')
    // An unknown season is refused, a malformed body is 400.
    const unknownSeason = await postGroup(request, token, {
      sectionId: academy,
      name: 'Orliki',
      kind: 'team',
      seasonId: classGroup,
    })
    expect(unknownSeason.status).toBe(422)
    expect(unknownSeason.body?.code).toBe('groups_reference_invalid')
    expect((await postGroup(request, token, { sectionId: academy, name: 'X', kind: 'band' })).status).toBe(400)

    // The same membership cycle for both kinds.
    const coach = await createPerson(request, token, {
      firstName: 'Marek',
      lastName: 'Trener',
      birthDate: birthDateTurning(40),
    })
    const child = await createPerson(request, token, {
      firstName: 'Jan',
      lastName: 'Kowalski',
      birthDate: birthDateTurning(8),
    })
    for (const groupId of [team, classGroup]) {
      const participant = await addMembership(request, token, {
        groupId,
        personId: child,
        role: 'participant',
        validFrom: '2026-01-01',
      })
      await addMembership(request, token, { groupId, personId: coach, role: 'coach', validFrom: '2026-01-01' })
      let rows = (await roster(request, token, groupId)).items
      expect(rows.map((row) => row.role).sort()).toEqual(['coach', 'participant'])
      // The roster person carries the age in completed years on the club day (E06-S08, #90); Jan turns 8 today.
      expect(rows.find((row) => row.personId === child)?.person).toEqual({
        firstName: 'Jan',
        lastName: 'Kowalski',
        age: 8,
      })

      // Ending a membership sets its last day; the row stays in the roster as history.
      const current = rows.find((row) => row.id === participant)
      const ended = await endMembership(request, token, participant, current?.updatedAt, '2026-06-30')
      expect(ended.status, JSON.stringify(ended.body)).toBe(200)
      expect(ended.body).toMatchObject({ validTo: '2026-06-30', actingRole: 'club_admin' })
      rows = (await roster(request, token, groupId)).items
      expect(rows.find((row) => row.id === participant)).toMatchObject({
        validFrom: '2026-01-01',
        validTo: '2026-06-30',
      })
      expect(
        (await roster(request, token, groupId, `&activeOn=${calendarDate()}`)).items.map((row) => row.role),
      ).toEqual(['coach'])

      // A later membership of the same person and role does not overlap the ended one; the history has both.
      await addMembership(request, token, { groupId, personId: child, role: 'participant', validFrom: '2026-07-01' })
      rows = (await roster(request, token, groupId)).items
      expect(rows.filter((row) => row.personId === child)).toHaveLength(2)
    }

    // A group with memberships (ended ones included) is deactivated, not deleted.
    const refused = await deleteGroup(
      request,
      token,
      classGroup,
      (await getGroup(request, token, classGroup)).body?.updatedAt,
    )
    expect(refused.status).toBe(409)
    expect(refused.body?.code).toBe('group_has_memberships')
    const deactivated = await updateGroup(
      request,
      token,
      { id: classGroup, isActive: false },
      (await getGroup(request, token, classGroup)).body?.updatedAt,
    )
    expect(deactivated.status, JSON.stringify(deactivated.body)).toBe(200)
    expect((await getGroup(request, token, classGroup)).body?.isActive).toBe(false)

    // An unknown person cannot become a member.
    const unknownPerson = await postMembership(request, token, {
      groupId: team,
      personId: classGroup,
      role: 'participant',
      validFrom: '2026-01-01',
    })
    expect(unknownPerson.status).toBe(422)
    expect(unknownPerson.body?.code).toBe('groups_reference_invalid')

    // The season dictionary: a duplicate name → 409, a season used by a group is not deleted.
    const duplicate = await call<{ code?: string }>(request, 'POST', '/api/groups/seasons', token, {
      data: { name: '2026/2027', startsOn: '2027-08-01', endsOn: '2028-06-30' },
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body?.code).toBe('season_name_taken')
    const inverted = await call<{ code?: string }>(request, 'POST', '/api/groups/seasons', token, {
      data: { name: '2028/2029', startsOn: '2028-08-01', endsOn: '2028-07-31' },
    })
    expect(inverted.status).toBe(422)
    expect(inverted.body?.code).toBe('season_dates_inverted')
    const seasons = await call<{ items?: { id: string; updatedAt: string }[] }>(
      request,
      'GET',
      '/api/groups/seasons?pageSize=100',
      token,
    )
    const seasonRow = seasons.body?.items?.find((item) => item.id === season)
    const seasonInUse = await call<{ code?: string }>(request, 'DELETE', `/api/groups/seasons?id=${season}`, token, {
      headers: { 'x-om-ext-optimistic-lock-expected-updated-at': String(seasonRow?.updatedAt) },
    })
    expect(seasonInUse.status).toBe(409)
    expect(seasonInUse.body?.code).toBe('season_in_use')
  } finally {
    await club.cleanup()
  }
})

test('TEST-030 external teams keep their contact encrypted at rest and decrypted in the list', async ({ request }) => {
  const club = await createClub(request, 'test-030-external')
  try {
    const token = club.adminToken
    const created = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', token, {
      data: {
        name: 'KS Orlik U10',
        clubName: 'KS Orlik',
        contact: '+48 600 000 000',
        notes: 'Boisko ze sztuczną trawą',
      },
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const listed = await call<{ items?: { id: string; contact: string | null; updatedAt: string }[] }>(
      request,
      'GET',
      '/api/groups/external-teams?pageSize=100',
      token,
    )
    const row = listed.body?.items?.find((item) => item.id === created.body?.id)
    expect(row?.contact).toBe('+48 600 000 000')
    // Stored encrypted (club spec *Data Models* → `groups_external_teams.contact`).
    const raw = await withClient(async (client) => {
      const { rows } = await client.query<{ contact: string | null }>(
        'select contact from groups_external_teams where id = $1',
        [created.body?.id],
      )
      return rows[0]
    })
    expect(raw.contact).toBeTruthy()
    expect(raw.contact).not.toContain('600 000 000')
    const unknownInstitution = await call<{ code?: string }>(request, 'PUT', '/api/groups/external-teams', token, {
      data: { id: created.body?.id, institutionId: String(created.body?.id) },
      headers: { 'x-om-ext-optimistic-lock-expected-updated-at': String(row?.updatedAt) },
    })
    expect(unknownInstitution.status).toBe(422)
    expect(unknownInstitution.body?.code).toBe('groups_reference_invalid')
    const removed = await call(request, 'DELETE', `/api/groups/external-teams?id=${String(created.body?.id)}`, token, {
      headers: { 'x-om-ext-optimistic-lock-expected-updated-at': String(row?.updatedAt) },
    })
    expect(removed.status).toBe(200)
  } finally {
    await club.cleanup()
  }
})

type SubstitutionDetail = OccurrenceItem & {
  substituteForPersonId: string | null
  substitutions: { kind: string; previousCoachPersonId: string | null; newCoachPersonId: string | null }[]
}

async function sessionDetail(request: APIRequestContext, token: string, id: string): Promise<SubstitutionDetail> {
  const result = await getOccurrence(request, token, id)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body as SubstitutionDetail
}

const lockOf = (updatedAt: string | null | undefined): Record<string, string> =>
  updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: updatedAt } : {}

test('TEST-030 a class group training goes through substitution and attendance exactly like a team training', async ({
  request,
}) => {
  const club = await createClub(request, 'test-030-sessions')
  try {
    // The TEST-008 family: the team Żaki (coach Marek, academy coordinator) and the class group "Basen — początkujący"
    // (instructor Irena, pool coordinator); Hania is in both. Bartek is a club coach in neither group.
    const family = await familyFor(request, club)
    const bartek = await signedInStaff(request, club, { firstName: 'Bartek', lastName: 'Zastępca', role: 'coach' })
    const tomorrow = addDays(calendarDate(), 1)
    const kinds = [
      {
        kind: 'team',
        groupId: family.zaki,
        placeId: family.pitch,
        name: 'Trening Żaków',
        startTime: '15:00',
        endTime: '16:00',
        coach: family.coach,
        coordinator: family.academyCoordinator,
      },
      {
        kind: 'class_group',
        groupId: family.poolGroup,
        placeId: family.poolPlace,
        name: 'Nauka pływania',
        startTime: '17:00',
        endTime: '18:00',
        coach: family.instructor,
        coordinator: family.poolCoordinator,
      },
    ] as const
    const outcomes: Record<string, unknown> = {}

    for (const input of kinds) {
      expect((await getGroup(request, club.adminToken, input.groupId)).body?.kind).toBe(input.kind)
      const [newcomer] = await addParticipants(request, club, input.groupId, 1)
      const { id: activityId } = await createActivity(request, club.adminToken, {
        groupId: input.groupId,
        name: input.name,
        type: 'training',
        placeId: input.placeId,
        coachPersonId: input.coach.personId,
        startsOn: tomorrow,
        startTime: input.startTime,
        endTime: input.endTime,
      })
      const session = (await sessionsOf(request, club, activityId)).at(0)
      if (!session) throw new Error(`[test] the ${input.kind} training has no session`)
      expect(session.coachPersonId).toBe(input.coach.personId)

      // The group's coach reports an absence: the session has no coach, the section coordinator is notified and
      // finds it in "Needing a coach".
      const absence = await call<{ ok?: boolean }>(
        request,
        'POST',
        `/api/activities/occurrences/${session.id}/absence`,
        input.coach.token,
        { data: { reason: 'Choroba' }, headers: lockOf(session.updatedAt) },
      )
      expect(absence.status, `${input.kind} absence ${JSON.stringify(absence.body)}`).toBe(200)
      const afterAbsence = await sessionDetail(request, club.adminToken, session.id)
      expect(afterAbsence.coachPersonId).toBeNull()
      await expect
        .poll(async () =>
          (await readNotifications(request, input.coordinator.token)).some(
            (item) => item.type === 'activities.coach_needed' && item.sourceEntityId === session.id,
          ),
        )
        .toBe(true)
      const needing = await listOccurrences(request, input.coordinator.token, '&unassigned=1')
      expect(needing.items.map((item) => item.id)).toContain(session.id)

      // The coordinator sees Bartek free and assigns him; Bartek is notified and stands in for the group's coach.
      const options = await call<{ items?: { id: string; busy: unknown }[] }>(
        request,
        'GET',
        `/api/activities/occurrences/${session.id}/coach`,
        input.coordinator.token,
      )
      expect(options.status, JSON.stringify(options.body)).toBe(200)
      expect(options.body?.items?.find((item) => item.id === bartek.personId)?.busy).toBeNull()
      const assigned = await call<{ kind?: string }>(
        request,
        'POST',
        `/api/activities/occurrences/${session.id}/coach`,
        input.coordinator.token,
        { data: { coachPersonId: bartek.personId }, headers: lockOf(afterAbsence.updatedAt) },
      )
      expect(assigned.status, `${input.kind} assign ${JSON.stringify(assigned.body)}`).toBe(200)
      await expect
        .poll(async () =>
          (await readNotifications(request, bartek.token)).some(
            (item) => item.type === 'activities.substitution_assigned' && item.sourceEntityId === session.id,
          ),
        )
        .toBe(true)

      // Before the start the check-off is closed; once the session has started Bartek checks off the roster and
      // closes the session.
      const before = await readAttendanceList(request, bartek.token, session.id)
      expect(before.status, JSON.stringify(before.body)).toBe(200)
      const version = await startNow(request, club, session.id)
      const open = await readAttendanceList(request, bartek.token, session.id)
      expect(open.status, JSON.stringify(open.body)).toBe(200)
      const closed = await saveAttendanceList(
        request,
        bartek.token,
        session.id,
        {
          entries: [
            { personId: family.younger.personId, actual: 'present' },
            { personId: newcomer, actual: 'absent' },
          ],
          complete: true,
        },
        version,
      )
      expect(closed.status, `${input.kind} check-off ${JSON.stringify(closed.body)}`).toBe(200)
      const list = await readAttendanceList(request, bartek.token, session.id)
      expect(list.status, JSON.stringify(list.body)).toBe(200)
      const marks = [family.younger.personId, newcomer].map((personId) => {
        const row = rowOf(list.body ?? {}, personId)
        expect(row.markedByPersonId).toBe(bartek.personId)
        return { onRoster: row.onRoster, actual: row.actual, markedAsRole: row.markedAsRole }
      })
      const done = await sessionDetail(request, club.adminToken, session.id)
      expect(done.status).toBe('done')
      expect(done.coachPersonId).toBe(bartek.personId)
      expect(done.substituteForPersonId).toBe(input.coach.personId)

      // The outcome with the group's own ids replaced by their role in the scenario.
      const roleOf = (personId: string | null) =>
        personId === input.coach.personId ? 'group coach' : personId === bartek.personId ? 'substitute' : personId
      outcomes[input.kind] = {
        assignKind: assigned.body?.kind,
        checkOffBefore: before.body?.checkOff,
        checkOffOpen: open.body?.checkOff,
        actingRole: open.body?.actingRole,
        marks,
        status: done.status,
        substitutions: done.substitutions.map((entry) => [
          entry.kind,
          roleOf(entry.previousCoachPersonId),
          roleOf(entry.newCoachPersonId),
        ]),
      }
    }

    expect(outcomes.team).toEqual({
      assignKind: 'substitute_assigned',
      checkOffBefore: 'not_started',
      checkOffOpen: 'open',
      actingRole: 'coach',
      marks: [
        { onRoster: true, actual: 'present', markedAsRole: 'coach' },
        { onRoster: true, actual: 'absent', markedAsRole: 'coach' },
      ],
      status: 'done',
      substitutions: [
        ['absence_reported', 'group coach', null],
        ['substitute_assigned', null, 'substitute'],
      ],
    })
    expect(outcomes.class_group).toEqual(outcomes.team)
  } finally {
    await club.cleanup()
  }
})
