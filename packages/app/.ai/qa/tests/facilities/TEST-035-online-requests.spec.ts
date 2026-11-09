import { expect, test } from '@playwright/test'
import { addDays, zoneInstant } from '../_fixtures/activities'
import { call, createClub } from '../_fixtures/club'
import { awaitEmails } from '../_fixtures/communication'
import { postInternalBooking } from '../_fixtures/facilities'
import {
  confirmationToken,
  decide,
  heldRequest,
  queueFilesContain,
  queuedRequest,
  requestAuditRows,
  requestDeliveries,
  requestForm,
  requestIdByToken,
  requestRow,
  runExpireRequests,
  submitRequest,
  verifyRequest,
} from '../_fixtures/facility-requests'
import { uniqueAddress } from '../_fixtures/messaging'
import { publicPitch, publicSchedule } from '../_fixtures/public-places'

// Issue #125 (E08-S05), facilities spec REQ-024, R06, J-007, TEST-035, DD-44, DD-46: a guest requests a bookable slot
// of a public pitch without a session and gets a confirmation link by e-mail; the link moves the request to
// `pending_approval` and the public month shows the slot as "requested"; a second request for the slot is 409; the
// administrator approves it creating an institution — the rental is `requested` with the amount and the requester
// gets the amount and the account — and a second approval is 409. Separately: a rejection with a reason, the 48-hour
// expiry and the 1-hour purge driven through the CLI with `--now`, and the supersession by a club booking, each with
// its e-mail. The raw token is in no response, no action-log payload and no queue file; the database keeps its hash
// only, the contact columns are encrypted and the delivery secret is wiped once the e-mail is sent. The charge needs
// `payments`' charge service, which no module registers yet (DD-19), so no charge is asserted.
test.describe.configure({ timeout: 600_000 })

const DAY_MS = 86_400_000

