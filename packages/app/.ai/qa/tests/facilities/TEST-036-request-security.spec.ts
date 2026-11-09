import { expect, test } from '@playwright/test'
import { addDays, zoneInstant } from '../_fixtures/activities'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { postEntryBan } from '../_fixtures/facilities'
import {
  confirmationToken,
  decide,
  expireRequestLink,
  heldRequest,
  queuedRequest,
  requestForm,
  requestIdByToken,
  requestsApi,
  submitRequest,
  verifyRequest,
} from '../_fixtures/facility-requests'
import { publicCall } from '../_fixtures/declaration-links'
import { signedInStaff } from '../_fixtures/groups'
import { uniqueAddress } from '../_fixtures/messaging'
import { publicPitch, publicSchedule, setPlacePublic } from '../_fixtures/public-places'

// Issue #125 (E08-S05), facilities spec REQ-024, TEST-036 (security), V-10, DD-44: the public request routes refuse a
// slot outside the `reservable_paid` zone (422), a form without the rules accepted (422), a filled honeypot (422),
// whole-unit and past-start violations (422), a place that takes no requests (403) and an unknown place (404); the
// confirmation answers 410 for an expired, a used and an unknown token. A requester whose name matches a renter banned
// from the place is not refused — the queue flags it for the administrator — but approving the request for the banned
// institution is 409 `entry_ban_active`. The queue and the decisions need `facilities.rentals.approve` (403 for a
// coach). The public month never carries a requester's data. The 429 per IP and per e-mail and the 503 of the
// fail-closed per-e-mail limiter are not integration-tested: `OM_INTEGRATION_TEST` disables rate limits; the limiter's
// key and `failClosed` are covered by the unit test of `lib/requests.ts` (`requestEmailLimit`).
test.describe.configure({ timeout: 600_000 })

