import { expect, test } from '@playwright/test'
import { calendarDate, createClub } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addDays, createActivity, deleteActivity, getActivity } from '../_fixtures/activities'
import { createGroup, getGroup, updateGroup, updateKindWithoutGroupUsage } from '../_fixtures/groups'

// TEST-A02 (groups and activities parity spec REQ-A02, AC-A02; issue #266): a team with a live `match` or `sparring`
// activity cannot become a class group — `groups.groups.update` answers 409 `group_has_matches` with `details.total`
// and a field error on `kind`, and nothing changes; a team without one changes; without the optional contract
// `activities.groupUsage` (the token hidden in a probe process) the guard is skipped.
test.describe.configure({ timeout: 300_000 })

test('TEST-A02 a team with matches cannot become a class group (409 group_has_matches with the total); without activities.groupUsage the change passes', async ({
  request,
}) => {
  const club = await createClub(request, 'test-a02-kind-guard')
  try {
    const token = club.adminToken
    const academy = await createStructure(request, token, 'sections', { name: 'Akademia piłkarska' })
    const pitch = await createStructure(request, token, 'places', {
      name: 'Boisko A',
      kind: 'pitch',
      capacityGroups: 1,
    })
    const withMatches = await createGroup(request, token, { sectionId: academy, name: 'Orliki', kind: 'team' })
    const withoutMatches = await createGroup(request, token, { sectionId: academy, name: 'Żaki', kind: 'team' })
    const today = calendarDate()
    const oneOff = (groupId: string, name: string, type: string, days: number) =>
      createActivity(request, token, {
        groupId,
        name,
        type,
        placeId: pitch,
        startsOn: addDays(today, days),
        startTime: '16:00',
        endTime: '17:30',
      })
    await oneOff(withMatches, 'Mecz ligowy', 'match', 7)
    const sparring = await oneOff(withMatches, 'Sparing kontrolny', 'sparring', 8)
    await oneOff(withMatches, 'Trening', 'training', 9)
    await oneOff(withoutMatches, 'Trening Żaków', 'training', 10)

    // A team with a match and a sparring → 409 with the total of both, and the group is unchanged.
    const before = await getGroup(request, token, withMatches)
    const refused = await updateGroup(request, token, { id: withMatches, kind: 'class_group' }, before.body?.updatedAt)
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body).toMatchObject({
      code: 'group_has_matches',
      details: { total: 2 },
      fieldErrors: { kind: expect.any(String) },
    })
    const after = await getGroup(request, token, withMatches)
    expect(after.body).toMatchObject({ kind: 'team', updatedAt: before.body?.updatedAt })

    // A soft-deleted sparring no longer counts.
    const sparringRecord = await getActivity(request, token, sparring.id)
    expect((await deleteActivity(request, token, sparring.id, sparringRecord.body?.updatedAt)).status).toBe(200)
    const stillRefused = await updateGroup(
      request,
      token,
      { id: withMatches, kind: 'class_group' },
      after.body?.updatedAt,
    )
    expect(stillRefused.status).toBe(409)
    expect(stillRefused.body).toMatchObject({ code: 'group_has_matches', details: { total: 1 } })

    // A team with only trainings becomes a class group; back to a team is never guarded.
    const zaki = await getGroup(request, token, withoutMatches)
    const changed = await updateGroup(request, token, { id: withoutMatches, kind: 'class_group' }, zaki.body?.updatedAt)
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect((await getGroup(request, token, withoutMatches)).body?.kind).toBe('class_group')
    const back = await updateGroup(request, token, { id: withoutMatches, kind: 'team' }, changed.body?.updatedAt)
    expect(back.status, JSON.stringify(back.body)).toBe(200)

    // Without `activities.groupUsage` (a deployment without `activities`) the guard is skipped: the team with a match
    // becomes a class group.
    const current = await getGroup(request, token, withMatches)
    const probe = updateKindWithoutGroupUsage(
      { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId },
      { userId: club.adminUserId, groupId: withMatches, kind: 'class_group', lockToken: current.body?.updatedAt },
    )
    expect(probe).toEqual({ hidden: true, ok: true, kind: 'class_group', status: null, code: null })
    expect((await getGroup(request, token, withMatches)).body?.kind).toBe('class_group')
  } finally {
    await club.cleanup()
  }
})
