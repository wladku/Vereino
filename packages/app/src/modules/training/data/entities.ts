import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { ScopedEntityBase, decorateScopedEntityBase, type ScopedEntityOptionalProps } from '@vereino/db'
import type { OutlineLanguage, OutlineParts } from '../lib/outline'

decorateScopedEntityBase({ PrimaryKey, Property })

/**
 * A training outline in the PZPN template's minimum content (training outlines spec *Data Models* →
 * `training_outlines`, glossary *Outline*, *Series outline / session copy*; REQ-O06, REQ-O07; #683). An outline with
 * neither `activity_id` nor `occurrence_id` is a coach's own outline ("my outlines"); one with `activity_id` is the
 * series outline of a recurring activity; one with `occurrence_id` belongs to one session — a session copy of a series
 * outline or of an own outline carries `source_outline_id`. At most one live outline per session and one series outline
 * per activity (BR-O2). `author_person_id`, `section_id`, `group_id`, `activity_id` and `occurrence_id` are scalar ids
 * of `people`, `club_core`, `groups` and `activities` records. Free text is not encrypted: an outline is coaching
 * content, not personal data. The library columns (`origin_*`, `published_*`) are written from phase 4 (E24-S05).
 */
@Entity({ tableName: 'training_outlines' })
@Index({
  name: 'training_outlines_org_occurrence_unique',
  expression:
    'create unique index "training_outlines_org_occurrence_unique" on "training_outlines" ("organization_id", "occurrence_id") where deleted_at is null and occurrence_id is not null',
})
@Index({
  name: 'training_outlines_org_activity_unique',
  expression:
    'create unique index "training_outlines_org_activity_unique" on "training_outlines" ("organization_id", "activity_id") where deleted_at is null and activity_id is not null',
})
@Index({ name: 'training_outlines_org_author_idx', properties: ['organizationId', 'authorPersonId'] })
@Index({ name: 'training_outlines_org_group_idx', properties: ['organizationId', 'groupId'] })
@Index({ name: 'training_outlines_org_source_idx', properties: ['organizationId', 'sourceOutlineId'] })
@Index({ name: 'training_outlines_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Outline extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'sectionId'
    | 'groupId'
    | 'activityId'
    | 'occurrenceId'
    | 'sourceOutlineId'
    | 'originEntryId'
    | 'originCredit'
    | 'playersCount'
    | 'publishedEntryId'
    | 'publishedVisibility'

  @Property({ name: 'author_person_id', type: 'uuid' })
  authorPersonId!: string

  @Property({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId?: string | null

  @Property({ name: 'group_id', type: 'uuid', nullable: true })
  groupId?: string | null

  @Property({ name: 'activity_id', type: 'uuid', nullable: true })
  activityId?: string | null

  @Property({ name: 'occurrence_id', type: 'uuid', nullable: true })
  occurrenceId?: string | null

  @Property({ name: 'source_outline_id', type: 'uuid', nullable: true })
  sourceOutlineId?: string | null

  @Property({ name: 'origin_entry_id', type: 'uuid', nullable: true })
  originEntryId?: string | null

  @Property({ name: 'origin_credit', type: 'json', nullable: true })
  originCredit?: Record<string, unknown> | null

  @Property({ name: 'language', type: 'text' })
  language!: OutlineLanguage

  @Property({ name: 'topic', type: 'text' })
  topic!: string

  @Property({ name: 'goal', type: 'text' })
  goal!: string

  @Property({ name: 'specific_goals', type: 'text' })
  specificGoals!: string

  @Property({ name: 'age_category', type: 'text' })
  ageCategory!: string

  @Property({ name: 'duration_minutes', type: 'int' })
  durationMinutes!: number

  @Property({ name: 'players_count', type: 'int', nullable: true })
  playersCount?: number | null

  @Property({ name: 'equipment', type: 'text' })
  equipment!: string

  @Property({ name: 'parts', type: 'json' })
  parts!: OutlineParts

  @Property({ name: 'published_entry_id', type: 'uuid', nullable: true })
  publishedEntryId?: string | null

  @Property({ name: 'published_visibility', type: 'text', nullable: true })
  publishedVisibility?: string | null
}

/**
 * The terms an author accepted before the first publication to the library (training outlines spec *Security* →
 * *Public content*): one row per person and terms version. The table ships with phase 2's migration (approved
 * 2026-11-24); phase 4 (E24-S05) writes it.
 */
@Entity({ tableName: 'training_authors' })
@Index({
  name: 'training_authors_org_person_terms_unique',
  expression:
    'create unique index "training_authors_org_person_terms_unique" on "training_authors" ("organization_id", "person_id", "terms_version") where deleted_at is null',
})
@Index({ name: 'training_authors_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class OutlineAuthor extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps

  @Property({ name: 'person_id', type: 'uuid' })
  personId!: string

  @Property({ name: 'terms_version', type: 'text' })
  termsVersion!: string

  @Property({ name: 'accepted_at', type: Date })
  acceptedAt!: Date
}

/**
 * A published snapshot of an outline in the library tenant (training outlines spec *Data Models* →
 * `training_library_entries`, DD-O10, DD-O11; REQ-O11; E24-S05, #685). `tenant_id` and `organization_id` are always the
 * configured library tenant's (never a club's); `source_organization_id` and `source_outline_id` name the club and the
 * outline it was published from, for the publisher's withdrawal and the club's deletion — they never leave the
 * library service. The content is an allow-list copy (no session, group or person ids); `images` are attachments of
 * the library tenant, metadata stripped. `rating_sum`, `rating_count`, `user_count` and `report_count` are aggregates
 * of the rows below, recomputed by every write that changes them.
 */
@Entity({ tableName: 'training_library_entries' })
@Index({
  name: 'training_library_entries_source_unique',
  expression:
    'create unique index "training_library_entries_source_unique" on "training_library_entries" ("tenant_id", "source_organization_id", "source_outline_id") where deleted_at is null',
})
@Index({
  name: 'training_library_entries_listing_idx',
  properties: ['tenantId', 'status', 'visibility', 'ageCategory'],
})
@Index({ name: 'training_library_entries_source_org_idx', properties: ['tenantId', 'sourceOrganizationId'] })
export class LibraryEntry extends ScopedEntityBase {
  [OptionalProps]?:
    ScopedEntityOptionalProps | 'playersCount' | 'ratingSum' | 'ratingCount' | 'userCount' | 'reportCount'

  @Property({ name: 'source_organization_id', type: 'uuid' })
  sourceOrganizationId!: string

  @Property({ name: 'source_outline_id', type: 'uuid' })
  sourceOutlineId!: string

  @Property({ name: 'visibility', type: 'text' })
  visibility!: string

  @Property({ name: 'status', type: 'text', default: 'listed' })
  status!: string

  @Property({ name: 'language', type: 'text' })
  language!: string

  @Property({ name: 'topic', type: 'text' })
  topic!: string

  @Property({ name: 'goal', type: 'text' })
  goal!: string

  @Property({ name: 'specific_goals', type: 'text' })
  specificGoals!: string

  @Property({ name: 'age_category', type: 'text' })
  ageCategory!: string

  @Property({ name: 'duration_minutes', type: 'int' })
  durationMinutes!: number

  @Property({ name: 'players_count', type: 'int', nullable: true })
  playersCount?: number | null

  @Property({ name: 'equipment', type: 'text' })
  equipment!: string

  @Property({ name: 'parts', type: 'json' })
  parts!: Record<string, unknown>

  @Property({ name: 'images', type: 'json' })
  images!: string[]

  @Property({ name: 'credit', type: 'json' })
  credit!: Record<string, unknown>

  @Property({ name: 'licence', type: 'text' })
  licence!: string

  @Property({ name: 'rating_sum', type: 'int', default: 0 })
  ratingSum: number = 0

  @Property({ name: 'rating_count', type: 'int', default: 0 })
  ratingCount: number = 0

  @Property({ name: 'user_count', type: 'int', default: 0 })
  userCount: number = 0

  @Property({ name: 'report_count', type: 'int', default: 0 })
  reportCount: number = 0

  @Property({ name: 'published_at', type: Date })
  publishedAt!: Date
}

/**
 * One rating of an entry (BR-O6, DD-O12): 1–5 stars by one rater key, changeable, only after a use by the same key.
 * `rater_key` is `HMAC(secret, club organization id ‖ person id)` of version `rater_key_version`; the club's
 * organization id counts clubs and finds a leaving club's rows.
 */
@Entity({ tableName: 'training_library_ratings' })
@Index({
  name: 'training_library_ratings_entry_rater_unique',
  expression:
    'create unique index "training_library_ratings_entry_rater_unique" on "training_library_ratings" ("entry_id", "rater_key")',
})
@Index({ name: 'training_library_ratings_rater_org_idx', properties: ['tenantId', 'raterOrganizationId'] })
@Index({ name: 'training_library_ratings_rater_key_idx', properties: ['tenantId', 'raterKey'] })
export class LibraryRating extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps

  @Property({ name: 'entry_id', type: 'uuid' })
  entryId!: string

  @Property({ name: 'rater_key', type: 'text' })
  raterKey!: string

  @Property({ name: 'rater_key_version', type: 'int' })
  raterKeyVersion!: number

  @Property({ name: 'rater_organization_id', type: 'uuid' })
  raterOrganizationId!: string

  @Property({ name: 'stars', type: 'int' })
  stars!: number
}

/**
 * The uses of an entry by one coach (glossary *Use*, DD-O12): a session closed whose outline came from the entry,
 * counted per rater key (`occurrence_count` sessions). A use lets the coach rate the entry.
 */
@Entity({ tableName: 'training_library_uses' })
@Index({
  name: 'training_library_uses_entry_rater_unique',
  expression:
    'create unique index "training_library_uses_entry_rater_unique" on "training_library_uses" ("entry_id", "rater_key")',
})
@Index({ name: 'training_library_uses_rater_org_idx', properties: ['tenantId', 'raterOrganizationId'] })
@Index({ name: 'training_library_uses_rater_key_idx', properties: ['tenantId', 'raterKey'] })
export class LibraryUse extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps

  @Property({ name: 'entry_id', type: 'uuid' })
  entryId!: string

  @Property({ name: 'rater_key', type: 'text' })
  raterKey!: string

  @Property({ name: 'rater_key_version', type: 'int' })
  raterKeyVersion!: number

  @Property({ name: 'rater_organization_id', type: 'uuid' })
  raterOrganizationId!: string

  @Property({ name: 'occurrence_count', type: 'int', default: 1 })
  occurrenceCount: number = 1
}

/**
 * An abuse report of an entry (REQ-O15, DD-O14): one per rater key, from a club (`rater_organization_id`) or from the
 * public page (a hashed client address as the key, no club). Reports from three clubs hide the entry.
 */
@Entity({ tableName: 'training_library_reports' })
@Index({
  name: 'training_library_reports_entry_rater_unique',
  expression:
    'create unique index "training_library_reports_entry_rater_unique" on "training_library_reports" ("entry_id", "rater_key")',
})
@Index({ name: 'training_library_reports_rater_org_idx', properties: ['tenantId', 'raterOrganizationId'] })
@Index({ name: 'training_library_reports_rater_key_idx', properties: ['tenantId', 'raterKey'] })
export class LibraryReport extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'raterOrganizationId' | 'note'

  @Property({ name: 'entry_id', type: 'uuid' })
  entryId!: string

  @Property({ name: 'rater_key', type: 'text' })
  raterKey!: string

  @Property({ name: 'rater_key_version', type: 'int' })
  raterKeyVersion!: number

  @Property({ name: 'rater_organization_id', type: 'uuid', nullable: true })
  raterOrganizationId?: string | null

  @Property({ name: 'reason', type: 'text' })
  reason!: string

  @Property({ name: 'note', type: 'text', nullable: true })
  note?: string | null
}
