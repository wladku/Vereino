import { expect, test } from '@playwright/test'
import { birthDateTurning, call, createClub, createPerson, createStaff, expectRoles } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import {
  addMembership,
  createGroup,
  getGroup,
  listGroups,
  postMembership,
  roster,
  signedInStaff,
  updateGroup,
} from '../_fixtures/groups'

// Issue #30: the coach scope. A `coach` role assignment grants the `vereino_coach` role (the `groups.view` feature)
// and a `coach`/`assistant` membership gives the group (`coached_group_ids`); both are needed before a coach sees a
// group (#26 clarification). A coach reads the roster of their own group, and the read records the acting role
// `coach` (#26's deferred "an action taken as coach records the role coach"). An adult participant with an account
// becomes their own payer through the role sync (club spec *Account payer*). Two clubs never see each other's groups.
test.describe.configure({ timeout: 300_000 })

test('E03-S01 a coach reads only the groups they coach, as coach; without a membership they see none', async ({
  request,
}) => {
  const club = await createClub(request, 'e03-s01-coach')
  try {
    const adminToken = club.adminToken
    const academy = await createStructure(request, adminToken, 'sections', { name: 'Akademia piłkarska' })
    const pool = await createStructure(request, adminToken, 'sections', { name: 'Basen' })
    const zaki = await createGroup(request, adminToken, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const orliki = await createGroup(request, adminToken, { sectionId: academy, name: 'Orliki', kind: 'team' })
    const swim = await createGroup(request, adminToken, {
      sectionId: pool,
      name: 'Basen — początkujący',
      kind: 'class_group',
    })
    const child = await createPerson(request, adminToken, {
      firstName: 'Jan',
      lastName: 'Kowalski',
      birthDate: birthDateTurning(8),
    })
    await addMembership(request, adminToken, {
      groupId: zaki,
      personId: child,
      role: 'participant',
      validFrom: '2026-01-01',
    })
    await addMembership(request, adminToken, {
      groupId: orliki,
      personId: child,
      role: 'participant',
      validFrom: '2026-01-01',
    })

    // A coach assignment alone: the role is granted, but no group is visible (no coached_group_ids yet).
    const coach = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trener', role: 'coach' })
    expect((await listGroups(request, coach.token)).items).toEqual([])
    expect((await getGroup(request, coach.token, zaki)).status).toBe(403)

    // A coach membership in Żaki and an assistant (instructor) membership in the class group, in another section.
    await addMembership(request, adminToken, {
      groupId: zaki,
      personId: coach.personId,
      role: 'coach',
      validFrom: '2026-01-01',
    })
    await addMembership(request, adminToken, {
      groupId: swim,
      personId: coach.personId,
      role: 'assistant',
      validFrom: '2026-01-01',
    })
    const visible = await listGroups(request, coach.token)
    expect(visible.status).toBe(200)
    expect(new Set(visible.items.map((item) => item.id))).toEqual(new Set([zaki, swim]))

    // Reading the roster of their own group: allowed, with names, and the read is taken as `coach`.
    const record = await getGroup(request, coach.token, zaki)
    expect(record.status, JSON.stringify(record.body)).toBe(200)
    expect(record.body?.actingRole).toBe('coach')
    const zakiRoster = await roster(request, coach.token, zaki)
    expect(zakiRoster.status).toBe(200)
    expect(zakiRoster.items.map((row) => `${row.person?.lastName ?? ''}:${row.role ?? ''}`).sort()).toEqual([
      'Kowalski:participant',
      'Trener:coach',
    ])
    // Another group of the same section: no scope (403 on the record, nothing in the roster list).
    expect((await getGroup(request, coach.token, orliki)).status).toBe(403)
    expect((await roster(request, coach.token, orliki)).items).toEqual([])
    // A coach reads; managing groups and rosters needs `groups.manage` (403 by feature).
    const write = await postMembership(request, coach.token, {
      groupId: zaki,
      personId: child,
      role: 'assistant',
      validFrom: '2026-01-01',
    })
    expect(write.status).toBe(403)
    const rename = await updateGroup(request, coach.token, { id: zaki, name: 'Żaki A' }, record.body?.updatedAt)
    expect(rename.status).toBe(403)
    // The club-wide dictionaries are readable by a coach.
    const seasons = await call(request, 'GET', '/api/groups/seasons?pageSize=100', coach.token)
    expect(seasons.status).toBe(200)
  } finally {
    await club.cleanup()
  }
})

test('E03-S01 an adult participant with an account becomes their own payer through the role sync', async ({
  request,
}) => {
  const club = await createClub(request, 'e03-s01-payer')
  try {
    const adminToken = club.adminToken
    const zumbaSection = await createStructure(request, adminToken, 'sections', { name: 'Zumba' })
    const group = await createGroup(request, adminToken, {
      sectionId: zumbaSection,
      name: 'Zumba wtorek',
      kind: 'class_group',
    })
    const adult = await createStaff(request, club, {
      firstName: 'Ewa',
      lastName: 'Tancerka',
      birthDate: birthDateTurning(30),
    })
    await expectRoles(request, club, adult.userId, ['vereino_member'])
    await addMembership(request, adminToken, {
      groupId: group,
      personId: adult.personId,
      role: 'participant',
      validFrom: '2020-01-01',
    })
    await expectRoles(request, club, adult.userId, ['vereino_member', 'vereino_payer'])
    // A minor participant is never a payer.
    const teen = await createStaff(request, club, {
      firstName: 'Ola',
      lastName: 'Tancerka',
      birthDate: birthDateTurning(17),
    })
    await addMembership(request, adminToken, {
      groupId: group,
      personId: teen.personId,
      role: 'participant',
      validFrom: '2020-01-01',
    })
    await expectRoles(request, club, teen.userId, ['vereino_member'])
  } finally {
    await club.cleanup()
  }
})

test("E03-S01 two tenants never see or change each other's groups, rosters or dictionaries", async ({ request }) => {
  const club = await createClub(request, 'e03-s01-tenant-a')
  const other = await createClub(request, 'e03-s01-tenant-b')
  try {
    const adminToken = club.adminToken
    const academy = await createStructure(request, adminToken, 'sections', { name: 'Akademia piłkarska' })
    const group = await createGroup(request, adminToken, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const child = await createPerson(request, adminToken, {
      firstName: 'Jan',
      lastName: 'Nowak',
      birthDate: birthDateTurning(8),
    })
    await addMembership(request, adminToken, {
      groupId: group,
      personId: child,
      role: 'participant',
      validFrom: '2026-01-01',
    })
    const season = await call<{ id?: string }>(request, 'POST', '/api/groups/seasons', adminToken, {
      data: { name: '2026/2027', startsOn: '2026-08-01', endsOn: '2027-06-30' },
    })
    expect(season.status).toBe(201)

    // The second club is another tenant with its own administrator.
    const otherToken = other.adminToken
    const otherSection = await createStructure(request, otherToken, 'sections', { name: 'Szachy' })

    expect((await listGroups(request, otherToken)).items).toEqual([])
    expect((await getGroup(request, otherToken, group)).status).toBe(404)
    expect((await roster(request, otherToken, group)).items).toEqual([])
    const seasons = await call<{ items?: unknown[] }>(request, 'GET', '/api/groups/seasons?pageSize=100', otherToken)
    expect(seasons.body?.items).toEqual([])

    const record = await getGroup(request, adminToken, group)
    const foreignUpdate = await updateGroup(
      request,
      otherToken,
      { id: group, name: 'Przejęta' },
      record.body?.updatedAt,
    )
    expect(foreignUpdate.status).toBe(404)
    const foreignMember = await postMembership(request, otherToken, {
      groupId: group,
      personId: child,
      role: 'participant',
      validFrom: '2027-01-01',
    })
    expect(foreignMember.status).toBe(404)
    // The other club's own group cannot take a person, section or season of the first club.
    const ownGroup = await createGroup(request, otherToken, {
      sectionId: otherSection,
      name: 'Szachiści',
      kind: 'class_group',
    })
    const foreignPerson = await postMembership(request, otherToken, {
      groupId: ownGroup,
      personId: child,
      role: 'participant',
      validFrom: '2026-01-01',
    })
    expect(foreignPerson.status).toBe(422)
    expect(foreignPerson.body?.code).toBe('groups_reference_invalid')
    const foreignSection = await call<{ code?: string }>(request, 'POST', '/api/groups/groups', otherToken, {
      data: { sectionId: academy, name: 'Żaki B', kind: 'team', seasonId: season.body?.id },
    })
    expect(foreignSection.status).toBe(422)
    expect(foreignSection.body?.code).toBe('groups_reference_invalid')
    // The first club's data is unchanged.
    expect((await getGroup(request, adminToken, group)).body?.name).toBe('Żaki')
    expect((await roster(request, adminToken, group)).items).toHaveLength(1)
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
