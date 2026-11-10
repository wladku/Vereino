import { expect, test } from '@playwright/test'
import { setRoleAclFeatures } from '@open-mercato/core/helpers/integration/authFixtures'
import { redoByLogId, undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import {
  addDays,
  createActivity,
  createEvent,
  getActivity,
  juneThirtiethNextYear,
  nextWeekday,
  updateActivity,
  zoneInstant,
} from '../_fixtures/activities'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub } from '../_fixtures/club'
import {
  getRental,
  listClosures,
  phoneRental,
  postClosure,
  postRental,
  putClosure,
  rentalPitch,
} from '../_fixtures/facilities'
import { actionLogEntries } from '../_fixtures/people'

// Issue #122 (E08-S02), facilities spec REQ-013, DD-20, DD-43, TEST-027 and TEST-058 (b): a rental occupies its slot
// for sessions through `vereino.occupancyProvider` — a session saved onto a rented slot answers 409
// `occurrence_place_conflict` with the reason `rental`; a closure over a rental flags it to be moved and counts it; a
// rental and a session saved at the same time on the same slot never both succeed (the shared occupancy lock).
// Issue #221: an undo or redo that puts a closure back over a rental entered in the meantime flags that rental too.
test.describe.configure({ timeout: 300_000 })

test('TEST-027 a rented slot refuses a session; a closure flags the rental', async ({ request }) => {
  const club = await createClub(request, 'test-027-rentals')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const thursday = nextWeekday(addDays(calendarDate(), 7), 'TH')
    const rental = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(thursday, '19:30')),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)

    const session = await createEvent(request, setup.coordinator, {
      groupId: setup.orliki,
      type: 'tournament',
      name: 'Turniej Orlików',
      placeId: setup.pitch,
      startsAt: zoneInstant(thursday, '20:00'),
      endsAt: zoneInstant(thursday, '21:00'),
    })
    expect(session.status, JSON.stringify(session.body)).toBe(409)
    expect(session.body?.code).toBe('occurrence_place_conflict')
    const blocks = session.body?.conflicts?.flatMap((conflict) => conflict.blocks) ?? []
    expect(blocks).toContainEqual(expect.objectContaining({ id: rental.body?.id, reason: 'rental' }))

    // A closure over the rental marks it to be moved and counts it.
    const closure = await postClosure(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(thursday, '18:00'),
      endsAt: zoneInstant(thursday, '22:00'),
      reason: 'municipal_event',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    expect(closure.body?.flagged).toEqual({ sessions: 0, rentals: 1, bookings: 0 })
    expect((await getRental(request, admin, String(rental.body?.id))).needsReschedule).toBe(true)
  } finally {
    await club.cleanup()
  }
})

test('TEST-058 (b) a rental and a session saved at once on one slot: exactly one succeeds', async ({ request }) => {
  const club = await createClub(request, 'test-058-sessions')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const monday = nextWeekday(addDays(calendarDate(), 7), 'MO')
    for (const [round, time] of ['08:00', '09:30', '11:00', '12:30', '14:00'].entries()) {
      const startsAt = zoneInstant(monday, time)
      const [rental, session] = await Promise.all([
        postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, startsAt)),
        createEvent(request, setup.coordinator, {
          groupId: setup.orliki,
          type: 'tournament',
          name: `Turniej ${String(round)}`,
          placeId: setup.pitch,
          startsAt,
          endsAt: new Date(Date.parse(startsAt) + 60 * 60_000).toISOString(),
        }),
      ])
      const won = [rental.status, session.status].filter((status) => status === 201)
      expect(won, `round ${String(round)}: ${JSON.stringify([rental.body, session.body])}`).toHaveLength(1)
      if (rental.status === 201) expect(session.body?.code).toBe('occurrence_place_conflict')
      else expect(rental.body?.code).toBe('rental_conflict')
    }
  } finally {
    await club.cleanup()
  }
})

