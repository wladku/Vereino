import { OptionalProps } from '@mikro-orm/core'
import { Check, Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import {
  AppendOnlyEntityBase,
  ScopedEntityBase,
  decorateAppendOnlyEntityBase,
  decorateScopedEntityBase,
  type AppendOnlyEntityOptionalProps,
  type ScopedEntityOptionalProps,
  tokenLinkColumns,
} from '@vereino/db'
import type { ActivityType, OccurrenceStatus } from '../lib/activities-rules'
import type { ClubEventFileKind } from '../lib/club-event-files'
import type { ClubEventStatus } from '../lib/club-events'
import type { SubstitutionKind } from '../lib/substitutions'
import type {
  ActualAttendance,
  Declared,
  DeclarationSource,
  DeclarationStatus,
  MinorDeclarationMode,
  PolicyScope,
  TimeoutDefault,
} from '../lib/policy'

decorateScopedEntityBase({ PrimaryKey, Property })
decorateAppendOnlyEntityBase({ PrimaryKey, Property })

/**
 * An activity of one group (club spec glossary *Activity*, *Data Models* → `activities_activities`, D02, REQ-005): a
 * recurring series (`recurrence_rule`, the foundation II RRULE subset with an `EXDATE` line) or a one-off event (no
 * rule: one session on `starts_on`, REQ-027). `section_id` is the group's section, copied when the activity is written;
 * `group_id`, `default_place_id`, `default_coach_person_id` and the external teams are scalar ids of `groups`,
 * `club_core` and `people` (no cross-module relation). `generated_until` is the last day the generator filled.
 * `is_away` marks an away trip (club spec glossary *Coach settlement*, #96): the coach units report counts it and the
 * declaration policy of `away_trip` governs it. Fixture and public-schedule fields arrive with their stories (REQ-039,
 * step 9).
 */
@Entity({ tableName: 'activities_activities' })
@Check({
  name: 'activities_activities_place_or_venue',
  expression: '(default_place_id IS NOT NULL) <> (venue_name IS NOT NULL)',
})
@Check({
  name: 'activities_activities_venue_address_with_name',
  expression: 'venue_address IS NULL OR venue_name IS NOT NULL',
})
@Check({
  name: 'activities_activities_club_event_one_off',
  expression: 'club_event_id IS NULL OR recurrence_rule IS NULL',
})
@Index({ name: 'activities_activities_org_club_event_idx', properties: ['organizationId', 'clubEventId'] })
@Index({ name: 'activities_activities_org_group_active_idx', properties: ['organizationId', 'groupId', 'isActive'] })
@Index({ name: 'activities_activities_org_section_idx', properties: ['organizationId', 'sectionId'] })
@Index({ name: 'activities_activities_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Activity extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'defaultCoachPersonId'
    | 'opponentExternalTeamId'
    | 'invitedExternalTeamIds'
    | 'recurrenceRule'
    | 'endsOn'
    | 'generatedUntil'
    | 'gatheringMinutesBefore'
    | 'confirmByMinutesBefore'
    | 'description'
    | 'isActive'
    | 'isAway'
    | 'venueName'
    | 'venueAddress'

  @Property({ name: 'section_id', type: 'uuid' })
  sectionId!: string

  @Property({ name: 'group_id', type: 'uuid' })
  groupId!: string

  @Property({ name: 'name', type: 'text' })
  name!: string

  @Property({ name: 'type', type: 'text' })
  type!: ActivityType

  /** The club place of its sessions; null only for a one-off event at a typed venue (REQ-A08, DD-A03). */
  @Property({ name: 'default_place_id', type: 'uuid', nullable: true })
  defaultPlaceId!: string | null

  /**
   * A typed venue outside the club's places (REQ-A08, DD-A03): its name (2–120 characters) and address (5–300). Only
   * a one-off event carries one, exactly one of `default_place_id` and `venue_name` is set (check constraint), and it
   * is never added to the club's places.
   */
  @Property({ name: 'venue_name', type: 'text', nullable: true })
  venueName?: string | null

  @Property({ name: 'venue_address', type: 'text', nullable: true })
  venueAddress?: string | null

  @Property({ name: 'default_coach_person_id', type: 'uuid', nullable: true })
  defaultCoachPersonId?: string | null

  /** The opponent of a `match` or `sparring` (a `groups` external team). */
  @Property({ name: 'opponent_external_team_id', type: 'uuid', nullable: true })
  opponentExternalTeamId?: string | null

  /** The teams invited to a `tournament` (`groups` external teams). */
  @Property({ name: 'invited_external_team_ids', type: 'text[]', columnType: 'uuid[]', defaultRaw: `'{}'` })
  invitedExternalTeamIds: string[] = []

  /** The stored rule text (`FREQ=WEEKLY;…` and an optional `EXDATE:` line); null for a one-off event. */
  @Property({ name: 'recurrence_rule', type: 'text', nullable: true })
  recurrenceRule?: string | null

  /** `YYYY-MM-DD`: the first day of the series, or the day of a one-off event. */
  @Property({ name: 'starts_on', type: 'date' })
  startsOn!: string

  /** `YYYY-MM-DD`: the last day a session may fall on (null = open); a one-off event ends on its last day. */
  @Property({ name: 'ends_on', type: 'date', nullable: true })
  endsOn?: string | null

  /** Wall time in the club zone (`HH:mm:ss`). */
  @Property({ name: 'default_start_time', type: 'time' })
  defaultStartTime!: string

  @Property({ name: 'default_end_time', type: 'time' })
  defaultEndTime!: string

  /** The last day the generator has filled (club spec DD-10); null before the first generation. */
  @Property({ name: 'generated_until', type: 'date', nullable: true })
  generatedUntil?: string | null

  /** The default gathering time of its sessions, in minutes before the start (DD-43); null = none. */
  @Property({ name: 'gathering_minutes_before', type: 'integer', nullable: true })
  gatheringMinutesBefore?: number | null

  /**
   * The default declaration deadline of its sessions, in minutes before the start (REQ-A07, DD-A01); null = none. It
   * has effect only for a `confirm` declaration kind.
   */
  @Property({ name: 'confirm_by_minutes_before', type: 'integer', nullable: true })
  confirmByMinutesBefore?: number | null

  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  /** An away trip (#96): its sessions count as trips in the coach units report. */
  @Property({ name: 'is_away', type: 'boolean', default: false })
  isAway: boolean = false

  /**
   * The club event this one-off activity is a part of (club events spec DD-T01, REQ-T02; migration T1): set only by
   * `activities.club_event_parts.create`, only on a one-off activity (check `activities_activities_club_event_one_off`).
   * Such an activity changes only through its part (409 `activity_is_club_event_part`, DD-T02).
   */
  @Property({ name: 'club_event_id', type: 'uuid', nullable: true })
  clubEventId?: string | null
}

/**
 * A club event (club events spec DD-T01, REQ-T01, *Data Models* → `activities_club_events`; migration T1): the shared
 * facts of a tournament or a festival — name, public slug, description, one place (a live active leaf of the club's
 * places, own or external; scalar id of `club_core`), the section it belongs to (null = the whole club), the public
 * switch, the default gathering time and declaration deadline its new parts take, and a status `planned` or
 * `cancelled` with a reason (check `activities_club_events_cancel_reason`). The slug is unique among the club's live
 * club events (partial unique index).
 */
@Entity({ tableName: 'activities_club_events' })
@Check({
  name: 'activities_club_events_cancel_reason',
  expression: `(status = 'cancelled') = (cancel_reason IS NOT NULL)`,
})
@Index({
  name: 'activities_club_events_org_slug_unique',
  expression:
    'create unique index "activities_club_events_org_slug_unique" on "activities_club_events" ("organization_id", "public_slug") where deleted_at is null',
})
@Index({ name: 'activities_club_events_org_section_idx', properties: ['organizationId', 'sectionId'] })
@Index({ name: 'activities_club_events_org_place_idx', properties: ['organizationId', 'placeId'] })
@Index({ name: 'activities_club_events_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ClubEvent extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'sectionId'
    | 'description'
    | 'gatheringMinutesBefore'
    | 'confirmByMinutesBefore'
    | 'isPublic'
    | 'status'
    | 'cancelReason'

  /** The section the event belongs to; null = a whole-club event, managed by the club administrator only. */
  @Property({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId?: string | null

  @Property({ name: 'name', type: 'text' })
  name!: string

  @Property({ name: 'public_slug', type: 'text' })
  publicSlug!: string

  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  /** The one place of every part (DD-T05): a live active leaf of `club_core_places`, own or external. */
  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

  /** Copied to every new part (DD-43). */
  @Property({ name: 'gathering_minutes_before', type: 'integer', nullable: true })
  gatheringMinutesBefore?: number | null

  /** Copied to every new part (REQ-A07). */
  @Property({ name: 'confirm_by_minutes_before', type: 'integer', nullable: true })
  confirmByMinutesBefore?: number | null

  @Property({ name: 'is_public', type: 'boolean', default: false })
  isPublic: boolean = false

  /** `planned` → `cancelled`. */
  @Property({ name: 'status', type: 'text', default: 'planned' })
  status: ClubEventStatus = 'planned'

  @Property({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string | null
}

/**
 * A part of a club event (club events spec DD-T01, DD-T04, REQ-T02, *Data Models* → `activities_club_event_parts`;
 * migration T1): what the part shows — title, category label, type, visiting teams (`groups` external team ids). A part
 * with a group owns one one-off activity (`activity_id`, unique among live parts) whose session is the source of truth
 * for its day, time, place, coach and status; an open part (no club group) keeps its own start, end and status here
 * (checks `activities_club_event_parts_kind`, `activities_club_event_parts_open_times`).
 */
@Entity({ tableName: 'activities_club_event_parts' })
@Check({
  name: 'activities_club_event_parts_kind',
  expression:
    '(activity_id IS NOT NULL AND starts_at IS NULL AND ends_at IS NULL AND status IS NULL AND cancel_reason IS NULL) OR (activity_id IS NULL AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND status IS NOT NULL)',
})
@Check({
  name: 'activities_club_event_parts_open_times',
  expression: 'starts_at IS NULL OR ends_at > starts_at',
})
@Index({
  name: 'activities_club_event_parts_activity_unique',
  expression:
    'create unique index "activities_club_event_parts_activity_unique" on "activities_club_event_parts" ("activity_id") where deleted_at is null',
})
@Index({ name: 'activities_club_event_parts_org_event_idx', properties: ['organizationId', 'clubEventId'] })
@Index({ name: 'activities_club_event_parts_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ClubEventPart extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'categoryLabel'
    | 'activityId'
    | 'visitingTeamIds'
    | 'startsAt'
    | 'endsAt'
    | 'status'
    | 'cancelReason'

  @Property({ name: 'club_event_id', type: 'uuid' })
  clubEventId!: string

  /** Copied to the activity's `name`. */
  @Property({ name: 'title', type: 'text' })
  title!: string

  /** A text snapshot (≤ 60), proposed from the group's age category (DD-T03). */
  @Property({ name: 'category_label', type: 'text', nullable: true })
  categoryLabel?: string | null

  /** `tournament` / `match` / `sparring` / `other`; copied to the activity's `type`. */
  @Property({ name: 'type', type: 'text' })
  type!: ActivityType

  /** The part's one-off activity; null for an open part. */
  @Property({ name: 'activity_id', type: 'uuid', nullable: true })
  activityId?: string | null

  /** `groups` external teams (≤ 32); copied to the activity's `invited_external_team_ids`. */
  @Property({ name: 'visiting_team_ids', type: 'text[]', columnType: 'uuid[]', defaultRaw: `'{}'` })
  visitingTeamIds: string[] = []

  /** An open part's own start and end; null for a part with a group. */
  @Property({ name: 'starts_at', type: Date, nullable: true })
  startsAt?: Date | null

  @Property({ name: 'ends_at', type: Date, nullable: true })
  endsAt?: Date | null

  /** An open part's own status (`planned` / `cancelled`); null for a part with a group. */
  @Property({ name: 'status', type: 'text', nullable: true })
  status?: ClubEventStatus | null

  @Property({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string | null
}

/**
 * A file of a club event (club events spec DD-T10, REQ-T08, *Data Models* → `activities_club_event_files`; migration
 * T2; #379): the poster (one live per event, partial unique index `activities_club_event_files_poster_unique`) or a
 * funder's logo with the funder's name (check `activities_club_event_files_funder_name`), on the place-files pattern of
 * `club_core`: the bytes live in the platform `attachments` module (owner `activities:club_event`, assignment
 * `activities:club_event_file`), this row keeps the attachment id, a snapshot of the name, type and size, and the
 * logos' upload order.
 *
 * Event photos spec (DD-I02, *Data Models*; #872): the kinds `photo` and `graphic` are the event's **pictures**, with a
 * required description (the alternative text), the people confirmation and the publication of a manager. A picture's
 * bytes have the owner `activities:club_event_picture` (record = this row's id) as their only assignment (DD-I12), so
 * deleting a picture releases them; its marks live in `activities_club_event_file_people`. Whether a picture is public
 * is decided on every read (BR-I01), never stored.
 */
@Entity({ tableName: 'activities_club_event_files' })
@Check({
  name: 'activities_club_event_files_funder_name',
  expression: `(kind = 'funder_logo') = (funder_name IS NOT NULL)`,
})
@Check({
  name: 'activities_club_event_files_picture_description',
  expression: `(kind IN ('photo', 'graphic')) = (description IS NOT NULL)`,
})
@Index({
  name: 'activities_club_event_files_published_pictures_idx',
  expression:
    'create index "activities_club_event_files_published_pictures_idx" on "activities_club_event_files" ("organization_id", "club_event_id") where kind in (\'photo\', \'graphic\') and published_at is not null and deleted_at is null',
})
@Index({
  name: 'activities_club_event_files_poster_unique',
  expression:
    'create unique index "activities_club_event_files_poster_unique" on "activities_club_event_files" ("organization_id", "club_event_id") where kind = \'poster\' and deleted_at is null',
})
@Unique({ name: 'activities_club_event_files_attachment_unique', properties: ['attachmentId'] })
@Index({
  name: 'activities_club_event_files_org_event_kind_idx',
  properties: ['organizationId', 'clubEventId', 'kind'],
})
@Index({ name: 'activities_club_event_files_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ClubEventFile extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'funderName'
    | 'position'
    | 'description'
    | 'peopleConfirmedAt'
    | 'peopleConfirmedByPersonId'
    | 'publishedAt'
    | 'publishedByPersonId'

  @Property({ name: 'club_event_id', type: 'uuid' })
  clubEventId!: string

  @Property({ name: 'attachment_id', type: 'uuid' })
  attachmentId!: string

  /** `poster` | `funder_logo`. */
  @Property({ name: 'kind', type: 'varchar', length: 16 })
  kind!: ClubEventFileKind

  /** The funder's name (2–120), the logo's alternative text; null for the poster. */
  @Property({ name: 'funder_name', type: 'text', nullable: true })
  funderName?: string | null

  @Property({ name: 'file_name', type: 'text' })
  fileName!: string

  @Property({ name: 'mime_type', type: 'text' })
  mimeType!: string

  @Property({ name: 'file_size', type: 'int' })
  fileSize!: number

  /** The logos' and the pictures' upload order, 0-based; 0 for the poster. */
  @Property({ name: 'position', type: 'int', default: 0 })
  position: number = 0

  /** A picture's description (2–200), its alternative text; null for the poster and the logos. */
  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  /** When a manager confirmed the marks of a photo, or that a graphic shows nobody (REQ-I03); a mark change clears it. */
  @Property({ name: 'people_confirmed_at', type: Date, nullable: true })
  peopleConfirmedAt?: Date | null

  @Property({ name: 'people_confirmed_by_person_id', type: 'uuid', nullable: true })
  peopleConfirmedByPersonId?: string | null

  /** When a manager published the picture (staff's intention; public only under BR-I01). */
  @Property({ name: 'published_at', type: Date, nullable: true })
  publishedAt?: Date | null

  @Property({ name: 'published_by_person_id', type: 'uuid', nullable: true })
  publishedByPersonId?: string | null
}

/**
 * A person marked on a photo of a club event (event photos spec DD-I03, *Data Models* →
 * `activities_club_event_file_people`; #872): a club person by id (no relation to `people`), never shown publicly.
 * The marks of a photo are replaced as a set by `activities.club_event_files.set_people` (the command log keeps the
 * set before), and are deleted with their picture.
 */
@Entity({ tableName: 'activities_club_event_file_people' })
@Unique({ name: 'activities_club_event_file_people_unique', properties: ['fileId', 'personId'] })
@Index({ name: 'activities_club_event_file_people_org_person_idx', properties: ['organizationId', 'personId'] })
@Index({ name: 'activities_club_event_file_people_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ClubEventFilePerson {
  [OptionalProps]?: 'createdAt' | 'createdByPersonId'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'file_id', type: 'uuid' })
  fileId!: string

  @Property({ name: 'person_id', type: 'uuid' })
  personId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'created_by_person_id', type: 'uuid', nullable: true })
  createdByPersonId?: string | null
}

/**
 * A session — one occurrence of an activity (club spec glossary *Session*, *Data Models* → `activities_occurrences`):
 * its slot `occurrence_date` (the club-zone day the series generated it for; a moved session keeps its slot), its
 * instants, place, coach and status. `is_detached` marks a session moved or edited by hand: a series change never
 * touches it again (DD-10, DD-G03). `needs_reschedule` marks a session the daily generator created over a conflict it
 * could not refuse. `group_id` and `section_id` repeat the activity's, so the record scope filters sessions without a
 * join. The partial unique index keeps one live generated session per slot, so a retried generator creates nothing.
 */
@Entity({ tableName: 'activities_occurrences' })
@Check({
  name: 'activities_occurrences_place_or_venue',
  expression: '(place_id IS NOT NULL) <> (venue_name IS NOT NULL)',
})
@Check({
  name: 'activities_occurrences_venue_address_with_name',
  expression: 'venue_address IS NULL OR venue_name IS NOT NULL',
})
@Check({
  name: 'activities_occurrences_score_pair',
  expression:
    '(score_home IS NULL) = (score_away IS NULL) AND (score_home IS NULL OR score_home BETWEEN 0 AND 99) AND (score_away IS NULL OR score_away BETWEEN 0 AND 99)',
})
@Index({
  name: 'activities_occurrences_slot_unique',
  expression:
    'create unique index "activities_occurrences_slot_unique" on "activities_occurrences" ("activity_id", "occurrence_date") where deleted_at is null and is_detached = false',
})
@Index({ name: 'activities_occurrences_org_place_start_idx', properties: ['organizationId', 'placeId', 'startAt'] })
@Index({
  name: 'activities_occurrences_org_coach_start_idx',
  properties: ['organizationId', 'coachPersonId', 'startAt'],
})
@Index({ name: 'activities_occurrences_org_status_start_idx', properties: ['organizationId', 'status', 'startAt'] })
@Index({ name: 'activities_occurrences_org_group_start_idx', properties: ['organizationId', 'groupId', 'startAt'] })
@Index({ name: 'activities_occurrences_org_activity_idx', properties: ['organizationId', 'activityId'] })
@Index({ name: 'activities_occurrences_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Occurrence extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'coachPersonId'
    | 'status'
    | 'cancelReason'
    | 'isDetached'
    | 'needsReschedule'
    | 'gatheringMinutesBefore'
    | 'confirmByMinutesBefore'
    | 'venueName'
    | 'venueAddress'
    | 'scoreHome'
    | 'scoreAway'
    | 'resultNote'

  @Property({ name: 'activity_id', type: 'uuid' })
  activityId!: string

  @Property({ name: 'group_id', type: 'uuid' })
  groupId!: string

  @Property({ name: 'section_id', type: 'uuid' })
  sectionId!: string

  /** `YYYY-MM-DD`: the series slot (club-zone date). */
  @Property({ name: 'occurrence_date', type: 'date' })
  occurrenceDate!: string

  @Property({ name: 'start_at', type: Date })
  startAt!: Date

  @Property({ name: 'end_at', type: Date })
  endAt!: Date

  /** The club place; null only at a typed venue, which no place's schedule shows (REQ-A08). */
  @Property({ name: 'place_id', type: 'uuid', nullable: true })
  placeId!: string | null

  /** The typed venue copied from its one-off activity (REQ-A08, DD-A03); exactly one of a place and a venue. */
  @Property({ name: 'venue_name', type: 'text', nullable: true })
  venueName?: string | null

  @Property({ name: 'venue_address', type: 'text', nullable: true })
  venueAddress?: string | null

  @Property({ name: 'coach_person_id', type: 'uuid', nullable: true })
  coachPersonId?: string | null

  @Property({ name: 'status', type: 'text', default: 'planned' })
  status: OccurrenceStatus = 'planned'

  @Property({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string | null

  @Property({ name: 'is_detached', type: 'boolean', default: false })
  isDetached: boolean = false

  @Property({ name: 'needs_reschedule', type: 'boolean', default: false })
  needsReschedule: boolean = false

  /**
   * The session's gathering time in minutes before `start_at` (DD-43): copied from the activity by the planner,
   * overridden by a session edit; read as the instant `gatheringAt`, so a moved session keeps its offset.
   */
  @Property({ name: 'gathering_minutes_before', type: 'integer', nullable: true })
  gatheringMinutesBefore?: number | null

  /**
   * The session's declaration deadline in minutes before `start_at` (REQ-A07, DD-A01): copied from the activity by
   * the planner, set by a session edit, kept when the session moves; read as the instant `confirmBy`.
   */
  @Property({ name: 'confirm_by_minutes_before', type: 'integer', nullable: true })
  confirmByMinutesBefore?: number | null

  /**
   * The score of a match or sparring (REQ-A15, Q-A21; migration C): the club's team first ("home") unless the activity
   * is away; both or neither, 0–99 (check `activities_occurrences_score_pair`), with an optional note.
   */
  @Property({ name: 'score_home', type: 'smallint', nullable: true })
  scoreHome?: number | null

  @Property({ name: 'score_away', type: 'smallint', nullable: true })
  scoreAway?: number | null

  @Property({ name: 'result_note', type: 'text', nullable: true })
  resultNote?: string | null
}

/**
 * The declaration and the actual attendance of one participant for one session (club spec glossary *Declaration*,
 * *Actual attendance*, *Data Models* → `activities_attendances`; REQ-007; #32): `declared` with who declared it and
 * when, `declaration_status` (`final`, or `pending_guardian` until the guardian decides or `pending_until` passes and
 * the policy's `timeout_outcome` applies — the two columns the expiry job needs without re-resolving the policy), the
 * guardian's decision instant, and — from #33 — the actual attendance with who marked it. One live row per session
 * and person (partial unique index; the declare command upserts it). `occurrence_id` and `person_id` are scalar ids.
 */
@Entity({ tableName: 'activities_attendances' })
@Index({
  name: 'activities_attendances_occurrence_person_unique',
  expression:
    'create unique index "activities_attendances_occurrence_person_unique" on "activities_attendances" ("occurrence_id", "person_id") where deleted_at is null',
})
@Index({ name: 'activities_attendances_org_occurrence_idx', properties: ['organizationId', 'occurrenceId'] })
@Index({ name: 'activities_attendances_org_person_idx', properties: ['organizationId', 'personId'] })
@Index({
  name: 'activities_attendances_org_status_pending_idx',
  properties: ['organizationId', 'declarationStatus', 'pendingUntil'],
})
@Index({ name: 'activities_attendances_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Attendance extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'declared'
    | 'declaredByPersonId'
    | 'declaredAt'
    | 'declarationStatus'
    | 'guardianDecidedAt'
    | 'pendingUntil'
    | 'timeoutOutcome'
    | 'actual'
    | 'markedByPersonId'
    | 'markedAsRole'
    | 'source'

  @Property({ name: 'occurrence_id', type: 'uuid' })
  occurrenceId!: string

  @Property({ name: 'person_id', type: 'uuid' })
  personId!: string

  /** `yes` / `no` / `unknown`. */
  @Property({ name: 'declared', type: 'text', default: 'unknown' })
  declared: Declared = 'unknown'

  @Property({ name: 'declared_by_person_id', type: 'uuid', nullable: true })
  declaredByPersonId?: string | null

  @Property({ name: 'declared_at', type: Date, nullable: true })
  declaredAt?: Date | null

  /** `final` / `pending_guardian` / `rejected_by_guardian` (`lib/policy.ts` `declarationTransitions`). */
  @Property({ name: 'declaration_status', type: 'text', default: 'final' })
  declarationStatus: DeclarationStatus = 'final'

  @Property({ name: 'guardian_decided_at', type: Date, nullable: true })
  guardianDecidedAt?: Date | null

  /** The instant a `pending_guardian` declaration expires (declared at + the policy's `confirm_timeout_hours`). */
  @Property({ name: 'pending_until', type: Date, nullable: true })
  pendingUntil?: Date | null

  /** The policy's `default_after_timeout` copied at declaration time: `declared` → final, `rejected` → rejected. */
  @Property({ name: 'timeout_outcome', type: 'text', nullable: true })
  timeoutOutcome?: TimeoutDefault | null

  /** `present` / `absent` / `late`; null until the coach checks the session off (#33). */
  @Property({ name: 'actual', type: 'text', nullable: true })
  actual?: ActualAttendance | null

  @Property({ name: 'marked_by_person_id', type: 'uuid', nullable: true })
  markedByPersonId?: string | null

  @Property({ name: 'marked_as_role', type: 'text', nullable: true })
  markedAsRole?: string | null

  /** `app` (a member), `link` (REQ-017), `staff`. */
  @Property({ name: 'source', type: 'text', default: 'app' })
  source: DeclarationSource = 'app'
}

/**
 * Who declares for a minor with an account, per scope (club spec glossary *Declaration policy*, *Data Models* →
 * `activities_attendance_policies`; D-006; #32): `club`, `group` (with `group_id`), `away_trip` or `activity_type`
 * (with `activity_type`); the mode, the confirmation limit and what applies after it. One live row per scope, group
 * and type (partial unique index over the coalesced keys); the defaults are seeded by `setup.ts`. What is declared is
 * the club setting `declaration_kinds`, not a policy (D-026).
 */
@Entity({ tableName: 'activities_attendance_policies' })
@Index({
  name: 'activities_attendance_policies_scope_unique',
  expression:
    'create unique index "activities_attendance_policies_scope_unique" on "activities_attendance_policies" ("organization_id", "scope", coalesce("group_id"::text, \'\'), coalesce("activity_type", \'\')) where deleted_at is null',
})
@Index({ name: 'activities_attendance_policies_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class AttendancePolicy extends ScopedEntityBase {
  [OptionalProps]?:
    ScopedEntityOptionalProps | 'groupId' | 'activityType' | 'confirmTimeoutHours' | 'defaultAfterTimeout'

  /** `club` / `group` / `away_trip` / `activity_type`. */
  @Property({ name: 'scope', type: 'text' })
  scope!: PolicyScope

  /** A `groups` group id for the `group` scope (scalar). */
  @Property({ name: 'group_id', type: 'uuid', nullable: true })
  groupId?: string | null

  @Property({ name: 'activity_type', type: 'text', nullable: true })
  activityType?: ActivityType | null

  /** `immediate` / `guardian_confirm` / `guardian_only`. */
  @Property({ name: 'minor_declaration_mode', type: 'text' })
  minorDeclarationMode!: MinorDeclarationMode

  @Property({ name: 'confirm_timeout_hours', type: 'integer', default: 24 })
  confirmTimeoutHours: number = 24

  /** `declared` / `rejected`. */
  @Property({ name: 'default_after_timeout', type: 'text', default: 'declared' })
  defaultAfterTimeout: TimeoutDefault = 'declared'
}

/**
 * One read of guardian contacts by a coach (club spec *Data Models* → `activities_contact_access_log`, REQ-037, DD-39;
 * foundation II P-27, P-28; #34): who read, in which role, for which session and which guardians, and why — ids only,
 * never the phone or e-mail read. Append-only: written by `auditedRead` and committed before the contacts are returned;
 * the `foundation` guard refuses an update or a delete (409 `append_only`).
 */
@Entity({ tableName: 'activities_contact_access_log' })
@Index({
  name: 'activities_contact_access_log_org_occurrence_created_idx',
  properties: ['organizationId', 'occurrenceId', 'createdAt'],
})
@Index({ name: 'activities_contact_access_log_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ContactAccessLog extends AppendOnlyEntityBase {
  [OptionalProps]?: AppendOnlyEntityOptionalProps

  @Property({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string

  /** The acting role of the read (`coach`). */
  @Property({ name: 'acting_role', type: 'text' })
  actingRole!: string

  @Property({ name: 'occurrence_id', type: 'uuid' })
  occurrenceId!: string

  /** `people:person`. */
  @Property({ name: 'resource_kind', type: 'text' })
  resourceKind!: string

  /** The guardians whose contacts the read returned (may be empty). */
  @Property({ name: 'resource_ids', type: 'text[]', columnType: 'uuid[]' })
  resourceIds!: string[]

  /** `coach_contacts`. */
  @Property({ name: 'purpose', type: 'text' })
  purpose!: string
}

/**
 * One change of a session's coach (club spec glossary *Substitution*, *Data Models* → `activities_substitution_entries`,
 * DD-12, REQ-008; E06-S13 #95): the assigned coach reported an absence (`absence_reported`, the session is left without
 * a coach), the coordinator or administrator assigned a substitute (`substitute_assigned`) or gave the session back to
 * its own coach (`coach_restored`). The previous and the new coach, who decided it and in which role, and an optional
 * reason (encrypted, `encryption.ts`). Append-only: the `foundation` guard refuses an update or a delete (409
 * `append_only`); a correction is a new entry. `occurrence_id` and the person ids are scalar ids.
 */
@Entity({ tableName: 'activities_substitution_entries' })
@Index({ name: 'activities_substitution_entries_org_occurrence_idx', properties: ['organizationId', 'occurrenceId'] })
@Index({ name: 'activities_substitution_entries_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class SubstitutionEntry extends AppendOnlyEntityBase {
  [OptionalProps]?: AppendOnlyEntityOptionalProps | 'previousCoachPersonId' | 'newCoachPersonId' | 'reason'

  @Property({ name: 'occurrence_id', type: 'uuid' })
  occurrenceId!: string

  @Property({ name: 'previous_coach_person_id', type: 'uuid', nullable: true })
  previousCoachPersonId?: string | null

  @Property({ name: 'new_coach_person_id', type: 'uuid', nullable: true })
  newCoachPersonId?: string | null

  /** `absence_reported` / `substitute_assigned` / `coach_restored`. */
  @Property({ name: 'kind', type: 'text' })
  kind!: SubstitutionKind

  @Property({ name: 'reason', type: 'text', nullable: true })
  reason?: string | null

  @Property({ name: 'decided_by_person_id', type: 'uuid' })
  decidedByPersonId!: string

  /** The role the decision was taken in (`coach`, `coordinator`, `club_admin`). */
  @Property({ name: 'acting_role', type: 'text' })
  actingRole!: string
}

const declarationTokenColumns = tokenLinkColumns({ use: 'until_expiry' })

/**
 * A personal declaration link (club spec REQ-017, *Data Models* → `activities_declaration_tokens`; foundation P-10,
 * DD-35): the hash of the raw token (the raw token exists only in the e-mail), the person it was sent to — a guardian
 * of participants of the session or a participant — and the session. Usable until `expires_at` (the end of the session
 * at the latest) any number of times (`used_count`, `last_used_at`); never edited. What the link may declare is not
 * stored: each redemption recomputes the person's current grants. `guardian_person_id` and `occurrence_id` are scalar
 * ids.
 */
@Entity({ tableName: 'activities_declaration_tokens' })
@Index({ name: 'activities_declaration_tokens_org_occurrence_idx', properties: ['organizationId', 'occurrenceId'] })
@Index({ name: 'activities_declaration_tokens_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class DeclarationToken extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'usedCount' | 'lastUsedAt'

  @Property(declarationTokenColumns.tokenHash)
  tokenHash!: string

  @Property(declarationTokenColumns.expiresAt)
  expiresAt!: Date

  @Property(declarationTokenColumns.usedCount)
  usedCount: number = 0

  @Property(declarationTokenColumns.lastUsedAt)
  lastUsedAt?: Date | null

  /** The person the link was sent to (`people_persons`): a guardian of participants, or a participant. */
  @Property({ name: 'guardian_person_id', type: 'uuid' })
  guardianPersonId!: string

  @Property({ name: 'occurrence_id', type: 'uuid' })
  occurrenceId!: string
}
