import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { ScopedEntityBase, decorateScopedEntityBase, type ScopedEntityOptionalProps } from '@vereino/db'
import type { ActivityType, OccurrenceStatus } from '../lib/activities-rules'

decorateScopedEntityBase({ PrimaryKey, Property })

/**
 * An activity of one group (club spec glossary *Activity*, *Data Models* → `activities_activities`, D02, REQ-005): a
 * recurring series (`recurrence_rule`, the foundation II RRULE subset with an `EXDATE` line) or a one-off event (no
 * rule: one session on `starts_on`, REQ-027). `section_id` is the group's section, copied when the activity is written;
 * `group_id`, `default_place_id`, `default_coach_person_id` and the external teams are scalar ids of `groups`,
 * `club_core` and `people` (no cross-module relation). `generated_until` is the last day the generator filled.
 * Attendance, declaration, away-trip, fixture and public-schedule fields arrive with their stories (#32–#34, REQ-039,
 * step 9).
 */
@Entity({ tableName: 'activities_activities' })
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
    | 'description'
    | 'isActive'

  @Property({ name: 'section_id', type: 'uuid' })
  sectionId!: string

  @Property({ name: 'group_id', type: 'uuid' })
  groupId!: string

  @Property({ name: 'name', type: 'text' })
  name!: string

  @Property({ name: 'type', type: 'text' })
  type!: ActivityType

  @Property({ name: 'default_place_id', type: 'uuid' })
  defaultPlaceId!: string

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

  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true
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
    ScopedEntityOptionalProps | 'coachPersonId' | 'status' | 'cancelReason' | 'isDetached' | 'needsReschedule'

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

  @Property({ name: 'place_id', type: 'uuid' })
  placeId!: string

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
}