test('TEST-027 a series edit that keeps a flagged session in place is not refused by the closure over it', async ({
  request,
}) => {
  const club = await createClub(request, 'test-027-series')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const today = calendarDate()
    const { id: activityId } = await createActivity(request, setup.coordinator, {
      groupId: setup.orliki,
      name: 'Trening Orlików',
      type: 'training',
      placeId: setup.pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${juneThirtiethNextYear(today).until}`,
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    })
    const tuesday = nextWeekday(addDays(today, 7), 'TU')
    const closure = await postClosure(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(tuesday, '16:00'),
      endsAt: zoneInstant(tuesday, '20:00'),
      reason: 'municipal_event',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    expect(closure.body?.flagged?.sessions).toBe(1)

    // A rename keeps every session where it is: the flagged session stays for the coordinator to resolve.
    const before = await getActivity(request, setup.coordinator, activityId)
    const renamed = await updateActivity(
      request,
      setup.coordinator,
      { id: activityId, name: 'Trening Orlików U10' },
      before.body?.updatedAt,
    )
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)

    // Moving the times moves that session too, into the closure: refused with the reason `closure`.
    const after = await getActivity(request, setup.coordinator, activityId)
    const moved = await updateActivity(
      request,
      setup.coordinator,
      { id: activityId, startTime: '17:30', endTime: '19:00' },
      after.body?.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(409)
    expect(moved.body?.code).toBe('occurrence_place_conflict')
    const blocks = moved.body?.conflicts?.flatMap((conflict) => conflict.blocks) ?? []
    expect(blocks).toContainEqual(expect.objectContaining({ id: closure.body?.id, reason: 'closure' }))
  } finally {
    await club.cleanup()
  }
})

test('TEST-027 an undo or redo that puts a closure back flags the rental entered on the freed slot', async ({
  request,
}) => {
  const club = await createClub(request, 'test-027-closure-undo')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const week = addDays(calendarDate(), 7)
    const closureLog = async (id: string, commandId: string) => {
      const entry = (await actionLogEntries(request, admin, id)).find((item) => item.commandId === commandId)
      expect(entry?.undoToken, `undo token of ${commandId}`).toBeTruthy()
      return { logId: String(entry?.id), undoToken: String(entry?.undoToken) }
    }
    const closureOn = async (day: string) => {
      const closure = await postClosure(request, admin, {
        placeId: setup.pitch,
        startsAt: zoneInstant(day, '18:00'),
        endsAt: zoneInstant(day, '22:00'),
        reason: 'municipal_event',
      })
      expect(closure.status, JSON.stringify(closure.body)).toBe(201)
      return String(closure.body?.id)
    }
    const rentalOn = async (day: string) => {
      const rental = await postRental(
        request,
        admin,
        phoneRental(setup.pitch, setup.neighbours, zoneInstant(day, '19:30')),
      )
      expect(rental.status, JSON.stringify(rental.body)).toBe(201)
      return String(rental.body?.id)
    }
    const updatedAtOf = async (id: string) =>
      (await listClosures(request, admin, `&placeId=${setup.pitch}`)).find((item) => item.id === id)?.updatedAt

    // Undo of a delete: the admin deletes the closure, staff rent the freed slot, the admin undoes the delete.
    const thursday = nextWeekday(week, 'TH')
    const deleted = await closureOn(thursday)
    const removed = await call(request, 'DELETE', `/api/facilities/closures?id=${deleted}`, admin, {
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(await updatedAtOf(deleted)) },
    })
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    const onThursday = await rentalOn(thursday)
    const undoDelete = await undoByToken(
      request,
      admin,
      (await closureLog(deleted, 'facilities.closures.delete')).undoToken,
    )
    expect(undoDelete.status(), await undoDelete.text()).toBe(200)
    await expect.poll(async () => (await getRental(request, admin, onThursday)).needsReschedule).toBe(true)

    // Undo of an update: the closure moves away, staff rent its old slot, the admin undoes the move.
    const friday = nextWeekday(week, 'FR')
    const moved = await closureOn(friday)
    const saturday = nextWeekday(week, 'SA')
    const put = await putClosure(
      request,
      admin,
      { id: moved, startsAt: zoneInstant(saturday, '18:00'), endsAt: zoneInstant(saturday, '20:00') },
      await updatedAtOf(moved),
    )
    expect(put.status, JSON.stringify(put.body)).toBe(200)
    const onFriday = await rentalOn(friday)
    const undoMove = await undoByToken(
      request,
      admin,
      (await closureLog(moved, 'facilities.closures.update')).undoToken,
    )
    expect(undoMove.status(), await undoMove.text()).toBe(200)
    await expect.poll(async () => (await getRental(request, admin, onFriday)).needsReschedule).toBe(true)

    // Redo of a create: the admin undoes the closure, staff rent the slot, the admin redoes the closure.
    // No Vereino role grants redo today, so the test gives the administrator's platform role the feature (TEST-F01).
    await setRoleAclFeatures(request, club.superToken, {
      roleId: club.tenant.roleId,
      features: ['audit_logs.view_self', 'audit_logs.undo_self', 'audit_logs.redo_self'],
    })
    const monday = nextWeekday(addDays(week, 7), 'MO')
    const redone = await closureOn(monday)
    const createLog = await closureLog(redone, 'facilities.closures.create')
    const undoCreate = await undoByToken(request, admin, createLog.undoToken)
    expect(undoCreate.status(), await undoCreate.text()).toBe(200)
    const onMonday = await rentalOn(monday)
    const redo = await redoByLogId(request, admin, createLog.logId)
    expect(redo.status(), await redo.text()).toBe(200)
    await expect.poll(async () => (await getRental(request, admin, onMonday)).needsReschedule).toBe(true)
  } finally {
    await club.cleanup()
  }
})
