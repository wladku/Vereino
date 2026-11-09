import { expect, test } from '@playwright/test'
import { createEvent, zoneInstant } from '../_fixtures/activities'
import { createClub, userRoles } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { phoneRental, postInternalBooking, postRental, staffCalendar } from '../_fixtures/facilities'
import { requestForm, submitRequest } from '../_fixtures/facility-requests'
import { signedInStaff } from '../_fixtures/groups'
import { makeMaintainer, postMaintenance } from '../_fixtures/maintenance'
import { uniqueAddress } from '../_fixtures/messaging'
import { publicPitch, publicSchedule } from '../_fixtures/public-places'

// Issue #128 (E08-S08), facilities spec REQ-022, D17, DD-20, DD-36, TEST-049: a coordinator assigned to maintain the
// pitch gets the derived role and plans line marking over a day that already holds an internal booking, a group event
// and a rental; the three are marked to be moved. In that window a new internal booking, a staff rental and a guest's
// online request answer 409 `maintenance_scheduled`, a new session 409 `occurrence_place_conflict` with the reason
// `maintenance`; the public month shows the slot "unavailable" without the kind or a name. A coordinator without the
// assignment and a coach cannot plan maintenance (403): the feature is not part of their roles (D24).
test.describe.configure({ timeout: 600_000 })

test('TEST-049 planned maintenance flags what is booked and refuses new entries in its window', async ({ request }) => {
  const club = await createClub(request, 'test-049-maintenance')
  try {
    const admin = club.adminToken
    const clubSlug = `test-049-${club.tenant.organizationId.slice(0, 8)}`
    // The day: internal booking 12:00–13:00, event 17:30–19:00, rental 20:00–21:30 (and a held request 10:00–11:30).
    const setup = await publicPitch(request, club, clubSlug)
    const { day, placeSlug } = setup

    // The coordinator of the academy maintains the pitch: the derived role carries the feature (DD-36).
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Marta',
      lastName: 'Gospodarz',
      role: 'coordinator',
      sectionId: setup.academy,
    })
    const planner = await makeMaintainer(request, club, coordinator, setup.pitch)
    expect(await userRoles(request, club, coordinator.userId)).toContain('vereino_maintenance_planner')

    const planned = await postMaintenance(request, planner.token, {
      placeId: setup.pitch,
      kind: 'line_marking',
      scheduleType: 'one_off',
      startsAt: zoneInstant(day, '11:45'),
      endsAt: zoneInstant(day, '22:00'),
      notes: 'Malowanie linii — Marta',
    })
    expect(planned.status, JSON.stringify(planned.body)).toBe(201)
    expect(planned.body?.flagged).toEqual({ sessions: 1, rentals: 1, bookings: 1 })

    // Staff see the work, who planned it, and the entries marked to be moved.
    const dayQuery = `placeId=${setup.pitch}&from=${encodeURIComponent(zoneInstant(day, '00:00'))}&to=${encodeURIComponent(zoneInstant(day, '23:59'))}`
    const staffView = await staffCalendar(request, admin, dayQuery)
    expect(staffView.status, JSON.stringify(staffView.body)).toBe(200)
    const entries = staffView.body?.entries ?? []
    expect(entries).toContainEqual(
      expect.objectContaining({ id: planned.body?.id, kind: 'maintenance', label: 'line_marking', bookedByName: 'Marta Gospodarz' }),
    )
    for (const kind of ['session', 'rental', 'booking'] as const) {
      expect(entries.filter((entry) => entry.kind === kind).every((entry) => entry.needsReschedule), kind).toBe(true)
    }

    // New entries in the window: 409 `maintenance_scheduled` (the guest's request too, D-024).
    const booking = await postInternalBooking(request, admin, {
      placeId: setup.pitch,
      startsAt: zoneInstant(day, '14:00'),
      endsAt: zoneInstant(day, '15:00'),
      sectionId: setup.academy,
      purpose: 'Trening bramkarzy',
    })
    expect(booking.status, JSON.stringify(booking.body)).toBe(409)
    expect(booking.body?.code).toBe('maintenance_scheduled')
    const rental = await postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, zoneInstant(day, '14:00')))
    expect(rental.status, JSON.stringify(rental.body)).toBe(409)
    expect(rental.body?.code).toBe('maintenance_scheduled')
    const guest = await submitRequest(
      clubSlug,
      placeSlug,
      requestForm(zoneInstant(day, '14:00'), uniqueAddress('guest-049')),
    )
    expect(guest.status, guest.text).toBe(409)
    expect(guest.text).toContain('maintenance_scheduled')
    expect(guest.text).not.toContain('line_marking')
    const session = await createEvent(request, setup.coordinator, {
      groupId: setup.orliki,
      type: 'tournament',
      name: 'Turniej w czasie malowania',
      placeId: setup.pitch,
      startsAt: zoneInstant(day, '14:00'),
      endsAt: zoneInstant(day, '15:00'),
    })
    expect(session.status, JSON.stringify(session.body)).toBe(409)
    expect(session.body?.code).toBe('occurrence_place_conflict')
    const blocks = session.body?.conflicts?.flatMap((conflict) => conflict.blocks) ?? []
    expect(blocks).toContainEqual(expect.objectContaining({ id: planned.body?.id, reason: 'maintenance' }))

    // The public month: "unavailable", never the kind of work or who planned it.
    const month = await publicSchedule(request, clubSlug, placeSlug, setup.month)
    expect(month.status).toBe(200)
    const monthText = JSON.stringify(month.body)
    expect(monthText).toContain('"unavailable"')
    expect(monthText).not.toContain('line_marking')
    expect(monthText).not.toContain('Gospodarz')
    expect(monthText).not.toContain('Malowanie')

    // A coordinator who maintains no place, and a coach: 403 (no `facilities.maintenance.manage`, D24).
    const hall = await createStructure(request, admin, 'places', { name: 'Hala sportowa', kind: 'hall' })
    const other = await signedInStaff(request, club, {
      firstName: 'Kamil',
      lastName: 'Inny',
      role: 'coordinator',
      sectionId: setup.academy,
    })
    const coach = await signedInStaff(request, club, { firstName: 'Tomek', lastName: 'Trener', role: 'coach' })
    for (const token of [other.token, coach.token]) {
      const refused = await postMaintenance(request, token, {
        placeId: hall,
        kind: 'mowing',
        scheduleType: 'one_off',
        startsAt: zoneInstant(day, '08:00'),
        endsAt: zoneInstant(day, '10:00'),
      })
      expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    }
  } finally {
    await club.cleanup()
  }
})
