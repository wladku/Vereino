import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { birthDateTurning, calendarDate, call, createClub, createPerson } from '../_fixtures/club'
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
  updateGroup,
} from '../_fixtures/groups'

// TEST-030 (club spec phase 2 step 2; issue #30 criterion 1, membership part): a `team` group with a season in the
// academy and a `class_group` in a non-football section; both kinds go through the same membership cycle (add, read
// the roster, end, keep the history, add again); team fields on a class group → 422. Not covered here, by decision of
// the product owner: the PZPN age category (needs the `dictionaries` module) and the `training` activity, attendance,
// substitution and `match` → 422 for a class group (they arrive with `activities`, #31 / #33).
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
      expect(rows.find((row) => row.personId === child)?.person).toEqual({ firstName: 'Jan', lastName: 'Kowalski' })

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
