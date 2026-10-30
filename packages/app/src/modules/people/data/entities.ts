import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import {
  ScopedEntityBase,
  consentColumn,
  decorateScopedEntityBase,
  validFromColumn,
  validToColumn,
  type ScopedEntityOptionalProps,
} from '@vereino/db'
import type { GuardianRelation, StoredConsents } from '../lib/people-rules'

decorateScopedEntityBase({ PrimaryKey, Property })

/**
 * A person of the club (club spec *Data Models* → `people_persons`). Phase A1 (#38) holds the columns accounts and
 * roles need; #26 (E02-S02) adds `phone` and `notes`; #27 (E02-S03) adds the guardian's two consents
 * `share_contact_with_coaches_at` (REQ-037, DD-39) and `share_presence_with_guardians_at` (REQ-006), each set when
 * given and null when never given or withdrawn (P-08); #28 adds the import's `external_id` with its lookup hash. The
 * photo and `publish_name_consent_at` (#29) are deferred by the product owner. `first_name`, `last_name`, `email`, `phone`, `notes` and `pesel` are encrypted
 * (`encryption.ts`); `pesel_hash` is the deterministic lookup hash the platform fills.
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
  name: 'people_persons_org_external_id_hash_unique',
  expression:
    'create unique index "people_persons_org_external_id_hash_unique" on "people_persons" ("organization_id", "external_id_hash") where deleted_at is null and external_id_hash is not null',
})
@Index({
  name: 'people_persons_org_user_unique',
  expression:
    'create unique index "people_persons_org_user_unique" on "people_persons" ("organization_id", "user_id") where deleted_at is null and user_id is not null',
})
export class Person extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'preferredLocale'
    | 'birthDate'
    | 'email'
    | 'phone'
    | 'notes'
    | 'pesel'
    | 'peselHash'
    | 'userId'
    | 'shareContactWithCoachesAt'
    | 'sharePresenceWithGuardiansAt'
    | 'externalId'
    | 'externalIdHash'

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

  @Property({ name: 'phone', type: 'text', nullable: true })
  phone?: string | null

  /** Internal notes of the club about the person (encrypted; never listed). */
  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'pesel', type: 'text', nullable: true })
  pesel?: string | null

  @Property({ name: 'pesel_hash', type: 'text', nullable: true })
  peselHash?: string | null

  /** The `auth:user` of the person's account (at most one per person). */
  @Property({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null

  /** A guardian's consent to show their phone and e-mail to the coaches of their wards' groups (REQ-037). */
  @Property(consentColumn('share_contact_with_coaches'))
  shareContactWithCoachesAt?: Date | null

  /** A guardian's consent to show their wards' names on other guardians' session views (REQ-006). */
  @Property(consentColumn('share_presence_with_guardians'))
  sharePresenceWithGuardiansAt?: Date | null

  /** An identifier from an import file for a person without a PESEL (REQ-036, #28); encrypted. */
  @Property({ name: 'external_id', type: 'text', nullable: true })
  externalId?: string | null

  /** The deterministic lookup hash of `external_id` the platform fills (duplicates, import matching). */
  @Property({ name: 'external_id_hash', type: 'text', nullable: true })
  externalIdHash?: string | null
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
 * A legal guardianship guardian → ward for a period (club spec → `people_guardianships`): the relation, the primary
 * payer flag and the consents (`{ regulations, image, trips }`, each `{ granted, at, by_person_id }`; personal data,
 * not encrypted, club spec *Data Models*). Ended through `valid_to`, never deleted by the UI. At most one primary
 * payer per ward at a time: the commands refuse overlapping periods under the ward's row lock, and the partial unique
 * index backs the open-ended case.
 */
@Entity({ tableName: 'people_guardianships' })
@Index({ name: 'people_guardianships_org_ward_idx', properties: ['organizationId', 'wardPersonId'] })
@Index({ name: 'people_guardianships_org_guardian_idx', properties: ['organizationId', 'guardianPersonId'] })
@Index({ name: 'people_guardianships_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({
  name: 'people_guardianships_org_ward_primary_payer_unique',
  expression:
    'create unique index "people_guardianships_org_ward_primary_payer_unique" on "people_guardianships" ("organization_id", "ward_person_id") where is_primary_payer and deleted_at is null and valid_to is null',
})
export class Guardianship extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'validTo' | 'relation' | 'isPrimaryPayer' | 'consents'

  @Property({ name: 'guardian_person_id', type: 'uuid' })
  guardianPersonId!: string

  @Property({ name: 'ward_person_id', type: 'uuid' })
  wardPersonId!: string

  /** `parent` | `grandparent` | `legal_guardian` | `other`. */
  @Property({ name: 'relation', type: 'text', default: 'parent' })
  relation: GuardianRelation = 'parent'

  @Property({ name: 'is_primary_payer', type: 'boolean', default: false })
  isPrimaryPayer: boolean = false

  /** `StoredConsents` (`lib/people-rules.ts`); written only through the P-08 transitions. */
  @Property({ name: 'consents', type: 'json', defaultRaw: `'{}'::jsonb` })
  consents: StoredConsents = {}

  @Property(validFromColumn())
  validFrom!: string

  @Property(validToColumn())
  validTo?: string | null
}

/**
 * A bulk import of people and families from a CSV or XLSX file (club spec *Data Models* → `people_imports`, DD-38;
 * #28). The file lives in the private `attachments` partition; the rows are staged in `people_import_rows`. A
 * committed import is never deleted; its file and rows are purged 30 days after the commit or the cancellation
 * (`people:purge-import-rows`), which sets `purged_at`.
 */
@Entity({ tableName: 'people_imports' })
@Index({ name: 'people_imports_org_created_idx', properties: ['organizationId', 'createdAt'] })
@Index({ name: 'people_imports_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({ name: 'people_imports_org_status_purged_idx', properties: ['organizationId', 'status', 'purgedAt'] })
export class PersonImport extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'fileAttachmentId'
    | 'committedAt'
    | 'committedByPersonId'
    | 'cancelledAt'
    | 'purgedAt'
    | 'summary'

  /** The uploaded file in the private `attachments` partition; null once purged. */
  @Property({ name: 'file_attachment_id', type: 'uuid', nullable: true })
  fileAttachmentId?: string | null

  /** `csv` | `xlsx`, read from the file's bytes. */
  @Property({ name: 'file_format', type: 'text' })
  fileFormat!: 'csv' | 'xlsx'

  /** `{ header, fields, date1904 }`: the header names and the chosen columns, never a cell value. */
  @Property({ name: 'mapping', type: 'json' })
  mapping!: StoredImportMapping

  /** `previewed` | `committed` | `cancelled`. */
  @Property({ name: 'status', type: 'text' })
  status!: 'previewed' | 'committed' | 'cancelled'

  @Property({ name: 'row_count', type: 'integer' })
  rowCount!: number

  /** The club administrator's person who uploaded the file. */
  @Property({ name: 'created_by_person_id', type: 'uuid' })
  createdByPersonId!: string

  @Property({ name: 'committed_at', type: Date, nullable: true })
  committedAt?: Date | null

  /** The club administrator's person who committed the import. */
  @Property({ name: 'committed_by_person_id', type: 'uuid', nullable: true })
  committedByPersonId?: string | null

  @Property({ name: 'cancelled_at', type: Date, nullable: true })
  cancelledAt?: Date | null

  /** When the file and the staged rows were purged (30 days after the commit or the cancellation). */
  @Property({ name: 'purged_at', type: Date, nullable: true })
  purgedAt?: Date | null

  /** Counts per classification; after the commit also what it created, updated, linked and skipped. */
  @Property({ name: 'summary', type: 'json', defaultRaw: `'{}'::jsonb` })
  summary: ImportSummary = {}
}

export type StoredImportMapping = {
  header: string[]
  fields: Partial<Record<string, number>>
  date1904: boolean
}

export type ImportSummary = {
  new?: number
  matched?: number
  review?: number
  error?: number
  created?: number
  updated?: number
  linked?: number
  skipped?: number
  membershipsPending?: number
}

/**
 * A staged row of an import (club spec → `people_import_rows`): its classification, the administrator's decision
 * and the problem's column (never the cell value). `raw` holds the row's normalized values as encrypted JSON text
 * (names, PESEL, contacts; the platform decrypts fields to strings, so the column is `text`, not `jsonb`).
 * `group_name` and `membership_status` keep a committed row's group for the `groups` membership hook (D-026): the
 * purge job clears such a row's `raw` but keeps the row until the hook picks it up.
 */
@Entity({ tableName: 'people_import_rows' })
@Unique({ name: 'people_import_rows_org_import_row_unique', properties: ['organizationId', 'importId', 'rowNo'] })
@Index({ name: 'people_import_rows_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({
  name: 'people_import_rows_org_import_class_idx',
  properties: ['organizationId', 'importId', 'classification'],
})
export class PersonImportRow extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'raw'
    | 'matchedPersonId'
    | 'decision'
    | 'decisionPersonId'
    | 'errorCode'
    | 'errorColumn'
    | 'reviewReason'
    | 'groupName'
    | 'membershipStatus'
    | 'committedAt'
    | 'result'

  @Property({ name: 'import_id', type: 'uuid' })
  importId!: string

  @Property({ name: 'row_no', type: 'integer' })
  rowNo!: number

  /** Encrypted JSON of the row's normalized values (`NormalizedImportRow`); null once purged. */
  @Property({ name: 'raw', type: 'text', nullable: true })
  raw?: string | null

  /** `new` | `matched` | `review` | `error`. */
  @Property({ name: 'classification', type: 'text' })
  classification!: 'new' | 'matched' | 'review' | 'error'

  @Property({ name: 'matched_person_id', type: 'uuid', nullable: true })
  matchedPersonId?: string | null

  /** `match` | `create` | `skip`; null = no decision. */
  @Property({ name: 'decision', type: 'text', nullable: true })
  decision?: 'match' | 'create' | 'skip' | null

  /** The existing person a `match` decision names. */
  @Property({ name: 'decision_person_id', type: 'uuid', nullable: true })
  decisionPersonId?: string | null

  @Property({ name: 'error_code', type: 'text', nullable: true })
  errorCode?: string | null

  /** The header of the column with the problem — never the cell value. */
  @Property({ name: 'error_column', type: 'text', nullable: true })
  errorColumn?: string | null

  /** `identifier_missing` for a `review` row. */
  @Property({ name: 'review_reason', type: 'text', nullable: true })
  reviewReason?: string | null

  /** The group label of a committed row, kept for the `groups` membership hook (D-026). */
  @Property({ name: 'group_name', type: 'text', nullable: true })
  groupName?: string | null

  /** `groups_not_enabled` while the row's membership waits for the `groups` hook; null otherwise. */
  @Property({ name: 'membership_status', type: 'text', nullable: true })
  membershipStatus?: string | null

  /** When the commit wrote the row (a retried commit skips it). */
  @Property({ name: 'committed_at', type: Date, nullable: true })
  committedAt?: Date | null

  /** The ids the commit wrote for the row (ids only). */
  @Property({ name: 'result', type: 'json', nullable: true })
  result?: ImportRowResult | null
}

export type ImportRowResult = {
  participantPersonId: string | null
  personIds: string[]
  createdPersonIds: string[]
  updatedPersonIds: string[]
  guardianshipIds: string[]
}
