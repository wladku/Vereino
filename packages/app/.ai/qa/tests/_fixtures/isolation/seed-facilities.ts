// facilities records of the cross-club isolation guard (#628): the base pitch made rentable (a training zone rule,
// booking availability, a rate) and public (with the club's `places_calendar` and `online_requests` blocks), and on
// one Wednesday at least 8 days ahead an unregistered phone rental, an internal booking and a held online request,
// a closure the day after and a maintenance window on the Saturday; an entry ban, an incident with a photo, today's
// facility log and a place maintainer.
import { expect } from '@playwright/test'
import { addDays, safeDay, zoneInstant } from '../activities'
import { uniqueSuffix } from '../club'
import { getOne, update } from '../club-structure'
import { runRequestProbe } from '../facilities'
import { getSettings, png, publish, putSettings, PUBLICATION_BLOCKS } from '../publication'
import type { ModuleSeed } from './seed'

type Listed = { items?: Array<{ id: string; updatedAt: string }> }

export const seedFacilities: ModuleSeed = async ({ request, seeded, api, admin }) => {
  const { refs } = seeded
  const place = refs.place
  const label = seeded.label.toLowerCase()

  // Rentable: club training Mon–Fri 16:00–19:30, booking availability around it, an external rate.
  const zoneRule = await api<{ id: string }>('POST', '/api/facilities/zone-rules', {
    data: {
      placeId: place,
      weekdays: [1, 2, 3, 4, 5],
      timeFrom: '16:00',
      timeTo: '19:30',
      zone: 'club_training',
      priority: 2,
      validFrom: refs.today,
    },
  })
  refs.zoneRule = String(zoneRule.body?.id)
  await api('POST', '/api/facilities/zone-rules/bulk', {
    data: {
      placeIds: [place],
      mode: 'replace',
      validFrom: refs.today,
      windows: [
        ...[1, 2, 3, 4, 5].flatMap((weekday) => [
          { weekday, from: '08:00', to: '16:00' },
          { weekday, from: '19:30', to: '22:00' },
        ]),
        ...[6, 7].map((weekday) => ({ weekday, from: '09:00', to: '20:30' })),
      ],
    },
  })
  const rate = await api<{ id: string }>('POST', '/api/facilities/rental-rates', {
    data: { placeId: place, renterCategory: 'external_commercial', pricePer90: 25_000, validFrom: refs.today },
  })
  refs.rentalRate = String(rate.body?.id)

  // Public: the club's slug and blocks (club_core's seed may have published already) and the pitch's calendar.
  const settings = await getSettings(request, admin)
  seeded.responses.push(settings)
  if (!refs.clubSlug && settings.publicSlug) refs.clubSlug = settings.publicSlug
  if (!refs.clubSlug) {
    refs.clubSlug = `it628-fac-${label}-${uniqueSuffix()}`
    seeded.responses.push(
      await publish(request, admin, refs.clubSlug, ['places_calendar', 'online_requests', 'contact']),
    )
  } else if (
    !settings.publication?.enabled ||
    !settings.publication.blocks?.places_calendar ||
    !settings.publication.blocks?.online_requests
  ) {
    const blocks = Object.fromEntries(PUBLICATION_BLOCKS.map((block) => [block, settings.publication.blocks[block]]))
    const result = await putSettings(request, admin, {
      publication: { enabled: true, blocks: { ...blocks, places_calendar: true, online_requests: true } },
    })
    expect(result.status, JSON.stringify(result.body)).toBe(200)
  }
  seeded.markers.push(refs.clubSlug)
  const pitch = (await getOne(request, admin, 'places', place)) as
    | { updatedAt?: string; publicSlug?: string | null; isPublicSchedule?: boolean; acceptsOnlineRequests?: boolean }
    | undefined
  // The facilities pitch (`place`) has its own key: club_core's `placeSlug` belongs to its public place.
  refs.pitchSlug = pitch?.publicSlug ?? `boisko-${label}-${uniqueSuffix()}`
  if (!pitch?.publicSlug || !pitch.isPublicSchedule || !pitch.acceptsOnlineRequests) {
    const made = await update(
      request,
      admin,
      'places',
      { id: place, publicSlug: refs.pitchSlug, isPublicSchedule: true, acceptsOnlineRequests: true },
      pitch?.updatedAt,
    )
    expect(made.status, JSON.stringify(made.body)).toBe(200)
  }
  seeded.markers.push(refs.pitchSlug)

  // The week of the records: a Wednesday at least 8 days ahead, its Thursday and its Saturday.
  const day = safeDay('WE', 8)
  refs.facilityDay = day
  refs.facilityCalendarFrom = zoneInstant(day, '00:00')
  refs.facilityCalendarTo = zoneInstant(addDays(day, 4), '00:00')
  refs.reportTo = addDays(day, 4)
  refs.rentalMoveTo = zoneInstant(day, '08:00')

  const rental = await api<{ id: string }>('POST', '/api/facilities/rentals', {
    data: {
      placeId: place,
      renterType: 'unregistered',
      renterDisplayName: 'Gość Telefoniczny',
      renterCategory: 'external_commercial',
      startsAt: zoneInstant(day, '10:00'),
      units: 1,
      contactName: 'Jan Kontakt',
      contactPhone: '600 000 001',
      requestedVia: 'phone',
      regulationsAccepted: true,
    },
    status: 201,
  })
  refs.rental = String(rental.body?.id)
  const booking = await api<{ id: string }>('POST', '/api/facilities/internal-bookings', {
    data: {
      placeId: place,
      startsAt: zoneInstant(day, '12:00'),
      endsAt: zoneInstant(day, '13:00'),
      sectionId: refs.section,
      purpose: 'Narada zarządu',
    },
    status: 201,
  })
  refs.internalBooking = String(booking.body?.id)
  const held = runRequestProbe(seeded.club, {
    op: 'seed',
    placeId: place,
    startsAt: zoneInstant(day, '13:30'),
    endsAt: zoneInstant(day, '15:00'),
  })
  seeded.responses.push(held)
  refs.rentalRequest = String(held.id)
  const closure = await api<{ id: string }>('POST', '/api/facilities/closures', {
    data: {
      placeId: place,
      startsAt: zoneInstant(addDays(day, 1), '08:00'),
      endsAt: zoneInstant(addDays(day, 1), '12:00'),
      reason: 'snow',
      note: 'Odśnieżanie',
    },
    status: 201,
  })
  refs.closure = String(closure.body?.id)
  const task = await api<{ id: string }>('POST', '/api/facilities/maintenance-tasks', {
    data: {
      placeId: place,
      kind: 'line_marking',
      scheduleType: 'one_off',
      startsAt: zoneInstant(addDays(day, 3), '09:30'),
      endsAt: zoneInstant(addDays(day, 3), '10:30'),
    },
    status: 201,
  })
  refs.maintenanceTask = String(task.body?.id)

  const ban = await api<{ id: string }>('POST', '/api/facilities/entry-bans', {
    data: {
      placeId: place,
      subjectType: 'institution',
      subjectId: refs.institution,
      startsOn: refs.today,
      reason: 'Zniszczenie siatki',
    },
    status: 201,
  })
  refs.entryBan = String(ban.body?.id)
  const incident = await api<{ id: string }>('POST', '/api/facilities/incidents', {
    data: {
      placeId: place,
      occurredAt: zoneInstant(refs.lastWeek, '17:00'),
      kind: 'damage',
      description: 'Drużyna gości zniszczyła siatkę bramki.',
    },
    status: 201,
  })
  refs.incident = String(incident.body?.id)
  const photo = await request.fetch(`/api/facilities/incidents/${refs.incident}/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin}` },
    multipart: { file: png([10, 120, 40]) },
    timeout: 60_000,
  })
  const photoBody = (await photo.json().catch(() => null)) as { id?: string } | null
  seeded.responses.push(photoBody)
  expect(photo.status(), JSON.stringify(photoBody)).toBe(201)
  refs.incidentPhoto = String(photoBody?.id)
  const log = await api<{ id: string }>('POST', '/api/facilities/logs', {
    data: { placeId: place, logDate: refs.today, conditionBefore: 'Murawa w porządku' },
    status: 201,
  })
  refs.facilityLog = String(log.body?.id)
  const maintainer = await api<{ id: string }>('POST', '/api/facilities/place-maintainers', {
    data: { placeId: place, personId: refs.plainPerson },
    status: 201,
  })
  refs.placeMaintainer = String(maintainer.body?.id)

  // The lock tokens of club A's records the foreign-ref probes change (read last: nothing changes them afterwards).
  const tokenOf = async (url: string, id: string): Promise<string> => {
    const listed = await api<Listed>('GET', url)
    const found = listed.body?.items?.find((item) => item.id === id)
    expect(found, `${url} lists ${id}`).toBeTruthy()
    return String(found?.updatedAt)
  }
  refs.rentalUpdatedAt = await tokenOf(`/api/facilities/rentals?id=${refs.rental}`, refs.rental)
  refs.rentalRequestUpdatedAt = await tokenOf('/api/facilities/rentals/requests?pageSize=100', refs.rentalRequest)
  refs.closureUpdatedAt = await tokenOf(`/api/facilities/closures?ids=${refs.closure}`, refs.closure)
  refs.maintenanceTaskUpdatedAt = await tokenOf(
    `/api/facilities/maintenance-tasks?ids=${refs.maintenanceTask}`,
    refs.maintenanceTask,
  )
  refs.facilityLogUpdatedAt = await tokenOf(`/api/facilities/logs?ids=${refs.facilityLog}`, refs.facilityLog)
  refs.incidentUpdatedAt = await tokenOf(`/api/facilities/incidents?ids=${refs.incident}`, refs.incident)
}
