import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import {
  ScopedEntityBase,
  decorateScopedEntityBase,
  validFromColumn,
  validToColumn,
  type ScopedEntityOptionalProps,
} from '@vereino/db'
import type { GroupKind, MembershipRole } from '../lib/groups-rules'

decorateScopedEntityBase({ PrimaryKey, Property })

/**
 * A season of `team` groups (club spec *Data Models* → `groups_seasons`, REQ-019): a name unique in the club among the
 * live seasons, and its first and last day. A club-wide dictionary; a season named by a live group is not deleted.
 */
@Entity({ tableName: 'groups_seasons' })
@Index({ name: 'groups_seasons_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({
  name: 'groups_seasons_org_name_unique',
  expression:
    'create unique index "groups_seasons_org_name_unique" on "groups_seasons" ("organization_id", "name") where deleted_at is null',
})
export class Season extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps

  @Property({ name: 'name', type: 'text' })
  name!: string

  /** `YYYY-MM-DD`. */
  @Property({ name: 'starts_on', type: 'date' })
  startsOn!: string

  /** `YYYY-MM-DD`, not before `starts_on`. */
  @Property({ name: 'ends_on', type: 'date' })
  endsOn!: string
}

/**
 * A group of one section (club spec glossary *Group*, DD-03a, REQ-004): `team` or `class_group`, equal in every rule;
 * only a `team` carries the team fields `league` and `season_id` (`age_category_entry_id` waits for the `dictionaries`
 * module; the public fields arrive with the public page story #29). `section_id` is a `club_core` section id (scalar,
 * no cross-module relation).
 */
@Entity({ tableName: 'groups_groups' })
@Index({ name: 'groups_groups_org_section_active_idx', properties: ['organizationId', 'sectionId', 'isActive'] })
@Index({ name: 'groups_groups_org_season_idx', properties: ['organizationId', 'seasonId'] })
@Index({ name: 'groups_groups_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Group extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'league' | 'seasonId' | 'description' | 'isActive'

  @Property({ name: 'section_id', type: 'uuid' })
  sectionId!: string

  @Property({ name: 'name', type: 'text' })
  name!: string

  @Property({ name: 'kind', type: 'text' })
  kind!: GroupKind

  /** Team only. */
  @Property({ name: 'league', type: 'text', nullable: true })
  league?: string | null

  /** Team only: a season of this module. */
  @Property({ name: 'season_id', type: 'uuid', nullable: true })
  seasonId?: string | null

  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true
}

/**
 * A person's membership of a group for a period (club spec glossary *Membership*): `participant`, `coach` or
 * `assistant`; ended through `valid_to`, so the roster keeps its history. An overlapping live membership of the same
 * person, group and role is refused (409) under the group's row lock; the partial unique index backs the open-ended
 * case. `person_id` is a `people` person id (scalar, no cross-module relation).
 */
@Entity({ tableName: 'groups_memberships' })
@Index({ name: 'groups_memberships_org_group_valid_to_idx', properties: ['organizationId', 'groupId', 'validTo'] })
@Index({ name: 'groups_memberships_org_person_idx', properties: ['organizationId', 'personId'] })
@Index({ name: 'groups_memberships_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({
  name: 'groups_memberships_org_open_unique',
  expression:
    'create unique index "groups_memberships_org_open_unique" on "groups_memberships" ("organization_id", "group_id", "person_id", "role") where deleted_at is null and valid_to is null',
})
export class GroupMembership extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'validTo'

  @Property({ name: 'group_id', type: 'uuid' })
  groupId!: string

  @Property({ name: 'person_id', type: 'uuid' })
  personId!: string

  @Property({ name: 'role', type: 'text' })
  role!: MembershipRole

  @Property(validFromColumn())
  validFrom!: string

  @Property(validToColumn())
  validTo?: string | null
}

/**
 * An external team — an opponent or a tournament guest (club spec *Data Models* → `groups_external_teams`, REQ-020):
 * its name, the club it plays for, an optional `club_core` institution id, a contact (encrypted, `encryption.ts`) and
 * notes. A club-wide dictionary with soft delete.
 */
@Entity({ tableName: 'groups_external_teams' })
@Index({ name: 'groups_external_teams_org_name_idx', properties: ['organizationId', 'name'] })
@Index({ name: 'groups_external_teams_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ExternalTeam extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'clubName' | 'institutionId' | 'contact' | 'notes'

  @Property({ name: 'name', type: 'text' })
  name!: string

  @Property({ name: 'club_name', type: 'text', nullable: true })
  clubName?: string | null

  @Property({ name: 'institution_id', type: 'uuid', nullable: true })
  institutionId?: string | null

  @Property({ name: 'contact', type: 'text', nullable: true })
  contact?: string | null

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null
}
