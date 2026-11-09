// Public facility calendar fixtures (#124, facilities spec P-03, P-04, TEST-024, TEST-028): a published club whose
// pitch has a public calendar and, on one day two weeks ahead, one entry of every kind the public sees as a state —
// a club group event, an internal booking, a rental by phone, a held external request and a closure — each carrying
// names that must never reach a guest.
import { expect, type APIRequestContext } from '@playwright/test'
import { addDays, createEvent, nextWeekday, zoneInstant } from './activities'
import { calendarDate, type Club } from './club'
import { create, getOne, update } from './club-structure'
import {
  phoneRental,
  postClosure,
  postInternalBooking,
  postRental,
  rentalPitch,
  runRequestProbe,
  type RentalSetup,
} from './facilities'
import { publish, publicGet } from './publication'

/** The names of the day's entries: none may appear in a public response or page. */
export const PRIVATE_NAMES = {
  event: 'Turniej Żaków Nowakowskich',
  renter: 'KS Sąsiedzi',
  contact: 'Jan Kontakt',
  closureNote: 'Odśnieżanie zamawia Jan Kowalski',
  bookingPurpose: 'Narada zarządu u Zenona Prezesa',
  // The held request the QA probe stores (`facilities-request-probe/probe.mjs`) and the section coordinator.
  requestRenter: 'Organizator z zewnątrz',
  requestContact: 'Anna Wnioskująca',
  requestEmail: 'wniosek@example.test',
  coordinator: 'Krystyna Koordynator',
} as const

export type PublicPitch = RentalSetup & {
  clubSlug: string
  placeSlug: string
  /**
   * A Wednesday at least 8 days ahead whose Thursday is in the same month: held request 10:00–11:30, internal booking
   * 12:00–13:00, event 17:30–19:00, rental 20:00–21:30.
   */
  day: string
  /** The Thursday after `day`: closed 08:00–12:00. */
  closedDay: string
  /** `YYYY-MM` of `day`. */
  month: string
}

/** Sets a place's public calendar fields through the place form's API (200 expected). */
export async function setPlacePublic(
  request: APIRequestContext,
  token: string,
  placeId: string,
  fields: { publicSlug?: string | null; isPublicSchedule?: boolean; acceptsOnlineRequests?: boolean },
) {
  const place = await getOne(request, token, 'places', placeId)
  return update(request, token, 'places', { id: placeId, ...fields }, place?.updatedAt)
}

/**
 * A published club (`places_calendar`, `online_requests` and `contact` blocks, phone 600 000 000) with the J-005
 * pitch of `rentalPitch` public under `boisko-a`, a second place that is not public, and the day's entries.
 */
export async function publicPitch(request: APIRequestContext, club: Club, clubSlug: string): Promise<PublicPitch> {
  const admin = club.adminToken
  const setup = await rentalPitch(request, club)
  await publish(request, admin, clubSlug, ['places_calendar', 'online_requests', 'contact'], {
    contactPhone: '600 000 000',
  })
  const placeSlug = 'boisko-a'
  const made = await setPlacePublic(request, admin, setup.pitch, {
    publicSlug: placeSlug,
    isPublicSchedule: true,
    acceptsOnlineRequests: true,
  })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  const hidden = await create(request, admin, 'places', { name: 'Hala zaplecza', kind: 'hall' })
  const hiddenMade = await setPlacePublic(request, admin, hidden, { publicSlug: 'hala-zaplecza' })
  expect(hiddenMade.status, JSON.stringify(hiddenMade.body)).toBe(200)

  let day = nextWeekday(addDays(calendarDate(), 8), 'WE')
  // The month read covers both days: skip a Wednesday that ends its month.
  if (addDays(day, 1).slice(0, 7) !== day.slice(0, 7)) day = addDays(day, 7)
  const closedDay = addDays(day, 1)
  const event = await createEvent(request, admin, {
    groupId: setup.zaki,
    type: 'tournament',
    name: PRIVATE_NAMES.event,
    placeId: setup.pitch,
    startsAt: zoneInstant(day, '17:30'),
    endsAt: zoneInstant(day, '19:00'),
  })
  expect(event.status, JSON.stringify(event.body)).toBe(201)
  const booking = await postInternalBooking(request, admin, {
    placeId: setup.pitch,
    startsAt: zoneInstant(day, '12:00'),
    endsAt: zoneInstant(day, '13:00'),
    sectionId: setup.academy,
    purpose: PRIVATE_NAMES.bookingPurpose,
  })
  expect(booking.status, JSON.stringify(booking.body)).toBe(201)
  const rental = await postRental(request, admin, phoneRental(setup.pitch, setup.neighbours, zoneInstant(day, '20:00')))
  expect(rental.status, JSON.stringify(rental.body)).toBe(201)
  runRequestProbe(club, {
    op: 'seed',
    placeId: setup.pitch,
    startsAt: zoneInstant(day, '10:00'),
    endsAt: zoneInstant(day, '11:30'),
  })
  const closure = await postClosure(request, admin, {
    placeId: setup.pitch,
    startsAt: zoneInstant(closedDay, '08:00'),
    endsAt: zoneInstant(closedDay, '12:00'),
    reason: 'snow',
    note: PRIVATE_NAMES.closureNote,
  })
  expect(closure.status, JSON.stringify(closure.body)).toBe(201)
  return { ...setup, clubSlug, placeSlug, day, closedDay, month: day.slice(0, 7) }
}

/** `GET /api/facilities/public/{clubSlug}/places` without a session. */
export function publicPlaces(request: APIRequestContext, clubSlug: string) {
  return publicGet(request, `/api/facilities/public/${clubSlug}/places`)
}

/** `GET /api/facilities/public/{clubSlug}/places/{placeSlug}/schedule[?month=]` without a session. */
export function publicSchedule(request: APIRequestContext, clubSlug: string, placeSlug: string, month?: string) {
  const query = month ? `?month=${month}` : ''
  return publicGet(request, `/api/facilities/public/${clubSlug}/places/${placeSlug}/schedule${query}`)
}