test('TEST-036 public request routes: 422/403/404/410 per the contract, the ban only as a flag, approval needs the feature', async ({
  request,
}) => {
  const club = await createClub(request, 'test-036-request-security')
  try {
    const admin = club.adminToken
    const clubSlug = `test-036-${club.tenant.organizationId.slice(0, 8)}`
    const setup = await publicPitch(request, club, clubSlug)
    const { placeSlug } = setup
    const nextWeek = addDays(setup.day, 7)
    const guest = uniqueAddress('guest-036')

    // Outside the bookable zone (club training Mon–Fri 16:00–19:30): 422 at the start.
    const training = await submitRequest(clubSlug, placeSlug, requestForm(zoneInstant(nextWeek, '17:00'), guest))
    expect(training.status, training.text).toBe(422)
    expect(training.body?.code).toBe('request_zone_invalid')
    // The rules not accepted, five units, a past start, a filled honeypot.
    for (const [overrides, code] of [
      [{ regulationsAccepted: false }, 'request_regulations_required'],
      [{ units: 5 }, 'rental_units_invalid'],
      [{ startsAt: zoneInstant(addDays(calendarDate(), -1), '09:00') }, 'rental_start_past'],
      [{ website: 'https://spam.example' }, 'request_refused'],
    ] as const) {
      const refused = await submitRequest(
        clubSlug,
        placeSlug,
        requestForm(zoneInstant(nextWeek, '09:00'), guest, overrides),
      )
      expect(refused.status, `${code}: ${refused.text}`).toBe(422)
      expect(refused.body?.code).toBe(code)
    }
    // A category the form does not offer (the staff-only winter-lighting rate) and a bad e-mail: 400.
    const lighting = await submitRequest(
      clubSlug,
      placeSlug,
      requestForm(zoneInstant(nextWeek, '09:00'), guest, { renterCategory: 'municipal_club_winter_lighting' }),
    )
    expect(lighting.status, lighting.text).toBe(400)
    // An unknown place: 404 without detail.
    const unknown = await publicCall(
      'POST',
      requestsApi(clubSlug, 'nie-ma'),
      requestForm(zoneInstant(nextWeek, '09:00'), guest),
    )
    expect(unknown.status, unknown.text).toBe(404)
    expect(unknown.body?.code).toBe('public_place_not_found')
    // Requests disabled on the place: 403.
    const off = await setPlacePublic(request, admin, setup.pitch, { acceptsOnlineRequests: false })
    expect(off.status, JSON.stringify(off.body)).toBe(200)
    const disabled = await submitRequest(clubSlug, placeSlug, requestForm(zoneInstant(nextWeek, '09:00'), guest))
    expect(disabled.status, disabled.text).toBe(403)
    expect(disabled.body?.code).toBe('requests_not_accepted')
    const on = await setPlacePublic(request, admin, setup.pitch, { acceptsOnlineRequests: true })
    expect(on.status, JSON.stringify(on.body)).toBe(200)

    // An expired link: 410 `token_link_expired`; an unknown one: 410 too.
    const lateGuest = uniqueAddress('late-036')
    const late = await submitRequest(clubSlug, placeSlug, requestForm(zoneInstant(nextWeek, '09:00'), lateGuest))
    expect(late.status, late.text).toBe(202)
    const lateToken = await confirmationToken(lateGuest)
    await expireRequestLink(await requestIdByToken(lateToken))
    const expired = await verifyRequest(lateToken)
    expect(expired.status, expired.text).toBe(410)
    expect(expired.body?.code).toBe('token_link_expired')
    for (const token of ['x', 'A'.repeat(43)]) {
      const missing = await verifyRequest(token)
      expect(missing.status, token).toBe(410)
    }

    // A requester named as a banned renter: accepted, flagged on the queue, and a used link answers 410.
    const ban = await postEntryBan(request, admin, {
      placeId: setup.pitch,
      subjectType: 'institution',
      subjectId: setup.banned,
      startsOn: calendarDate(),
      reason: 'Zniszczenie bramek',
    })
    expect(ban.status, JSON.stringify(ban.body)).toBe(201)
    const bannedGuest = uniqueAddress('banned-036')
    const flagged = await heldRequest(
      clubSlug,
      placeSlug,
      requestForm(zoneInstant(nextWeek, '11:00'), bannedGuest, { renterDisplayName: 'FC  Zakazani' }),
    )
    const used = await verifyRequest(flagged.token)
    expect(used.status, used.text).toBe(410)
    expect(used.body?.code).toBe('token_link_used')
    const item = await queuedRequest(request, admin, flagged.id)
    expect(item.entryBanMatch).toBe(true)
    const month = await publicSchedule(request, clubSlug, placeSlug, nextWeek.slice(0, 7))
    for (const secret of ['FC  Zakazani', bannedGuest, 'Gabriela Gość', '600 100 200', 'Sparing']) {
      expect(JSON.stringify(month.body), secret).not.toContain(secret)
    }

    // The queue and the decisions need `facilities.rentals.approve`: a coach gets 403.
    const coach = await signedInStaff(request, club, { firstName: 'Wojtek', lastName: 'Trener', role: 'coach' })
    const coachQueue = await call(request, 'GET', '/api/facilities/rentals/requests', coach.token)
    expect(coachQueue.status).toBe(403)
    const coachApproval = await decide(
      request,
      coach.token,
      flagged.id,
      'approve',
      { renterType: 'institution', renterId: setup.neighbours },
      item.updatedAt,
    )
    expect(coachApproval.status).toBe(403)

    // Approving the request for the banned institution: 409 `entry_ban_active`; for another renter it passes.
    const toBanned = await decide(
      request,
      admin,
      flagged.id,
      'approve',
      { renterType: 'institution', renterId: setup.banned },
      item.updatedAt,
    )
    expect(toBanned.status, JSON.stringify(toBanned.body)).toBe(409)
    expect(toBanned.body?.code).toBe('entry_ban_active')
    const toNeighbours = await decide(
      request,
      admin,
      flagged.id,
      'approve',
      { renterType: 'institution', renterId: setup.neighbours },
      item.updatedAt,
    )
    expect(toNeighbours.status, JSON.stringify(toNeighbours.body)).toBe(200)
  } finally {
    await club.cleanup()
  }
})
