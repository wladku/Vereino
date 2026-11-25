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