test('TEST-035 online request: link, hold, 409 for a second request, approval with a new institution; rejection, expiry, purge, supersession', async ({
  request,
}) => {
  const club = await createClub(request, 'test-035-requests')
  try {
    const admin = club.adminToken
    const clubSlug = `test-035-${club.tenant.organizationId.slice(0, 8)}`
    const setup = await publicPitch(request, club, clubSlug)
    const { placeSlug, day } = setup
    const nextWeek = addDays(day, 7)

    // --- The request and its link (P-04 → P-05) ---
    const guest = uniqueAddress('guest-035')
    const startsAt = zoneInstant(day, '14:00')
    const submitted = await submitRequest(clubSlug, placeSlug, requestForm(startsAt, guest))
    expect(submitted.status, submitted.text).toBe(202)
    expect(submitted.body).toEqual({ status: 'pending_verification' })

    // A request that is not confirmed holds nothing: the month still offers the slot.
    const before = await publicSchedule(request, clubSlug, placeSlug, setup.month)
    expect(JSON.stringify(before.body)).not.toContain('Akademia Gości')

    const token = await confirmationToken(guest)
    expect(submitted.text).not.toContain(token)
    const id = await requestIdByToken(token)
    const stored = await requestRow(id)
    expect(stored?.status).toBe('pending_verification')
    // Only the hash is stored; the contact columns are ciphertext.
    expect(stored?.verification_token_hash).toBeTruthy()
    expect(stored?.verification_token_hash).not.toContain(token)
    expect(stored?.contact_email).not.toBe(guest)
    expect(stored?.contact_name).not.toBe('Gabriela Gość')

    const verified = await verifyRequest(token)
    expect(verified.status, verified.text).toBe(200)
    expect(verified.body).toMatchObject({ status: 'pending_approval', units: 1, amount: 25_000 })
    const holdEnd = new Date(String(verified.body?.holdExpiresAt)).getTime()
    expect(Math.abs(holdEnd - (Date.now() + 2 * DAY_MS))).toBeLessThan(10 * 60_000)
    expect((await requestRow(id))?.status).toBe('pending_approval')

    // The link works once.
    const again = await verifyRequest(token)
    expect(again.status, again.text).toBe(410)
    expect(again.body?.code).toBe('token_link_used')

    // The public month shows the slot as requested, without the requester.
    const month = await publicSchedule(request, clubSlug, placeSlug, setup.month)
    const wednesday = (month.body?.days as Array<{ date: string; slots: Array<{ from: string; state: string }> }>).find(
      (entry) => entry.date === day,
    )
    expect(wednesday?.slots.find((slot) => slot.from === '14:00')?.state).toBe('requested')
    expect(JSON.stringify(month.body)).not.toContain('Akademia Gości')
    expect(JSON.stringify(month.body)).not.toContain(guest)

    // A second request for the slot: 409 `slot_unavailable` (negative case).
    const second = await submitRequest(clubSlug, placeSlug, requestForm(startsAt, uniqueAddress('second-035')))
    expect(second.status, second.text).toBe(409)
    expect(second.body?.code).toBe('slot_unavailable')

    // DD-44: the token is in no action-log payload (submit and verify keep none) and in no queue file.
    const audit = await requestAuditRows(id)
    expect(
      audit.every((row) => !row.has_payload),
      JSON.stringify(audit),
    ).toBe(true)
    expect(queueFilesContain(token)).toBe(false)
    // The confirmation e-mail was sent and its secret wiped.
    await expect
      .poll(async () =>
        (await requestDeliveries(id)).find((row) => row.template_id === 'facilities.request_verification'),
      )
      .toMatchObject({ status: 'sent', has_secret: false })

    // --- B-25: the administrator approves, creating the institution ---
    const queued = await queuedRequest(request, admin, id)
    expect(queued).toMatchObject({
      renterDisplayName: 'Akademia Gości',
      contactEmail: guest,
      contactName: 'Gabriela Gość',
      renterCategory: 'external_commercial',
      amount: 25_000,
      entryBanMatch: false,
    })
    const noRenter = await decide(request, admin, id, 'approve', {}, queued.updatedAt)
    expect(noRenter.status, JSON.stringify(noRenter.body)).toBe(422)
    expect(noRenter.body?.code).toBe('request_renter_required')
    const noNote = await decide(
      request,
      admin,
      id,
      'approve',
      { createInstitution: { name: 'Akademia Gości', type: 'club' }, amountOverride: 20_000 },
      queued.updatedAt,
    )
    expect(noNote.status, JSON.stringify(noNote.body)).toBe(422)
    expect(noNote.body?.code).toBe('rental_amount_note_required')
    const approved = await decide(
      request,
      admin,
      id,
      'approve',
      { createInstitution: { name: 'Akademia Gości', type: 'club' } },
      queued.updatedAt,
    )
    expect(approved.status, JSON.stringify(approved.body)).toBe(200)
    expect(approved.body?.status).toBe('requested')
    const rental = await requestRow(id)
    expect(rental).toMatchObject({ status: 'requested', amount: 25_000 })
    expect(rental?.renter_id).toBeTruthy()
    const institutions = await call<{ items?: Array<{ id: string; name: string }> }>(
      request,
      'GET',
      '/api/club_core/institutions?pageSize=100',
      admin,
    )
    expect(institutions.body?.items?.find((item) => item.id === rental?.renter_id)?.name).toBe('Akademia Gości')
    const approvedMail = (await awaitEmails(guest, 'Booking approved'))[0]
    expect(approvedMail.text).toMatch(/250[.,]00/)

    // A decided request: approving again is 409.
    const twice = await decide(
      request,
      admin,
      id,
      'approve',
      { createInstitution: { name: 'Akademia Gości 2', type: 'club' } },
      String(approved.body?.updatedAt),
    )
    expect(twice.status, JSON.stringify(twice.body)).toBe(409)
    expect(twice.body?.code).toBe('invalid_transition')
    // The approved rental is booked in the public month.
    const booked = await publicSchedule(request, clubSlug, placeSlug, setup.month)
    const bookedDay = (
      booked.body?.days as Array<{ date: string; slots: Array<{ from: string; state: string }> }>
    ).find((entry) => entry.date === day)
    expect(bookedDay?.slots.find((slot) => slot.from === '14:00')?.state).toBe('booked')

    // --- Rejection with a reason ---
    const rejectedGuest = uniqueAddress('rejected-035')
    const toReject = await heldRequest(clubSlug, placeSlug, requestForm(zoneInstant(day, '08:00'), rejectedGuest))
    const rejectItem = await queuedRequest(request, admin, toReject.id)
    const tooShort = await decide(request, admin, toReject.id, 'reject', { reason: 'no' }, rejectItem.updatedAt)
    expect(tooShort.status, JSON.stringify(tooShort.body)).toBe(400)
    const rejected = await decide(
      request,
      admin,
      toReject.id,
      'reject',
      { reason: 'Boisko zarezerwowane na turniej gminny' },
      rejectItem.updatedAt,
    )
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200)
    expect((await requestRow(toReject.id))?.status).toBe('rejected')
    const declined = (await awaitEmails(rejectedGuest, 'Booking request declined'))[0]
    expect(declined.text).toContain('Boisko zarezerwowane na turniej gminny')

    // --- Expiry after 48 hours and the purge after 1 hour (CLI with `--now`) ---
    const lateGuest = uniqueAddress('expiry-035')
    const toExpire = await heldRequest(clubSlug, placeSlug, requestForm(zoneInstant(nextWeek, '08:00'), lateGuest))
    const unconfirmedGuest = uniqueAddress('purge-035')
    const unconfirmed = await submitRequest(
      clubSlug,
      placeSlug,
      requestForm(zoneInstant(nextWeek, '11:00'), unconfirmedGuest),
    )
    expect(unconfirmed.status, unconfirmed.text).toBe(202)
    const unconfirmedId = await requestIdByToken(await confirmationToken(unconfirmedGuest))

    const early = runExpireRequests(club, new Date(Date.now() + 30 * 60_000).toISOString())
    expect(early.expiredIds).not.toContain(toExpire.id)
    expect(await requestRow(unconfirmedId)).not.toBeNull()
    const later = runExpireRequests(club, new Date(Date.now() + 49 * 3_600_000).toISOString())
    expect(later.expiredIds).toContain(toExpire.id)
    expect(later.purged).toBeGreaterThanOrEqual(1)
    expect((await requestRow(toExpire.id))?.status).toBe('expired')
    expect(await requestRow(unconfirmedId)).toBeNull()
    await awaitEmails(lateGuest, 'Booking request expired')
    // A repeated run changes nothing twice.
    expect(runExpireRequests(club, new Date(Date.now() + 49 * 3_600_000).toISOString()).expiredIds).not.toContain(
      toExpire.id,
    )

    // --- Supersession by a club booking ---
    const supersededGuest = uniqueAddress('superseded-035')
    const toSupersede = await heldRequest(
      clubSlug,
      placeSlug,
      requestForm(zoneInstant(nextWeek, '13:00'), supersededGuest),
    )
    const booking = await postInternalBooking(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(nextWeek, '13:00'),
      endsAt: zoneInstant(nextWeek, '14:00'),
      sectionId: setup.academy,
      purpose: 'Zebranie trenerów',
    })
    expect(booking.status, JSON.stringify(booking.body)).toBe(201)
    expect(booking.body?.supersededRequestIds).toContain(toSupersede.id)
    expect((await requestRow(toSupersede.id))?.status).toBe('superseded')
    await awaitEmails(supersededGuest, 'Booking request cancelled')
  } finally {
    await club.cleanup()
  }
})
