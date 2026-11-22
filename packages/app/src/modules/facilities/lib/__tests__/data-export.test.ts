import { describe, expect, it } from '@jest/globals'
import {
  FACILITIES_ACTOR_TABLES,
  FACILITIES_EXPORT_MODULE,
  FACILITIES_EXPORT_TABLES,
  FACILITIES_OPERATION_ACTIVITY,
  FACILITIES_RENTALS_ACTIVITY,
  FACILITIES_REVIEW_FIELDS,
  actorRef,
  entryBanExportRow,
  incidentExportRow,
  internalBookingExportRow,
  placeMaintainerExportRow,
  rentalExportRow,
} from '../data-export'

const SUBJECT = 'person-subject'
const STAFF = 'person-staff'
const PLACES = new Map([['place-1', { name: 'Hala A' }]])
const SECTIONS = new Map([['section-1', { name: 'Siatkówka' }]])
const CREATED = new Date('2026-10-01T08:00:00.000Z')
const UPDATED = new Date('2026-10-02T08:00:00.000Z')

const RENTAL = {
  id: 'rental-1',
  placeId: 'place-1',
  renterType: 'person',
  renterId: SUBJECT,
  renterDisplayName: 'Jan Kowalski',
  renterCategory: 'member',
  contactName: 'Jan Kowalski',
  contactPhone: '+48 600 000 000',
  contactEmail: 'jan@example.test',
  contactLocale: 'pl',
  purpose: 'Birthday',
  requestedVia: 'online',
  startsAt: new Date('2026-11-01T10:00:00.000Z'),
  endsAt: new Date('2026-11-01T11:30:00.000Z'),
  units: 1,
  rateId: 'rate-1',
  amount: 12000,
  chargeId: 'charge-1',
  status: 'confirmed',
  tokenHash: 'secret-hash',
  expiresAt: new Date('2026-10-01T09:00:00.000Z'),
  usedAt: new Date('2026-10-01T08:30:00.000Z'),
  holdExpiresAt: new Date('2026-10-02T08:00:00.000Z'),
  decidedByPersonId: STAFF,
  decidedAt: new Date('2026-10-01T12:00:00.000Z'),
  decisionReason: 'Approved after talking to Anna',
  entryBanMatch: false,
  cancellationDeadline: new Date('2026-10-30T10:00:00.000Z'),
  paymentDeadline: new Date('2026-10-25T10:00:00.000Z'),
  regulationsAcceptedAt: new Date('2026-10-01T08:00:00.000Z'),
  regulationsAcceptedVia: 'online',
  needsReschedule: false,
  notes: 'Keys at the desk',
  createdAt: CREATED,
  updatedAt: UPDATED,
}

function idsIn(value: unknown): string[] {
  return JSON.stringify(value).match(/person-[a-z]+/g) ?? []
}

function secretKeys(value: unknown): string[] {
  const keys: string[] = []
  const walk = (item: unknown): void => {
    if (Array.isArray(item)) item.forEach(walk)
    else if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        if (/hash$|token|params/i.test(key)) keys.push(key)
        walk(child)
      }
    }
  }
  walk(value)
  return keys
}

