import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import {
  ScopedEntityBase,
  decorateScopedEntityBase,
  validFromColumn,
  validToColumn,
  type ScopedEntityOptionalProps,
} from '@vereino/db'

decorateScopedEntityBase({ PrimaryKey, Property })

/**
 * A person of the club (club spec *Data Models* → `people_persons`). Phase A1 holds the columns issue #38 needs;
 * #26 (E02-S02) adds phone, photo, notes, the consents and the external id. `first_name`, `last_name`, `email` and
 * `pesel` are encrypted (`encryption.ts`); `pesel_hash` is the deterministic lookup hash the platform fills.
 */
@Entity({ tableName: 'people_persons' })
@Index({ name: 'people_persons_org_last_name_idx', properties: ['organizationId', 'lastName'] })
@Index({ name: 'people_persons_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({
  name: 'people_persons_org_pesel_hash_unique',
  expression:
    'create unique index "people_persons_org_pesel_hash_unique" on "people_persons" ("organization_id", "pesel_hash") where deleted_at is null and pesel_hash is not null',
})
@Index({
  name: 'people_persons_org_user_unique',
  expression:
    'create unique index "people_persons_org_user_unique" on "people_persons" ("organization_id", "user_id") where deleted_at is null and user_id is not null',
})
export class Person extends ScopedEntityBase {
  [OptionalProps]?:
    ScopedEntityOptionalProps | 'preferredLocale' | 'birthDate' | 'email' | 'pesel' | 'peselHash' | 'userId'

  @Property({ name: 'first_name', type: 'text' })
  firstName!: string

  @Property({ name: 'last_name', type: 'text' })
  lastName!: string

  /** BCP 47; null = the club's default locale. */
  @Property({ name: 'preferred_locale', type: 'text', nullable: true })
  preferredLocale?: string | null

  /** `YYYY-MM-DD`. */
  @Property({ name: 'birth_date', type: 'date', nullable: true })
  birthDate?: string | null

  @Property({ name: 'email', type: 'text', nullable: true })
  email?: string | null

  @Property({ name: 'pesel', type: 'text', nullable: true })
  pesel?: string | null

  @Property({ name: 'pesel_hash', type: 'text', nullable: true })
  peselHash?: string | null

  /** The `auth:user` of the person's account (at most one per person). */
  @Property({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null
}

/**
 * A staff role of a person for a period (club spec → `people_role_assignments`, DD-33). Phase 1 roles:
 * `club_admin`, `coordinator` (with `section_id`), `coach`; ended through `valid_to`, never deleted by the UI.
 */
@Entity({ tableName: 'people_role_assignments' })
@Index({ name: 'people_role_assignments_org_person_role_idx', properties: ['organizationId', 'personId', 'role'] })
@Index({ name: 'people_role_assignments_org_section_idx', properties: ['organizationId', 'sectionId'] })
@Index({ name: 'people_role_assignments_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class RoleAssignment extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'sectionId' | 'validTo'

  @Property({ name: 'person_id', type: 'uuid' })
  personId!: string

  @Property({ name: 'role', type: 'text' })
  role!: 'club_admin' | 'coordinator' | 'coach'

  /** `club_core` section id (scalar; no cross-module relation). Required for a coordinator. */
  @Property({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId?: string | null

  @Property(validFromColumn())
  validFrom!: string

  @Property(validToColumn())
  validTo?: string | null
}

/**
 * A legal guardianship guardian → ward for a period (club spec → `people_guardianships`). Phase A1 holds what the
 * payer rule and the guardian grant need; #27 adds `relation`, `is_primary_payer` and the consents.
 */
@Entity({ tableName: 'people_guardianships' })
@Index({ name: 'people_guardianships_org_ward_idx', properties: ['organizationId', 'wardPersonId'] })
@Index({ name: 'people_guardianships_org_guardian_idx', properties: ['organizationId', 'guardianPersonId'] })
@Index({ name: 'people_guardianships_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Guardianship extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'validTo'

  @Property({ name: 'guardian_person_id', type: 'uuid' })
  guardianPersonId!: string

  @Property({ name: 'ward_person_id', type: 'uuid' })
  wardPersonId!: string

  @Property(validFromColumn())
  validFrom!: string

  @Property(validToColumn())
  validTo?: string | null
}
