import { expect, test } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, assignRole, call, createClub, createPerson, getAssignment } from '../_fixtures/club'

// TEST-F05 (foundation spec), integration part: validity periods on role assignments and guardianships — an end
// before the start is refused with 422 `validity_inverted` on create, update and end, and a valid period is kept.
// The consent transitions (`grantConsent` / `withdrawConsent`) are covered by the unit tests of `@vereino/core`;
// phase A1 adds no consent column (the `people_persons` consents arrive with #26).
test.describe.configure({ timeout: 300_000 })

test('TEST-F05 validity: inverted periods are refused with validity_inverted', async ({ request }) => {
  const club = await createClub(request, 'test-f05')
  try {
    const personId = await createPerson(request, club.adminToken, { firstName: 'Wiktor', lastName: 'Okres' })
    const wardId = await createPerson(request, club.adminToken, { firstName: 'Wanda', lastName: 'Okres' })

    const inverted = await call(request, 'POST', '/api/people/role-assignments', club.adminToken, {
      data: { personId, role: 'coach', validFrom: '2026-05-10', validTo: '2026-05-09' },
    })
    expect(inverted.status).toBe(422)
    expect(inverted.body?.code).toBe('validity_inverted')

    const invertedGuardianship = await call(request, 'POST', '/api/people/guardianships', club.adminToken, {
      data: { guardianPersonId: personId, wardPersonId: wardId, validFrom: '2026-05-10', validTo: '2026-01-01' },
    })
    expect(invertedGuardianship.status).toBe(422)
    expect(invertedGuardianship.body?.code).toBe('validity_inverted')

    const selfGuardian = await call(request, 'POST', '/api/people/guardianships', club.adminToken, {
      data: { guardianPersonId: personId, wardPersonId: personId, validFrom: '2026-05-10' },
    })
    expect(selfGuardian.status).toBe(422)
    expect(selfGuardian.body?.code).toBe('guardianship_self')

    const id = await assignRole(request, club.adminToken, { personId, role: 'coach', validFrom: '2026-05-10' })
    const current = await getAssignment(request, club.adminToken, id)
    expect(current.body?.validTo).toBeNull()
    const lock = { [OPTIMISTIC_LOCK_HEADER]: String(current.body?.updatedAt) }

    const invertedUpdate = await call(request, 'PUT', '/api/people/role-assignments', club.adminToken, {
      data: { id, validTo: '2026-05-01' },
      headers: lock,
    })
    expect(invertedUpdate.status).toBe(422)
    expect(invertedUpdate.body?.code).toBe('validity_inverted')

    const invertedEnd = await call(request, 'POST', `/api/people/role-assignments/${id}/end`, club.adminToken, {
      data: { validTo: '2026-05-09' },
      headers: lock,
    })
    expect(invertedEnd.status).toBe(422)
    expect(invertedEnd.body?.code).toBe('validity_inverted')

    // Same-day period is valid (both ends inclusive) and is stored as sent.
    const sameDay = await call(request, 'POST', `/api/people/role-assignments/${id}/end`, club.adminToken, {
      data: { validTo: '2026-05-10' },
      headers: lock,
    })
    expect(sameDay.status, JSON.stringify(sameDay.body)).toBe(200)
    const stored = await getAssignment(request, club.adminToken, id)
    expect(stored.body?.validFrom).toBe('2026-05-10')
    expect(stored.body?.validTo).toBe('2026-05-10')

    // Missing scope for a coordinator, or a section for a coach → 422.
    const noSection = await call(request, 'POST', '/api/people/role-assignments', club.adminToken, {
      data: { personId, role: 'coordinator', validFrom: '2026-05-10' },
    })
    expect(noSection.body?.code).toBe('role_scope_required')
    const coachSection = await call(request, 'POST', '/api/people/role-assignments', club.adminToken, {
      data: { personId, role: 'coach', sectionId: '33333333-3333-4333-8333-333333333333', validFrom: '2026-05-10' },
    })
    expect(coachSection.body?.code).toBe('role_scope_unexpected')
  } finally {
    await club.cleanup()
  }
})
