import { expect, test } from '@playwright/test'
import { setRoleAclFeatures } from '@open-mercato/core/helpers/integration/authFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { actionLogs, birthDateTurning, calendarDate, call, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { actionLogEntries } from '../_fixtures/people'
import {
  addMembership,
  createGroup,
  endMembership,
  getGroup,
  listGroups,
  postGroup,
  postMembership,
  roster,
  signedInStaff,
  updateGroup,
} from '../_fixtures/groups'

// Issue #30 (E03-S01) criteria 2 and 3: an overlapping active membership of the same person and role → 409, also for
// two concurrent writes; a coordinator of the academy creating or editing a group in the swimming-pool section → 403.
// Criterion 1 is TEST-030 (membership part); criterion 4 (the import hook) is deferred to #28 by the product owner.
test.describe.configure({ timeout: 300_000 })

test('E03-S01 an overlapping membership of the same person and role is refused with 409, also under concurrent writes', async ({
  request,
}) => {
  const club = await createClub(request, 'e03-s01-overlap')
  try {
    const token = club.adminToken
    const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
    const group = await createGroup(request, token, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const child = await createPerson(request, token, {
      firstName: 'Jan',
      lastName: 'Nowak',
      birthDate: birthDateTurning(8),
    })

    const first = await addMembership(request, token, {
      groupId: group,
      personId: child,
      role: 'participant',
      validFrom: '2026-01-01',
    })
    const logs = await actionLogs(request, token, first)
    expect(logs.find((entry) => entry.commandId === 'groups.memberships.create')?.context?.actingRole).toBe(
      'club_admin',
    )

    // Same person, group and role, overlapping period → 409; a closed period inside the open one too.
    for (const period of [{ validFrom: '2026-03-01' }, { validFrom: '2025-01-01', validTo: '2026-01-01' }]) {
      const overlap = await postMembership(request, token, {
        groupId: group,
        personId: child,
        role: 'participant',
        ...period,
      })
      expect(overlap.status, JSON.stringify(overlap.body)).toBe(409)
      expect(overlap.body?.code).toBe('membership_overlap')
    }
    // Another role of the same person, or a period before the first one, is allowed.
    await addMembership(request, token, { groupId: group, personId: child, role: 'assistant', validFrom: '2026-03-01' })
    await addMembership(request, token, {
      groupId: group,
      personId: child,
      role: 'participant',
      validFrom: '2025-01-01',
      validTo: '2025-12-31',
    })
    // An inverted period is refused with the foundation's 422.
    const inverted = await postMembership(request, token, {
      groupId: group,
      personId: child,
      role: 'coach',
      validFrom: '2026-02-01',
      validTo: '2026-01-31',
    })
    expect(inverted.status).toBe(422)
    expect(inverted.body?.code).toBe('validity_inverted')

    // Two concurrent writes of the same open-ended membership: exactly one wins, the other gets 409.
    const sibling = await createPerson(request, token, {
      firstName: 'Ola',
      lastName: 'Nowak',
      birthDate: birthDateTurning(9),
    })
    const contenders = await Promise.all(
      [0, 1].map(() =>
        postMembership(request, token, {
          groupId: group,
          personId: sibling,
          role: 'participant',
          validFrom: '2026-02-01',
        }),
      ),
    )
    expect(contenders.map((result) => result.status).sort()).toEqual([201, 409])
    expect(contenders.find((result) => result.status === 409)?.body?.code).toBe('membership_overlap')
    expect((await roster(request, token, group)).items.filter((row) => row.personId === sibling)).toHaveLength(1)

    // Ending the first membership and adding a new one from the next day is allowed; undoing the end would overlap
    // the new one and is refused with the same 409.
    let rows = (await roster(request, token, group)).items
    const firstRow = rows.find((row) => row.id === first)
    // Without the membership's version the end is refused (S5.2).
    const tokenless = await endMembership(request, token, first, null, '2026-08-31')
    expect(tokenless.status, JSON.stringify(tokenless.body)).toBe(400)
    expect(tokenless.body?.code).toBe('lock_token_required')
    const ended = await endMembership(request, token, first, firstRow?.updatedAt, '2026-08-31')
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    const stale = await endMembership(request, token, first, firstRow?.updatedAt, '2026-09-30')
    expect(stale.status).toBe(409)
    await addMembership(request, token, {
      groupId: group,
      personId: child,
      role: 'participant',
      validFrom: '2026-09-01',
    })
    const endLog = (await actionLogEntries(request, token, first)).find(
      (entry) => entry.commandId === 'groups.memberships.end',
    )
    expect(endLog?.undoToken).toBeTruthy()
    const refusedUndo = await undoByToken(request, token, String(endLog?.undoToken))
    expect(refusedUndo.status()).toBe(409)
    expect(((await refusedUndo.json()) as { code?: string }).code).toBe('membership_overlap')
    rows = (await roster(request, token, group)).items
    expect(rows.find((row) => row.id === first)?.validTo).toBe('2026-08-31')
    expect(rows.filter((row) => row.personId === child && row.role === 'participant')).toHaveLength(3)
    // Only today's members, with the person's name.
    const today = (await roster(request, token, group, `&activeOn=${calendarDate()}`)).items
    expect(today.map((row) => `${row.person?.firstName ?? ''}:${row.role ?? ''}`).sort()).toEqual([
      'Jan:assistant',
      'Jan:participant',
      'Ola:participant',
    ])
  } finally {
    await club.cleanup()
  }
})

test('E03-S01 a coordinator manages the groups of their sections only; another section answers 403', async ({
  request,
}) => {
  const club = await createClub(request, 'e03-s01-sections')
  try {
    const adminToken = club.adminToken
    const academy = await createStructure(request, adminToken, 'sections', { name: 'Akademia piłkarska' })
    const pool = await createStructure(request, adminToken, 'sections', { name: 'Basen' })
    const poolGroup = await createGroup(request, adminToken, {
      sectionId: pool,
      name: 'Basen — początkujący',
      kind: 'class_group',
    })
    const child = await createPerson(request, adminToken, {
      firstName: 'Jan',
      lastName: 'Kowal',
      birthDate: birthDateTurning(8),
    })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Marta',
      lastName: 'Akademia',
      role: 'coordinator',
      sectionId: academy,
    })
    const token = coordinator.token

    // Creating a group in the swimming-pool section → 403 (negative case of the issue); in the academy → 201.
    const foreign = await postGroup(request, token, { sectionId: pool, name: 'Zumba wtorek', kind: 'class_group' })
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)
    expect(foreign.body?.code).toBe('scope_denied')
    const own = await createGroup(request, token, { sectionId: academy, name: 'Orliki', kind: 'team' })
    // The action records the role it was taken as (read by the club administrator with the tenant-wide audit view).
    await setRoleAclFeatures(request, club.superToken, {
      roleId: club.tenant.roleId,
      features: ['audit_logs.view_self', 'audit_logs.undo_self', 'audit_logs.view_tenant'],
    })
    const ownLogs = await actionLogs(request, adminToken, own)
    expect(ownLogs.find((entry) => entry.commandId === 'groups.groups.create')?.context?.actingRole).toBe('coordinator')

    // Editing the pool's group, moving their own group into the pool, or adding a member to the pool's group → 403.
    const poolRecord = await getGroup(request, adminToken, poolGroup)
    const edit = await updateGroup(request, token, { id: poolGroup, name: 'Przejęta' }, poolRecord.body?.updatedAt)
    expect(edit.status).toBe(403)
    expect(edit.body?.code).toBe('scope_denied')
    const ownRecord = await getGroup(request, token, own)
    expect(ownRecord.body?.actingRole).toBe('coordinator')
    const move = await updateGroup(request, token, { id: own, sectionId: pool }, ownRecord.body?.updatedAt)
    expect(move.status).toBe(403)
    expect(move.body?.code).toBe('scope_denied')
    const renamed = await updateGroup(request, token, { id: own, league: 'Liga Orlików' }, ownRecord.body?.updatedAt)
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)
    expect(renamed.body?.actingRole).toBe('coordinator')
    const member = await postMembership(request, token, {
      groupId: poolGroup,
      personId: child,
      role: 'participant',
      validFrom: '2026-01-01',
    })
    expect(member.status).toBe(403)
    expect(member.body?.code).toBe('scope_denied')
    expect((await getGroup(request, token, poolGroup)).status).toBe(403)

    // The academy group is theirs: members are added and the roster is read; the pool's roster stays hidden.
    const membership = await addMembership(request, token, {
      groupId: own,
      personId: child,
      role: 'participant',
      validFrom: '2026-01-01',
    })
    expect((await roster(request, token, own)).items.map((row) => row.id)).toEqual([membership])
    await addMembership(request, adminToken, {
      groupId: poolGroup,
      personId: child,
      role: 'participant',
      validFrom: '2026-01-01',
    })
    expect((await roster(request, token, poolGroup)).items).toEqual([])
    const visible = await listGroups(request, token)
    expect(visible.status).toBe(200)
    expect(visible.items.map((item) => item.id)).toEqual([own])
    expect(new Set((await listGroups(request, adminToken)).items.map((item) => item.id))).toEqual(
      new Set([own, poolGroup]),
    )
    // The club-wide dictionaries (seasons, external teams) are read and maintained by every coordinator.
    const season = await call<{ id?: string }>(request, 'POST', '/api/groups/seasons', token, {
      data: { name: '2026/2027', startsOn: '2026-08-01', endsOn: '2027-06-30' },
    })
    expect(season.status, JSON.stringify(season.body)).toBe(201)
    const seasons = await call<{ items?: { id: string }[] }>(
      request,
      'GET',
      '/api/groups/seasons?pageSize=100',
      adminToken,
    )
    expect(seasons.body?.items?.map((item) => item.id)).toEqual([season.body?.id])
  } finally {
    await club.cleanup()
  }
})
