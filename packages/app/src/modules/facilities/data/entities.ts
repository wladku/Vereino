import { ArrayType, OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { ScopedEntityBase, decorateScopedEntityBase, type ScopedEntityOptionalProps } from '@vereino/db'
import type { ClosureReason } from '../lib/closures'
import type { IncidentAction, IncidentKind } from '../lib/incidents'
import type { InternalBookingStatus } from '../lib/internal-bookings'
import type { GroupPresent } from '../lib/logs'
import type { RenterCategory } from '../lib/rates'
import type { EntryBanSubjectType, RenterType, RentalStatus, RequestedVia } from '../lib/rentals'
import type { Zone, ZoneSource } from '../lib/zones'

decorateScopedEntityBase({ PrimaryKey, Property })

/**
 * A weekly zone rule of a place (facilities spec glossary *Zone*, *Booking availability*; DD-21; #121): weekdays,
 * wall-clock times in the club time zone, a zone, a priority and a validity period. Rules from the facility regulations
 * carry `source = regulations` (priority 1–2); the bulk booking availability writes `reservable_paid` rules with
 * `source = availability` and priority 3. Two live rules of a place with equal priority never overlap (409 on save,
 * serialized by the zone advisory lock). `place_id` is a scalar id of a `club_core` place.
 */
@Entity({ tableName: 'facilities_zone_rules' })
@Index({ name: 'facilities_zone_rules_org_place_idx', properties: ['organizationId', 'placeId'] })
@Index({ name: 'facilities_zone_rules_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ZoneRule extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'source' | 'validTo'

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  /** ISO weekdays 1–7. */
  @Property({ name: 'weekdays', type: new ArrayType((value) => Number(value)), columnType: 'smallint[]' })
  weekdays!: number[]

  /** Wall time in the club zone (`HH:mm:ss`). */
  @Property({ name: 'time_from', type: 'time' })
  timeFrom!: string

  @Property({ name: 'time_to', type: 'time' })
  timeTo!: string

  @Property({ name: 'zone', type: 'text' })
  zone!: Zone

  @Property({ name: 'priority', type: 'smallint' })
  priority!: number

  @Property({ name: 'source', type: 'text', default: 'regulations' })
  source: ZoneSource = 'regulations'

  /** `YYYY-MM-DD`, inclusive. */
  @Property({ name: 'valid_from', type: 'date' })
  validFrom!: string

  /** `YYYY-MM-DD`, inclusive; null = open-ended. */
  @Property({ name: 'valid_to', type: 'date', nullable: true })
  validTo?: string | null
}

/**
 * A closure of a place (facilities spec glossary *Closure*, DD-22; #121): snow, an owner-ordered maintenance, a
 * municipal or school event. It blocks new bookings; on save the planned sessions on the place and its sub-places in
 * that time get the reschedule flag (rentals from E08-S02 on).
 */
@Entity({ tableName: 'facilities_closures' })
@Index({ name: 'facilities_closures_org_place_start_idx', properties: ['organizationId', 'placeId', 'startsAt'] })
@Index({ name: 'facilities_closures_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Closure extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'note'

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  @Property({ name: 'starts_at', type: Date })
  startsAt!: Date

  @Property({ name: 'ends_at', type: Date })
  endsAt!: Date

  @Property({ name: 'reason', type: 'text' })
  reason!: ClosureReason

  @Property({ name: 'note', type: 'text', nullable: true })
  note?: string | null
}

/**
 * A rental rate (facilities spec *Data Models* → `facilities_rental_rates`; #121): the price of one 90-minute unit for
 * a place and a renter category, in minor units, optionally for a season `MM-DD`–`MM-DD` and with lighting.
 */
@Entity({ tableName: 'facilities_rental_rates' })
@Index({
  name: 'facilities_rental_rates_org_place_category_idx',
  properties: ['organizationId', 'placeId', 'renterCategory'],
})
@Index({ name: 'facilities_rental_rates_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class RentalRate extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'seasonFrom' | 'seasonTo' | 'includesLighting' | 'validTo'

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  @Property({ name: 'renter_category', type: 'text' })
  renterCategory!: RenterCategory

  /** Minor units (grosz) per 90-minute unit; there is no 60-minute rate. */
  @Property({ name: 'price_per_90', type: 'int' })
  pricePer90!: number

  /** `MM-DD`; set together with `season_to`, or neither. */
  @Property({ name: 'season_from', type: 'text', nullable: true })
  seasonFrom?: string | null

  @Property({ name: 'season_to', type: 'text', nullable: true })
  seasonTo?: string | null

  @Property({ name: 'includes_lighting', type: 'boolean', default: false })
  includesLighting: boolean = false

  @Property({ name: 'valid_from', type: 'date' })
  validFrom!: string

  @Property({ name: 'valid_to', type: 'date', nullable: true })
  validTo?: string | null
}

/**
 * An external rental of a place (facilities spec *Data Models* → `facilities_rentals`, glossary *Booking (external
 * rental)*; REQ-013, DD-19, DD-46; #122): a renter, a slot of 90-minute units, the amount from the rate, the deadlines
 * and a status that only commands change. A staff entry starts at `requested`; the online request columns
 * (`verification_*`, `hold_expires_at`, the decision) are filled by an online request (E08-S05, #125). `charge_id` is set at most once, by
 * the optional `payments.chargeService`, in the rental's own transaction. Contact data, the renter's name, the
 * purpose, the decision reason and the notes are encrypted at rest (`encryption.ts`).
 */
@Entity({ tableName: 'facilities_rentals' })
@Index({ name: 'facilities_rentals_org_place_start_idx', properties: ['organizationId', 'placeId', 'startsAt'] })
@Index({ name: 'facilities_rentals_org_status_hold_idx', properties: ['organizationId', 'status', 'holdExpiresAt'] })
@Index({ name: 'facilities_rentals_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Rental extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'renterId'
    | 'contactName'
    | 'contactPhone'
    | 'contactEmail'
    | 'contactLocale'
    | 'purpose'
    | 'rateId'
    | 'chargeId'
    | 'tokenHash'
    | 'expiresAt'
    | 'usedAt'
    | 'holdExpiresAt'
    | 'decidedByPersonId'
    | 'decidedAt'
    | 'decisionReason'
    | 'entryBanMatch'
    | 'cancellationDeadline'
    | 'paymentDeadline'
    | 'regulationsAcceptedAt'
    | 'regulationsAcceptedVia'
    | 'needsReschedule'
    | 'notes'

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  @Property({ name: 'renter_type', type: 'text' })
  renterType!: RenterType

  /** A `club_core` institution or a `people` person, by id; null for an unregistered renter. */
  @Property({ name: 'renter_id', type: 'uuid', nullable: true })
  renterId?: string | null

  @Property({ name: 'renter_display_name', type: 'text' })
  renterDisplayName!: string

  @Property({ name: 'renter_category', type: 'text' })
  renterCategory!: RenterCategory

  @Property({ name: 'contact_name', type: 'text', nullable: true })
  contactName?: string | null

  @Property({ name: 'contact_phone', type: 'text', nullable: true })
  contactPhone?: string | null

  @Property({ name: 'contact_email', type: 'text', nullable: true })
  contactEmail?: string | null

  /** The language of an online requester's e-mails (the form's locale, #125); null for a staff entry. */
  @Property({ name: 'contact_locale', type: 'text', nullable: true })
  contactLocale?: string | null

  @Property({ name: 'purpose', type: 'text', nullable: true })
  purpose?: string | null

  @Property({ name: 'requested_via', type: 'text' })
  requestedVia!: RequestedVia

  @Property({ name: 'starts_at', type: Date })
  startsAt!: Date

  @Property({ name: 'ends_at', type: Date })
  endsAt!: Date

  @Property({ name: 'units', type: 'smallint' })
  units!: number

  @Property({ name: 'rate_id', type: 'uuid', nullable: true })
  rateId?: string | null

  /** Minor units. */
  @Property({ name: 'amount', type: 'int' })
  amount!: number

  @Property({ name: 'charge_id', type: 'uuid', nullable: true })
  chargeId?: string | null

  @Property({ name: 'status', type: 'text' })
  status!: RentalStatus

  // The online request is its own P-10 single-use token link (DD-44): the foundation `createTokenLinkService` reads
  // and writes the properties `tokenHash`, `expiresAt` and `usedAt`, mapped here onto the request's verification
  // columns. Null on a staff entry.

  /** `hashAuthToken` of the e-mailed confirmation token (`verification_token_hash`); the raw token is never stored. */
  @Property({ name: 'verification_token_hash', type: 'text', nullable: true, unique: true })
  tokenHash?: string | null

  /** When the confirmation link stops working (`verification_expires_at`, 1 h after the request). */
  @Property({ name: 'verification_expires_at', type: Date, nullable: true })
  expiresAt?: Date | null

  /** When the requester confirmed the e-mail (`email_verified_at`): the link is spent. */
  @Property({ name: 'email_verified_at', type: Date, nullable: true })
  usedAt?: Date | null

  @Property({ name: 'hold_expires_at', type: Date, nullable: true })
  holdExpiresAt?: Date | null

  @Property({ name: 'decided_by_person_id', type: 'uuid', nullable: true })
  decidedByPersonId?: string | null

  @Property({ name: 'decided_at', type: Date, nullable: true })
  decidedAt?: Date | null

  @Property({ name: 'decision_reason', type: 'text', nullable: true })
  decisionReason?: string | null

  @Property({ name: 'entry_ban_match', type: 'boolean', default: false })
  entryBanMatch: boolean = false

  @Property({ name: 'cancellation_deadline', type: Date, nullable: true })
  cancellationDeadline?: Date | null

  @Property({ name: 'payment_deadline', type: Date, nullable: true })
  paymentDeadline?: Date | null

  @Property({ name: 'regulations_accepted_at', type: Date, nullable: true })
  regulationsAcceptedAt?: Date | null

  @Property({ name: 'regulations_accepted_via', type: 'text', nullable: true })
  regulationsAcceptedVia?: RequestedVia | null

  @Property({ name: 'needs_reschedule', type: 'boolean', default: false })
  needsReschedule: boolean = false

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null
}

/**
 * An entry ban (facilities spec *Data Models* → `facilities_entry_bans`, REQ-016; #122): an institution or a person
 * may not book a place from `starts_on` to `ends_on` (inclusive; open-ended without it). A rental for a renter with an
 * active ban on the place answers 409 `entry_ban_active`. Revoked through `revoked_at`, never deleted; since E08-S06
 * (#126) it names the incident it follows and the person who issued it. The reason is encrypted at rest.
 */
@Entity({ tableName: 'facilities_entry_bans' })
@Index({ name: 'facilities_entry_bans_org_subject_idx', properties: ['organizationId', 'subjectType', 'subjectId'] })
@Index({ name: 'facilities_entry_bans_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class EntryBan extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'endsOn' | 'incidentId' | 'issuedByPersonId' | 'revokedAt'

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  @Property({ name: 'subject_type', type: 'text' })
  subjectType!: EntryBanSubjectType

  @Property({ name: 'subject_id', type: 'uuid' })
  subjectId!: string

  /** `YYYY-MM-DD`, inclusive. */
  @Property({ name: 'starts_on', type: 'date' })
  startsOn!: string

  /** `YYYY-MM-DD`, inclusive; null = until revoked. */
  @Property({ name: 'ends_on', type: 'date', nullable: true })
  endsOn?: string | null

  @Property({ name: 'reason', type: 'text' })
  reason!: string

  @Property({ name: 'incident_id', type: 'uuid', nullable: true })
  incidentId?: string | null

  @Property({ name: 'issued_by_person_id', type: 'uuid', nullable: true })
  issuedByPersonId?: string | null

  @Property({ name: 'revoked_at', type: Date, nullable: true })
  revokedAt?: Date | null
}

/**
 * An internal booking (facilities spec *Data Models* → `facilities_internal_bookings`, glossary *Internal booking*;
 * REQ-023, DD-25; #123): the club occupying a place without a group — coach training, a meeting — booked at once by
 * staff of any section, `confirmed` from the start, without an amount or a charge. A booking for a group is a one-off
 * event of `activities` instead (DD-26). Cancelled by the booker, the coordinator of its section or the club
 * administrator. The purpose and the cancellation reason are encrypted at rest (free text may name people).
 */
@Entity({ tableName: 'facilities_internal_bookings' })
@Index({
  name: 'facilities_internal_bookings_org_place_start_idx',
  properties: ['organizationId', 'placeId', 'startsAt'],
})
@Index({ name: 'facilities_internal_bookings_org_booker_idx', properties: ['organizationId', 'bookedByPersonId'] })
@Index({ name: 'facilities_internal_bookings_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class InternalBooking extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'status' | 'needsReschedule' | 'cancelledByPersonId' | 'cancelReason'

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  @Property({ name: 'starts_at', type: Date })
  startsAt!: Date

  @Property({ name: 'ends_at', type: Date })
  endsAt!: Date

  /** The `club_core` section the booking is made for. */
  @Property({ name: 'section_id', type: 'uuid' })
  sectionId!: string

  @Property({ name: 'purpose', type: 'text' })
  purpose!: string

  @Property({ name: 'booked_by_person_id', type: 'uuid' })
  bookedByPersonId!: string

  /** The role the booking was made in (`club_admin`, `coordinator`, `coach`). */
  @Property({ name: 'acting_role', type: 'text' })
  actingRole!: string

  @Property({ name: 'status', type: 'text', default: 'confirmed' })
  status: InternalBookingStatus = 'confirmed'

  /** Set by a closure or a maintenance window; cleared when the booking is cancelled. */
  @Property({ name: 'needs_reschedule', type: 'boolean', default: false })
  needsReschedule: boolean = false

  @Property({ name: 'cancelled_by_person_id', type: 'uuid', nullable: true })
  cancelledByPersonId?: string | null

  @Property({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string | null
}

/**
 * The facility log of a place and a day (facilities spec *Data Models* → `facilities_logs`, REQ-016; M-12 "Open
 * facility" / "Close facility", B-27; #126): who ran the day, when the place opened and closed, its condition before
 * and after, the groups present (a session or a rental each, with the head count and whether an adult supervisor was
 * there) and the remarks. One log per place and day; editable until the end of the next day, then by the club
 * administrator only. The remarks are encrypted at rest.
 */
@Entity({ tableName: 'facilities_logs' })
@Unique({ name: 'facilities_logs_org_place_date_unique', properties: ['organizationId', 'placeId', 'logDate'] })
@Index({ name: 'facilities_logs_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class FacilityLog extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'openedAt'
    | 'closedAt'
    | 'conditionBefore'
    | 'conditionAfter'
    | 'groupsPresent'
    | 'remarks'

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  /** `YYYY-MM-DD` in the club time zone. */
  @Property({ name: 'log_date', type: 'date' })
  logDate!: string

  /** The person who ran the day: who wrote the log first (the attendant on duty, or the administrator). */
  @Property({ name: 'operator_person_id', type: 'uuid' })
  operatorPersonId!: string

  @Property({ name: 'opened_at', type: Date, nullable: true })
  openedAt?: Date | null

  @Property({ name: 'closed_at', type: Date, nullable: true })
  closedAt?: Date | null

  @Property({ name: 'condition_before', type: 'text', nullable: true })
  conditionBefore?: string | null

  @Property({ name: 'condition_after', type: 'text', nullable: true })
  conditionAfter?: string | null

  @Property({ name: 'groups_present', type: 'json', defaultRaw: `'[]'::jsonb` })
  groupsPresent: GroupPresent[] = []

  @Property({ name: 'remarks', type: 'text', nullable: true })
  remarks?: string | null
}

/**
 * An incident at a place (facilities spec *Data Models* → `facilities_incidents`, REQ-016, §6 of the regulations;
 * M-12 "Report incident", B-27; #126): when and where it happened, who reported it, its kind, the description, the
 * people involved, the actions taken and the communication case it is followed in. Evidence: never deleted, so the
 * route has no DELETE and the commands never set `deleted_at`. The description and the people involved are encrypted
 * at rest; the people involved are free text (names or descriptions), not a structured list.
 */
@Entity({ tableName: 'facilities_incidents' })
@Index({ name: 'facilities_incidents_org_place_time_idx', properties: ['organizationId', 'placeId', 'occurredAt'] })
@Index({ name: 'facilities_incidents_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Incident extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'involved' | 'actionTaken' | 'threadId'

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  @Property({ name: 'occurred_at', type: Date })
  occurredAt!: Date

  @Property({ name: 'reported_by_person_id', type: 'uuid' })
  reportedByPersonId!: string

  @Property({ name: 'kind', type: 'text' })
  kind!: IncidentKind

  @Property({ name: 'description', type: 'text' })
  description!: string

  @Property({ name: 'involved', type: 'text', nullable: true })
  involved?: string | null

  @Property({ name: 'action_taken', type: 'text[]', defaultRaw: `'{}'` })
  actionTaken: IncidentAction[] = []

  /** The `communication` case thread the incident is followed in (a scalar id, no relation). */
  @Property({ name: 'thread_id', type: 'uuid', nullable: true })
  threadId?: string | null
}
