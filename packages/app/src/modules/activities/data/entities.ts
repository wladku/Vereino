import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import {
  AppendOnlyEntityBase,
  ScopedEntityBase,
  decorateAppendOnlyEntityBase,
  decorateScopedEntityBase,
  type AppendOnlyEntityOptionalProps,
  type ScopedEntityOptionalProps,
} from '@vereino/db'
import type { ActivityType, OccurrenceStatus } from '../lib/activities-rules'
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
