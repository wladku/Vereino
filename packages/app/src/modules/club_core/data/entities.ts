import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import { ScopedEntityBase, decorateScopedEntityBase, type ScopedEntityOptionalProps } from '@vereino/db'

decorateScopedEntityBase({ PrimaryKey, Property })

/**
 * The club's settings, one row per organization (club spec DD-02, DD-37; foundation spec DD-F16). A club without a
 * row reads the defaults of `lib/settings.ts`; the first update creates the row. The public slug, publication, logo,
 * public description and contact phone are phase 1 steps 6–7 (#29): `public_slug` is globally unique, because the
 * sessionless public pages resolve the club from it (DD-23, DD-35) — its unique index backs that one lookup.
 */
@Entity({ tableName: 'club_core_club_settings' })
@Unique({ name: 'club_core_club_settings_organization_unique', properties: ['organizationId'] })
@Index({ name: 'club_core_club_settings_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({
  name: 'club_core_club_settings_public_slug_unique',
  expression:
    'create unique index "club_core_club_settings_public_slug_unique" on "club_core_club_settings" ("public_slug") where public_slug is not null',
})
export class ClubSettings extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'ownAccountMinAge'
    | 'defaultLocale'
    | 'timezone'
    | 'shortName'
    | 'currency'
    | 'declarationKinds'
    | 'onlineFeeMode'
    | 'onlineFeePercent'
    | 'onlineFeeFixed'
    | 'coachSettlementModel'
    | 'showCalledUpChildren'
    | 'orderSalesDocument'
    | 'publicSlug'
    | 'contactPhone'
    | 'logoAttachmentId'
    | 'publicDescription'
    | 'publication'

  @Property({ name: 'own_account_min_age', type: 'int', default: 16 })
  ownAccountMinAge: number = 16

  @Property({ name: 'default_locale', type: 'text', default: 'pl' })
  defaultLocale: string = 'pl'

  @Property({ name: 'timezone', type: 'text', default: 'Europe/Warsaw' })
  timezone: string = 'Europe/Warsaw'

  @Property({ name: 'short_name', type: 'text', nullable: true })
  shortName?: string | null

  /** ISO 4217. */
  @Property({ name: 'currency', type: 'text', default: 'PLN' })
  currency: string = 'PLN'

  /** Declaration kind per activity type (D-026); keys and values validated by `lib/settings.ts`. */
  @Property({
    name: 'declaration_kinds',
    type: 'json',
    defaultRaw: `'{"training":"absence_only","match":"confirm","sparring":"confirm","tournament":"confirm","camp":"confirm","other":"confirm"}'::jsonb`,
  })
  declarationKinds: Record<string, string> = {
    training: 'absence_only',
    match: 'confirm',
    sparring: 'confirm',
    tournament: 'confirm',
    camp: 'confirm',
    other: 'confirm',
  }

  /** `club_pays` | `payer_pays`. */
  @Property({ name: 'online_fee_mode', type: 'text', default: 'club_pays' })
  onlineFeeMode: string = 'club_pays'

  /** Percentage with two decimals; the driver returns the decimal as a string. */
  @Property({ name: 'online_fee_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  onlineFeePercent: string = '0'

  /** Minor units (grosz). */
  @Property({ name: 'online_fee_fixed', type: 'int', default: 0 })
  onlineFeeFixed: number = 0

  /** `units_per_contract` | `fixed_base_adjusted`; stored only (no settlement logic before A05). */
  @Property({ name: 'coach_settlement_model', type: 'text', default: 'units_per_contract' })
  coachSettlementModel: string = 'units_per_contract'

  /** `none` | `consented`. */
  @Property({ name: 'show_called_up_children', type: 'text', default: 'none' })
  showCalledUpChildren: string = 'none'

  /** `none` | `receipt` | `invoice`; only `none` is accepted in 1.0. */
  @Property({ name: 'order_sales_document', type: 'text', default: 'none' })
  orderSalesDocument: string = 'none'

  /** Globally unique slug of the public pages `/p/{publicSlug}` (DD-23); null until the club chooses one. */
  @Property({ name: 'public_slug', type: 'text', nullable: true })
  publicSlug?: string | null

  /** The club's phone shown with the `contact` block. */
  @Property({ name: 'contact_phone', type: 'text', nullable: true })
  contactPhone?: string | null

  /** The club logo in `attachments` (glossary *Logo*); null shows the initial of the club name. */
  @Property({ name: 'logo_attachment_id', type: 'uuid', nullable: true })
  logoAttachmentId?: string | null

  /** The club description on its public page. */
  @Property({ name: 'public_description', type: 'text', nullable: true })
  publicDescription?: string | null

  /** `{ enabled, blocks }` (glossary *Publication*); everything off by default, read through `lib/publication.ts`. */
  @Property({
    name: 'publication',
    type: 'json',
    defaultRaw: `'{"enabled":false,"blocks":{"description_schedule":false,"conditions":false,"prices":false,"coaches":false,"materials":false,"contact":false,"places_calendar":false,"online_requests":false}}'::jsonb`,
  })
  publication: Record<string, unknown> = {
    enabled: false,
    blocks: {
      description_schedule: false,
      conditions: false,
      prices: false,
      coaches: false,
      materials: false,
      contact: false,
      places_calendar: false,
      online_requests: false,
    },
  }
}

/**
 * A section of the club (club spec glossary *Section*): the unit of the coordinator's scope. Coordinators are
 * `people` role assignments (`coordinator` + `section_id`), never stored here. The logo and the public fields are
 * phase 1 steps 6–7 (#29): the contact fields are business contact details written for publication, never read from
 * the people records; the slug is unique among the club's live sections.
 */
@Entity({ tableName: 'club_core_sections' })
@Index({ name: 'club_core_sections_org_active_idx', properties: ['organizationId', 'isActive'] })
@Index({ name: 'club_core_sections_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Index({
  name: 'club_core_sections_org_public_slug_unique',
  expression:
    'create unique index "club_core_sections_org_public_slug_unique" on "club_core_sections" ("organization_id", "public_slug") where deleted_at is null and public_slug is not null',
})
export class Section extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'description'
    | 'isActive'
    | 'logoAttachmentId'
    | 'isPublic'
    | 'publicSlug'
    | 'publicDescription'
    | 'publicConditions'
    | 'publicContactName'
    | 'publicContactEmail'
    | 'publicContactPhone'

  @Property({ name: 'name', type: 'text' })
  name!: string

  /** Internal description (not published). */
  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  /** The section's own logo in `attachments`; null shows the club logo (glossary *Logo*). */
  @Property({ name: 'logo_attachment_id', type: 'uuid', nullable: true })
  logoAttachmentId?: string | null

  /** Shown on the public pages (DD-29); requires `public_slug`. */
  @Property({ name: 'is_public', type: 'boolean', default: false })
  isPublic: boolean = false

  /** Slug of `/p/{club}/sections/{publicSlug}`, unique among the club's live sections. */
  @Property({ name: 'public_slug', type: 'text', nullable: true })
  publicSlug?: string | null

  /** Plain text of the public description (the description half of the `description_schedule` block). */
  @Property({ name: 'public_description', type: 'text', nullable: true })
  publicDescription?: string | null

  /** Terms of the section (age, attire, declaration) — the `conditions` block. */
  @Property({ name: 'public_conditions', type: 'text', nullable: true })
  publicConditions?: string | null

  @Property({ name: 'public_contact_name', type: 'text', nullable: true })
  publicContactName?: string | null

  @Property({ name: 'public_contact_email', type: 'text', nullable: true })
  publicContactEmail?: string | null

  @Property({ name: 'public_contact_phone', type: 'text', nullable: true })
  publicContactPhone?: string | null
}

