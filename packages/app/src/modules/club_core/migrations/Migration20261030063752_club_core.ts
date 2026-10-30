import { Migration } from '@mikro-orm/migrations'

// Issue #29 (club spec phase 1 steps 6–7): the club's public slug, contact phone, logo, public description and
// publication; the section's logo and public fields; the section materials. Generated with `yarn db:generate`; every
// new column on an existing table is nullable or defaulted, `lock_timeout` is set for the DDL on the existing tables
// (S5.4), and `down()` is written by hand (the generated one did not drop the materials table).
export class Migration20261030063752_club_core extends Migration {
  override name = 'Migration20261030063752'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)

    this.addSql(
      `create table "club_core_section_materials" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "section_id" uuid not null, "attachment_id" uuid not null, "title" text not null, "file_name" text not null, "mime_type" text not null, "file_size" int not null, "is_public" boolean not null default false, primary key ("id"));`,
    )
    this.addSql(
      `create index "club_core_section_materials_tenant_org_idx" on "club_core_section_materials" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "club_core_section_materials_org_section_idx" on "club_core_section_materials" ("organization_id", "section_id");`,
    )
    this.addSql(
      `alter table "club_core_section_materials" add constraint "club_core_section_materials_attachment_unique" unique ("attachment_id");`,
    )

    this.addSql(
      `alter table "club_core_club_settings" add "public_slug" text null, add "contact_phone" text null, add "logo_attachment_id" uuid null, add "public_description" text null, add "publication" jsonb not null default '{"enabled":false,"blocks":{"description_schedule":false,"conditions":false,"prices":false,"coaches":false,"materials":false,"contact":false,"places_calendar":false,"online_requests":false}}';`,
    )
    this.addSql(
      `create unique index "club_core_club_settings_public_slug_unique" on "club_core_club_settings" ("public_slug") where public_slug is not null;`,
    )

    this.addSql(
      `alter table "club_core_sections" add "logo_attachment_id" uuid null, add "is_public" boolean not null default false, add "public_slug" text null, add "public_description" text null, add "public_conditions" text null, add "public_contact_name" text null, add "public_contact_email" text null, add "public_contact_phone" text null;`,
    )
    this.addSql(
      `create unique index "club_core_sections_org_public_slug_unique" on "club_core_sections" ("organization_id", "public_slug") where deleted_at is null and public_slug is not null;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`drop index if exists "club_core_sections_org_public_slug_unique";`)
    this.addSql(
      `alter table "club_core_sections" drop column if exists "logo_attachment_id", drop column if exists "is_public", drop column if exists "public_slug", drop column if exists "public_description", drop column if exists "public_conditions", drop column if exists "public_contact_name", drop column if exists "public_contact_email", drop column if exists "public_contact_phone";`,
    )
    this.addSql(`drop index if exists "club_core_club_settings_public_slug_unique";`)
    this.addSql(
      `alter table "club_core_club_settings" drop column if exists "public_slug", drop column if exists "contact_phone", drop column if exists "logo_attachment_id", drop column if exists "public_description", drop column if exists "publication";`,
    )
    this.addSql(`drop table if exists "club_core_section_materials" cascade;`)
  }
}
