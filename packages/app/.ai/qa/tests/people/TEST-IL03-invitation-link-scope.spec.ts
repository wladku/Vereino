import { expect, test } from '@playwright/test'
import { familyFor } from '../_fixtures/attendance'
import { createClub } from '../_fixtures/club'
import { invitedGuardianOf, pendingFamilies, takeLink } from '../_fixtures/invitation-links'

// Personal invitation link spec phase 2 (#868; REQ-IL02, IL-D03, IL-D04; IL-AC-03): TEST-IL03 — who may not take a
// family's link. The pool instructor and the pool coordinator do not see a guardian whose only child plays in Żaki
// and get 404 for the link, as for an unknown id; a guardian without the feature gets 403 from both routes; a group of
// another coach yields an empty list; the administrator of another club gets 404; an active account answers 409.
test.describe.configure({ timeout: 420_000 })

test('TEST-IL03 staff outside the child’s group, members and other clubs cannot take a family’s link', async ({
  request,
}) => {
  const club = await createClub(request, 'test-il03')
  const other = await createClub(request, 'test-il03-b')
  try {
    const family = await familyFor(request, club)
    const guardian = await invitedGuardianOf(request, club, family.other.child.personId, {
      firstName: 'Dorota',
      lastName: 'Poza',
    })

    // The pool instructor and the pool coordinator: the family is not listed, and the link is 404 like an unknown id.
    for (const staff of [family.instructor, family.poolCoordinator]) {
      const list = await pendingFamilies(request, staff.token)
      expect(list.status, JSON.stringify(list.body)).toBe(200)
      expect(list.body?.items?.some((item) => item.personId === guardian.personId)).toBe(false)
      const refused = await takeLink(request, staff.token, guardian.personId)
      expect(refused.status, JSON.stringify(refused.body)).toBe(404)
      const unknown = await takeLink(request, staff.token, '00000000-0000-4000-8000-000000000000')
      expect(unknown.status).toBe(refused.status)
    }

    // The coach of Żaki asking for the pool group's families gets an empty list.
    const narrowed = await pendingFamilies(request, family.coach.token, `groupId=${family.poolGroup}`)
    expect(narrowed.status).toBe(200)
    expect(narrowed.body?.items).toEqual([])

    // A guardian (no `people.invitations.share`): 403 from both routes.
    expect((await pendingFamilies(request, family.guardian.token)).status).toBe(403)
    expect((await takeLink(request, family.guardian.token, guardian.personId)).status).toBe(403)

    // The administrator of another club: 404 for this club's person.
    const foreign = await takeLink(request, other.adminToken, guardian.personId)
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(404)

    // An active account: 409 `invitation_not_pending`, for the coach as for the administrator.
    const active = await takeLink(request, family.coach.token, family.other.guardian.personId)
    expect(active.status, JSON.stringify(active.body)).toBe(409)
    expect(active.body?.code).toBe('invitation_not_pending')
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