/**
 * A file of a section's materials (club spec glossary *Section*: "public materials = attachments attached to the
 * section with a public flag"; #29). The bytes live in `attachments` (`attachment_id`, private partition); this row is
 * the module-owned link the platform's `persistLink` writes in the upload transaction, with the public flag and a
 * snapshot of the file's name, type and size, so lists never read the attachment rows.
 */
@Entity({ tableName: 'club_core_section_materials' })
@Index({ name: 'club_core_section_materials_org_section_idx', properties: ['organizationId', 'sectionId'] })
@Index({ name: 'club_core_section_materials_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
@Unique({ name: 'club_core_section_materials_attachment_unique', properties: ['attachmentId'] })
export class SectionMaterial extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps | 'isPublic'

  @Property({ name: 'section_id', type: 'uuid' })
  sectionId!: string

  @Property({ name: 'attachment_id', type: 'uuid' })
  attachmentId!: string

  @Property({ name: 'title', type: 'text' })
  title!: string

  @Property({ name: 'file_name', type: 'text' })
  fileName!: string

  @Property({ name: 'mime_type', type: 'text' })
  mimeType!: string

  @Property({ name: 'file_size', type: 'int' })
  fileSize!: number

  /** Downloadable from the public section page while the `materials` block is on. */
  @Property({ name: 'is_public', type: 'boolean', default: false })
  isPublic: boolean = false
}

/**
 * A node of the place hierarchy (club spec glossary *Place*): a complex groups pitches, halls, locker rooms and
 * pools; sessions and bookings point to a leaf. `contacts` is the encrypted JSON text of `{ role, name, phone }[]`
 * (`encryption.ts`). The public slug and schedule, online requests, regulations and opening hours arrive later.
 */
@Entity({ tableName: 'club_core_places' })
@Index({ name: 'club_core_places_org_parent_idx', properties: ['organizationId', 'parentPlaceId'] })
@Index({ name: 'club_core_places_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Place extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'parentPlaceId'
    | 'surface'
    | 'address'
    | 'geoLat'
    | 'geoLng'
    | 'description'
    | 'ownerInstitutionId'
    | 'managedByClub'
    | 'isExternal'
    | 'rentedByClub'
    | 'capacityGroups'
    | 'contacts'
    | 'isActive'

  /** Scalar id of the parent place in the same organization; null for a root. */
  @Property({ name: 'parent_place_id', type: 'uuid', nullable: true })
  parentPlaceId?: string | null

  /** `complex` | `pitch` | `multi_pitch` | `hall` | `locker_room` | `pool` | `other`. */
  @Property({ name: 'kind', type: 'text' })
  kind!: string

  @Property({ name: 'name', type: 'text' })
  name!: string

  @Property({ name: 'surface', type: 'text', nullable: true })
  surface?: string | null

  @Property({ name: 'address', type: 'text', nullable: true })
  address?: string | null

  @Property({ name: 'geo_lat', type: 'decimal', precision: 9, scale: 6, nullable: true })
  geoLat?: string | null

  @Property({ name: 'geo_lng', type: 'decimal', precision: 9, scale: 6, nullable: true })
  geoLng?: string | null

  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  /** Scalar id of the owning institution (`club_core_institutions`). */
  @Property({ name: 'owner_institution_id', type: 'uuid', nullable: true })
  ownerInstitutionId?: string | null

  @Property({ name: 'managed_by_club', type: 'boolean', default: false })
  managedByClub: boolean = false

  @Property({ name: 'is_external', type: 'boolean', default: false })
  isExternal: boolean = false

  /** The club rents the place from its owner and checks the owner's bill (REQ-038). */
  @Property({ name: 'rented_by_club', type: 'boolean', default: false })
  rentedByClub: boolean = false

  /** How many club groups can use the place at the same time (≥ 1). */
  @Property({ name: 'capacity_groups', type: 'int', default: 1 })
  capacityGroups: number = 1

  /** Encrypted JSON text of the contacts. */
  @Property({ name: 'contacts', type: 'text', nullable: true })
  contacts?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true
}

/**
 * An institution the club works with (club spec *Data Models* → `club_core_institutions`): the municipality that
 * owns a complex, a school, a sponsor. Contact, bank account and notes are encrypted (`encryption.ts`).
 */
@Entity({ tableName: 'club_core_institutions' })
@Index({ name: 'club_core_institutions_org_type_idx', properties: ['organizationId', 'type'] })
@Index({ name: 'club_core_institutions_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Institution extends ScopedEntityBase {
  [OptionalProps]?:
    ScopedEntityOptionalProps | 'address' | 'contactName' | 'contactPhone' | 'contactEmail' | 'bankAccount' | 'notes'

  @Property({ name: 'name', type: 'text' })
  name!: string

  /** `municipality` | `school` | `club` | `company` | `sponsor` | `other`. */
  @Property({ name: 'type', type: 'text' })
  type!: string

  @Property({ name: 'address', type: 'text', nullable: true })
  address?: string | null

  @Property({ name: 'contact_name', type: 'text', nullable: true })
  contactName?: string | null

  @Property({ name: 'contact_phone', type: 'text', nullable: true })
  contactPhone?: string | null

  @Property({ name: 'contact_email', type: 'text', nullable: true })
  contactEmail?: string | null

  @Property({ name: 'bank_account', type: 'text', nullable: true })
  bankAccount?: string | null

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null
}
