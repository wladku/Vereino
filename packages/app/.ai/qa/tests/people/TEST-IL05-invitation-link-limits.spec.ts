import { expect, test } from '@playwright/test'
import { familyFor } from '../_fixtures/attendance'
import { call, createClub } from '../_fixtures/club'
import { invitedGuardianOf, takeLink } from '../_fixtures/invitation-links'

// Personal invitation link spec phase 1 (#868; REQ-IL05, IL-D02; IL-AC-06): TEST-IL05 — links and e-mail re-sends of
// one account share the re-send limit (3 in 5 minutes): two re-sends and one link pass, the fourth call — a link — is
// 429 with `Retry-After`. The limiter is switched on for these requests only (`x-om-test-rate-limit: on`).
test.describe.configure({ timeout: 300_000 })

test('TEST-IL05 invitation links and e-mail re-sends share the re-send limit', async ({ request }) => {
  const club = await createClub(request, 'test-il05')
  try {
    const family = await familyFor(request, club)
    const guardian = await invitedGuardianOf(request, club, family.younger.personId, {
      firstName: 'Felicja',
      lastName: 'Limit',
    })
    const limited = { 'x-om-test-rate-limit': 'on' }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const resent = await call(
        request,
        'POST',
        `/api/people/persons/${guardian.personId}/account/invitation`,
        club.adminToken,
        { data: {}, headers: limited },
      )
      expect(resent.status, JSON.stringify(resent.body)).toBe(200)
    }
    const third = await takeLink(request, club.adminToken, guardian.personId, limited)
    expect(third.status, JSON.stringify(third.body)).toBe(200)
    const fourth = await takeLink(request, club.adminToken, guardian.personId, limited)
    expect(fourth.status, JSON.stringify(fourth.body)).toBe(429)
    expect(fourth.body?.code).toBe('rate_limited')
    expect(Number(fourth.response.headers()['retry-after'])).toBeGreaterThan(0)
    expect(fourth.response.headers()['cache-control']).toContain('no-store')
  } finally {
    await club.cleanup()
  }
})
