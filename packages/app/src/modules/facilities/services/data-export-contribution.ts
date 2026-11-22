// The `facilities` person data export contributor (person data export spec
// `.ai/specs/2026-11-21-vereino-person-data-export.md`, DD-X01, DD-X03, DD-X06, *Contributor inventory* → `facilities`;
// #527, phase X2): `people` declares the contract (`people/services/data-export.ts`) and reads it with
// `hasRegistration`; `facilities` registers it in `di.ts` under `people.dataExport.facilities`. The sections are the
// subject's rentals as a person renter, the entry bans on them as a person, the internal bookings they made, their place
// maintainer rows and the incidents they reported (photos by metadata only); the rows where they only acted as staff
// are counted per table. Every query filters by the subject's tenant and organization and skips deleted rows; the
// encrypted columns are read with `findWithDecryption`. Place and section names come from `club_core`'s directory.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { PersonDataExportContributor } from '../../people/services/data-export'
import type { PlaceDirectoryEntry, SectionDirectoryEntry } from '../../club_core/services/directory'
import {
  EntryBan,
  FacilityLog,
  Incident,
  IncidentPhoto,
  InternalBooking,
  MaintenanceTask,
  PlaceMaintainer,
  Rental,
} from '../data/entities'
import {
  FACILITIES_ACTOR_TABLES,
  FACILITIES_EXPORT_MODULE,
  FACILITIES_EXPORT_TABLES,
  FACILITIES_OPERATION_ACTIVITY,
  FACILITIES_RENTALS_ACTIVITY,
  FACILITIES_REVIEW_FIELDS,
  entryBanExportRow,
  incidentExportRow,
  internalBookingExportRow,
  placeMaintainerExportRow,
  rentalExportRow,
} from '../lib/data-export'
import { findPlaces, findSections } from './directory'

/** The token `people` reads (`dataExportContributorToken('facilities')` in `people/services/data-export.ts`). */
export const FACILITIES_DATA_EXPORT_CONTRIBUTOR = 'people.dataExport.facilities'

