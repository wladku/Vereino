import { expect, test } from '@playwright/test'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { addDays, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'
import {
  confirmRental,
  getRental,
  phoneRental,
  postEntryBan,
  postRental,
  putRental,
  readRental,
  rentalPitch,
  runRentalLifecycle,
} from '../_fixtures/facilities'
import { actionLogEntries } from '../_fixtures/people'

// Issue #279 (E11-S05), facilities parity spec REQ-R05, DD-R08, TEST-R06: `PUT /api/facilities/rentals`
// (`facilities.rentals.update`) corrects the contact, the purpose and the notes of a rental and assigns a registered
// institution to an unregistered renter — the name becomes the institution's — with an audit entry, and its undo
// restores every field. Assigning a banned institution answers 409 `entry_ban_active`; renter fields on a registered
// renter 422 `rental_renter_invalid`; a stale lock token 409; a `done` rental keeps its contact (409 `rental_closed`)
// but still takes notes. `GET ?id=` reads the rental with its payee and the live state of its charge.
test.describe.configure({ timeout: 300_000 })

test('TEST-R06 rental correction: contact, purpose, notes, renter record, ban, closed rental, stale version, undo', async ({
  request,
}) => {
  const club = await createClub(request, 'test-r06-correction')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const ban = await postEntryBan(request, admin, {
      placeId: setup.pitch,
      subjectType: 'institution',
      subjectId: setup.banned,
      startsOn: calendarDate(),
      reason: 'Zniszczenie bramki',
    })
    expect(ban.status, JSON.stringify(ban.body)).toBe(201)
    const tuesday = nextWeekday(addDays(calendarDate(), 7), 'TU')

    // Given a `requested` rental of an unregistered renter.
    const created = await postRental(request, admin, {
      placeId: setup.pitch,
      renterType: 'unregistered',
      renterDisplayName: 'Drużyna Firmowa',
      renterCategory: 'external_commercial',
      startsAt: zoneInstant(tuesday, '11:00'),
      units: 1,
      contactName: 'Jan Kontakt',
      contactPhone: '600 000 001',
      requestedVia: 'phone',
      regulationsAccepted: true,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    const id = String(created.body?.id)
    const original = await getRental(request, admin, id)

    // A banned institution: 409 `entry_ban_active` at the renter field; nothing changes.
    const banned = await putRental(request, admin, id, { renterType: 'institution', renterId: setup.banned })
    expect(banned.status, JSON.stringify(banned.body)).toBe(409)
    expect(banned.body?.code).toBe('entry_ban_active')
    expect(banned.body?.fieldErrors?.renterId).toBeTruthy()
    expect(await readRental(request, admin, id)).toMatchObject({
      renterType: 'unregistered',
      renterDisplayName: 'Drużyna Firmowa',
    })

    // The contact, the purpose and the notes corrected and an institution assigned: saved, the name is the record's.
    const saved = await putRental(request, admin, id, {
      contactName: 'Anna Nowa',
      contactPhone: '600 111 222',
      contactEmail: 'anna.nowa@example.test',
      purpose: 'Mecz towarzyski',
      notes: 'Klucz w portierni',
      renterType: 'institution',
      renterId: setup.neighbours,
    })
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const corrected = await readRental(request, admin, id)
    expect(corrected).toMatchObject({
      renterType: 'institution',
      renterId: setup.neighbours,
      renterDisplayName: 'KS Sąsiedzi',
      contactName: 'Anna Nowa',
      contactPhone: '600 111 222',
      contactEmail: 'anna.nowa@example.test',
      purpose: 'Mecz towarzyski',
      notes: 'Klucz w portierni',
      // Money and the slot are untouched; no owner on the pitch → the club's account; the charge `payments` created
      // at entry (DD-19, #291) is read live and still open.
      amount: original.amount,
      chargeId: original.chargeId,
      startsAt: original.startsAt,
      status: 'requested',
      payee: null,
      chargeState: 'open',
    })
    const entry = (await actionLogEntries(request, admin, id)).find(
      (item) => item.commandId === 'facilities.rentals.update',
    )
    expect(entry?.undoToken, 'the correction is in the audit log and undoable').toBeTruthy()

    // A stale lock token: 409, the record stays as saved.
    const stale = await putRental(request, admin, id, { notes: 'Stara wersja' }, original.updatedAt)
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    expect((await readRental(request, admin, id))?.notes).toBe('Klucz w portierni')

    // Renter fields on a rental whose renter is already a record: 422 `rental_renter_invalid`.
    const again = await putRental(request, admin, id, { renterType: 'institution', renterId: setup.banned })
    expect(again.status, JSON.stringify(again.body)).toBe(422)
    expect(again.body?.code).toBe('rental_renter_invalid')

    // Undo restores the contact, the purpose, the notes, the renter type and the typed name.
    const undone = await undoByToken(request, admin, String(entry?.undoToken))
    expect(undone.ok(), `undo ${String(undone.status())} ${await undone.text()}`).toBe(true)
    expect(await readRental(request, admin, id)).toMatchObject({
      renterType: 'unregistered',
      renterId: null,
      renterDisplayName: 'Drużyna Firmowa',
      contactName: 'Jan Kontakt',
      contactPhone: '600 000 001',
      contactEmail: null,
      purpose: null,
      notes: null,
    })

    // Given a `done` rental: its contact is closed (409 `rental_closed`), its notes are still accepted.
    const doneRental = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(tuesday, '08:00')),
    )
    expect(doneRental.status, JSON.stringify(doneRental.body)).toBe(201)
    const doneId = String(doneRental.body?.id)
    await confirmRental(request, admin, doneId)
    expect(runRentalLifecycle(club, zoneInstant(tuesday, '09:31')).changedIds).toEqual([doneId])
    const closed = await putRental(request, admin, doneId, { contactName: 'Ktoś Inny' })
    expect(closed.status, JSON.stringify(closed.body)).toBe(409)
    expect(closed.body?.code).toBe('rental_closed')
    const notes = await putRental(request, admin, doneId, { notes: 'Bramka uszkodzona po meczu' })
    expect(notes.status, JSON.stringify(notes.body)).toBe(200)
    expect(await readRental(request, admin, doneId)).toMatchObject({
      status: 'done',
      contactName: 'Jan Kontakt',
      notes: 'Bramka uszkodzona po meczu',
    })

    // `?id=` reads one rental only.
    const listed = await readRental(request, admin, doneId)
    expect(listed?.id).toBe(doneId)
  } finally {
    await club.cleanup()
  }
})