describe('facilities data export', () => {
  it('names the sections, activities, actor tables and review fields', () => {
    expect(FACILITIES_EXPORT_MODULE).toBe('facilities')
    expect(Object.values(FACILITIES_EXPORT_TABLES)).toEqual([
      'facilities_rentals',
      'facilities_entry_bans',
      'facilities_internal_bookings',
      'facilities_place_maintainers',
      'facilities_incidents',
    ])
    expect(Object.values(FACILITIES_ACTOR_TABLES)).toEqual([
      'facilities_logs',
      'facilities_maintenance_tasks',
      'facilities_rentals',
      'facilities_entry_bans',
      'facilities_internal_bookings',
    ])
    expect([FACILITIES_RENTALS_ACTIVITY, FACILITIES_OPERATION_ACTIVITY]).toEqual(['A8', 'A9'])
    expect(FACILITIES_REVIEW_FIELDS.incidents).toEqual(['involved', 'description'])
  })

  it('shows an actor as nobody, the subject or staff without a name or id', () => {
    expect(actorRef(null, SUBJECT)).toBeNull()
    expect(actorRef(undefined, SUBJECT)).toBeNull()
    expect(actorRef(SUBJECT, SUBJECT)).toBe('subject')
    expect(actorRef(STAFF, SUBJECT)).toEqual({ relation: 'staff' })
  })

  it('shows a rental with its contact data and decision, without the token hash or another person', () => {
    const row = rentalExportRow(RENTAL, SUBJECT, PLACES)
    expect(row).toEqual({
      id: 'rental-1',
      place: { id: 'place-1', name: 'Hala A' },
      renterDisplayName: 'Jan Kowalski',
      renterCategory: 'member',
      contactName: 'Jan Kowalski',
      contactPhone: '+48 600 000 000',
      contactEmail: 'jan@example.test',
      contactLocale: 'pl',
      purpose: 'Birthday',
      requestedVia: 'online',
      startsAt: '2026-11-01T10:00:00.000Z',
      endsAt: '2026-11-01T11:30:00.000Z',
      units: 1,
      rateId: 'rate-1',
      amount: 12000,
      chargeId: 'charge-1',
      status: 'confirmed',
      emailVerifiedAt: '2026-10-01T08:30:00.000Z',
      holdExpiresAt: '2026-10-02T08:00:00.000Z',
      decidedBy: { relation: 'staff' },
      decidedAt: '2026-10-01T12:00:00.000Z',
      decisionReason: 'Approved after talking to Anna',
      entryBanMatch: false,
      cancellationDeadline: '2026-10-30T10:00:00.000Z',
      paymentDeadline: '2026-10-25T10:00:00.000Z',
      regulationsAcceptedAt: '2026-10-01T08:00:00.000Z',
      regulationsAcceptedVia: 'online',
      needsReschedule: false,
      notes: 'Keys at the desk',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-02T08:00:00.000Z',
    })
    expect(idsIn(row)).toEqual([])
    expect(secretKeys(row)).toEqual([])
    expect(JSON.stringify(row)).not.toContain('secret-hash')
  })

  it('keeps the empty columns of a rental as null and an unknown place without a name', () => {
    const row = rentalExportRow(
      {
        id: 'rental-2',
        placeId: 'place-gone',
        renterDisplayName: 'Jan',
        renterCategory: 'member',
        requestedVia: 'staff',
        startsAt: RENTAL.startsAt,
        endsAt: RENTAL.endsAt,
        units: 2,
        amount: 0,
        status: 'requested',
        entryBanMatch: true,
        needsReschedule: true,
      },
      SUBJECT,
      PLACES,
    )
    expect(row).toMatchObject({
      place: { id: 'place-gone', name: null },
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      contactLocale: null,
      purpose: null,
      rateId: null,
      chargeId: null,
      emailVerifiedAt: null,
      holdExpiresAt: null,
      decidedBy: null,
      decidedAt: null,
      decisionReason: null,
      cancellationDeadline: null,
      paymentDeadline: null,
      regulationsAcceptedAt: null,
      regulationsAcceptedVia: null,
      notes: null,
      createdAt: null,
      updatedAt: null,
    })
  })

  it('shows an entry ban with its reason and the issuer as staff', () => {
    const row = entryBanExportRow(
      {
        id: 'ban-1',
        placeId: 'place-1',
        subjectType: 'person',
        subjectId: SUBJECT,
        startsOn: '2026-11-01',
        endsOn: '2026-12-01',
        reason: 'Damaged the nets',
        incidentId: 'incident-1',
        issuedByPersonId: STAFF,
        revokedAt: new Date('2026-11-10T00:00:00.000Z'),
        createdAt: CREATED,
        updatedAt: UPDATED,
      } as Parameters<typeof entryBanExportRow>[0],
      SUBJECT,
      PLACES,
    )
    expect(row).toEqual({
      id: 'ban-1',
      place: { id: 'place-1', name: 'Hala A' },
      startsOn: '2026-11-01',
      endsOn: '2026-12-01',
      reason: 'Damaged the nets',
      incidentId: 'incident-1',
      issuedBy: { relation: 'staff' },
      revokedAt: '2026-11-10T00:00:00.000Z',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-02T08:00:00.000Z',
    })
    expect(idsIn(row)).toEqual([])
    expect(
      entryBanExportRow({ id: 'ban-2', placeId: 'place-1', startsOn: '2026-11-01', reason: 'r' }, SUBJECT, PLACES),
    ).toMatchObject({ endsOn: null, incidentId: null, issuedBy: null, revokedAt: null })
  })

  it('shows an internal booking with its place, section and canceller', () => {
    const booking = {
      id: 'booking-1',
      placeId: 'place-1',
      sectionId: 'section-1',
      startsAt: new Date('2026-11-03T16:00:00.000Z'),
      endsAt: new Date('2026-11-03T17:30:00.000Z'),
      purpose: 'Extra training with Ola',
      bookedByPersonId: SUBJECT,
      actingRole: 'coach',
      status: 'cancelled',
      needsReschedule: false,
      cancelledByPersonId: SUBJECT,
      cancelReason: 'Ola is ill',
      createdAt: CREATED,
      updatedAt: UPDATED,
    }
    const row = internalBookingExportRow(booking, SUBJECT, PLACES, SECTIONS)
    expect(row).toEqual({
      id: 'booking-1',
      place: { id: 'place-1', name: 'Hala A' },
      section: { id: 'section-1', name: 'Siatkówka' },
      startsAt: '2026-11-03T16:00:00.000Z',
      endsAt: '2026-11-03T17:30:00.000Z',
      purpose: 'Extra training with Ola',
      actingRole: 'coach',
      status: 'cancelled',
      needsReschedule: false,
      cancelledBy: 'subject',
      cancelReason: 'Ola is ill',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-02T08:00:00.000Z',
    })
    expect(idsIn(row)).toEqual([])
    expect(
      internalBookingExportRow(
        { ...booking, cancelledByPersonId: STAFF, cancelReason: undefined },
        SUBJECT,
        PLACES,
        new Map(),
      ),
    ).toMatchObject({
      section: { id: 'section-1', name: null },
      cancelledBy: { relation: 'staff' },
      cancelReason: null,
    })
  })

  it('shows a maintainer row with the assigner as staff', () => {
    const row = placeMaintainerExportRow(
      {
        id: 'maintainer-1',
        placeId: 'place-1',
        assignedByPersonId: STAFF,
        assignedAt: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: CREATED,
      },
      SUBJECT,
      PLACES,
    )
    expect(row).toEqual({
      id: 'maintainer-1',
      place: { id: 'place-1', name: 'Hala A' },
      assignedBy: { relation: 'staff' },
      assignedAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: null,
    })
    expect(idsIn(row)).toEqual([])
  })

  it('shows an incident with its free text and only its own photos, by metadata, in order', () => {
    const photo = {
      id: 'photo-2',
      incidentId: 'incident-1',
      placeId: 'place-1',
      attachmentId: 'attachment-2',
      position: 1,
      fileName: 'net.jpg',
      mimeType: 'image/jpeg',
      fileSize: 2048,
    }
    const photos = [
      photo,
      { ...photo, id: 'photo-1', attachmentId: 'attachment-1', position: 0 },
      {
        ...photo,
        id: 'photo-x',
        incidentId: 'incident-other',
      },
    ]
    const row = incidentExportRow(
      {
        id: 'incident-1',
        placeId: 'place-1',
        occurredAt: new Date('2026-11-05T18:00:00.000Z'),
        kind: 'damage',
        description: 'Net torn during the match',
        involved: 'Piotr N.',
        actionTaken: ['ban'],
        threadId: 'thread-1',
        createdAt: CREATED,
        updatedAt: UPDATED,
      },
      photos,
      PLACES,
    )
    expect(row).toEqual({
      id: 'incident-1',
      place: { id: 'place-1', name: 'Hala A' },
      occurredAt: '2026-11-05T18:00:00.000Z',
      kind: 'damage',
      description: 'Net torn during the match',
      involved: 'Piotr N.',
      actionTaken: ['ban'],
      threadId: 'thread-1',
      photos: [
        {
          id: 'photo-1',
          attachmentId: 'attachment-1',
          position: 0,
          fileName: 'net.jpg',
          mimeType: 'image/jpeg',
          fileSize: 2048,
        },
        {
          id: 'photo-2',
          attachmentId: 'attachment-2',
          position: 1,
          fileName: 'net.jpg',
          mimeType: 'image/jpeg',
          fileSize: 2048,
        },
      ],
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-02T08:00:00.000Z',
    })
    expect(
      incidentExportRow(
        {
          id: 'incident-2',
          placeId: 'place-1',
          occurredAt: CREATED,
          kind: 'injury',
          description: 'd',
          actionTaken: [],
        },
        photos,
        PLACES,
      ),
    ).toMatchObject({ involved: null, threadId: null, photos: [] })
  })
})