export function createDataExportContribution(container: AwilixContainer): PersonDataExportContributor {
  return {
    async export(em: EntityManager, subject) {
      const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
      const live = { ...scope, deletedAt: null }
      const personId = subject.personId
      const [
        rentals,
        bans,
        bookings,
        maintainers,
        incidents,
        logsOperated,
        tasks,
        rentalsDecided,
        bansIssued,
        bookingsCancelled,
      ] = await Promise.all([
        findWithDecryption(
          em,
          Rental,
          { ...live, renterType: 'person', renterId: personId },
          { orderBy: { startsAt: 'asc', id: 'asc' } },
          scope,
        ),
        findWithDecryption(
          em,
          EntryBan,
          { ...live, subjectType: 'person', subjectId: personId },
          { orderBy: { startsOn: 'asc', id: 'asc' } },
          scope,
        ),
        findWithDecryption(
          em,
          InternalBooking,
          { ...live, bookedByPersonId: personId },
          { orderBy: { startsAt: 'asc', id: 'asc' } },
          scope,
        ),
        em.find(PlaceMaintainer, { ...live, personId }, { orderBy: { assignedAt: 'asc', id: 'asc' } }),
        findWithDecryption(
          em,
          Incident,
          { ...live, reportedByPersonId: personId },
          { orderBy: { occurredAt: 'asc', id: 'asc' } },
          scope,
        ),
        em.count(FacilityLog, { ...live, operatorPersonId: personId }),
        em.count(MaintenanceTask, { ...live, $or: [{ plannedByPersonId: personId }, { doneByPersonId: personId }] }),
        // Only the rows where the subject acted as staff: their own rental, ban or booking is a section above.
        em.count(Rental, {
          ...live,
          decidedByPersonId: personId,
          $or: [{ renterType: { $ne: 'person' } }, { renterId: { $ne: personId } }],
        }),
        em.count(EntryBan, {
          ...live,
          issuedByPersonId: personId,
          $or: [{ subjectType: { $ne: 'person' } }, { subjectId: { $ne: personId } }],
        }),
        em.count(InternalBooking, {
          ...live,
          cancelledByPersonId: personId,
          bookedByPersonId: { $ne: personId },
        }),
      ])
      const incidentIds = incidents.map((row) => row.id)
      const photos =
        incidentIds.length > 0
          ? await em.find(
              IncidentPhoto,
              { ...live, incidentId: { $in: incidentIds } },
              { orderBy: { position: 'asc', id: 'asc' } },
            )
          : []
      const placeIds = [
        ...new Set([
          ...rentals.map((row) => row.placeId),
          ...bans.map((row) => row.placeId),
          ...bookings.map((row) => row.placeId),
          ...maintainers.map((row) => row.placeId),
          ...incidents.map((row) => row.placeId),
        ]),
      ]
      const sectionIds = [...new Set(bookings.map((row) => row.sectionId))]
      const [places, sections] = await Promise.all([
        placeIds.length > 0 ? findPlaces(container, scope, placeIds, em) : new Map<string, PlaceDirectoryEntry>(),
        sectionIds.length > 0
          ? findSections(container, scope, sectionIds, em)
          : new Map<string, SectionDirectoryEntry>(),
      ])
      return {
        sections: [
          {
            module: FACILITIES_EXPORT_MODULE,
            table: FACILITIES_EXPORT_TABLES.rentals,
            activity: FACILITIES_RENTALS_ACTIVITY,
            portable: true,
            reviewFields: [...FACILITIES_REVIEW_FIELDS.rentals],
            rows: rentals.map((row) => rentalExportRow(row, personId, places)),
          },
          {
            module: FACILITIES_EXPORT_MODULE,
            table: FACILITIES_EXPORT_TABLES.entryBans,
            activity: FACILITIES_OPERATION_ACTIVITY,
            portable: false,
            reviewFields: [...FACILITIES_REVIEW_FIELDS.entryBans],
            rows: bans.map((row) => entryBanExportRow(row, personId, places)),
          },
          {
            module: FACILITIES_EXPORT_MODULE,
            table: FACILITIES_EXPORT_TABLES.internalBookings,
            activity: FACILITIES_OPERATION_ACTIVITY,
            portable: false,
            reviewFields: [...FACILITIES_REVIEW_FIELDS.internalBookings],
            rows: bookings.map((row) => internalBookingExportRow(row, personId, places, sections)),
          },
          {
            module: FACILITIES_EXPORT_MODULE,
            table: FACILITIES_EXPORT_TABLES.placeMaintainers,
            activity: FACILITIES_OPERATION_ACTIVITY,
            portable: false,
            rows: maintainers.map((row) => placeMaintainerExportRow(row, personId, places)),
          },
          {
            module: FACILITIES_EXPORT_MODULE,
            table: FACILITIES_EXPORT_TABLES.incidents,
            activity: FACILITIES_OPERATION_ACTIVITY,
            portable: false,
            reviewFields: [...FACILITIES_REVIEW_FIELDS.incidents],
            rows: incidents.map((row) => incidentExportRow(row, photos, places)),
          },
        ],
        actorCounts: [
          { module: FACILITIES_EXPORT_MODULE, table: FACILITIES_ACTOR_TABLES.logs, count: logsOperated },
          { module: FACILITIES_EXPORT_MODULE, table: FACILITIES_ACTOR_TABLES.maintenanceTasks, count: tasks },
          { module: FACILITIES_EXPORT_MODULE, table: FACILITIES_ACTOR_TABLES.rentals, count: rentalsDecided },
          { module: FACILITIES_EXPORT_MODULE, table: FACILITIES_ACTOR_TABLES.entryBans, count: bansIssued },
          {
            module: FACILITIES_EXPORT_MODULE,
            table: FACILITIES_ACTOR_TABLES.internalBookings,
            count: bookingsCancelled,
          },
        ],
      }
    },
  }
}
