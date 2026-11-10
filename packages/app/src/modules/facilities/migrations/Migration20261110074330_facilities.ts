import { Migration } from '@mikro-orm/migrations'

// Issue #126 (facilities spec phase 5 step 7, "attachments via `attachments`"; the `facilities_*` migrations of phase
// 5 approved by the product owner on 2026-11-05 on #119): the link rows of the incident photos. Generated with
// `yarn db:generate` against an unreachable database (never applied to a dev or real one); one new table, no change
// to existing rows; `down()` written by hand.
export class Migration20261110074330_facilities extends Migration {
  override name = 'Migration20261110074330'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "facilities_incident_photos" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "incident_id" uuid not null, "place_id" uuid not null, "attachment_id" uuid not null, "position" int not null default 0, "file_name" text not null, "mime_type" text not null, "file_size" int not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "facilities_incident_photos_tenant_org_idx" on "facilities_incident_photos" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "facilities_incident_photos_org_incident_idx" on "facilities_incident_photos" ("organization_id", "incident_id");`,
    )
    this.addSql(
      `alter table "facilities_incident_photos" add constraint "facilities_incident_photos_attachment_unique" unique ("attachment_id");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "facilities_incident_photos" cascade;`)
  }
}
