import { Migration } from '@mikro-orm/migrations'

// Issue #86 (UX parity spec phase 3, REQ-U03, DD-U06; approved by the owner on 2026-11-05): a place's regulations text
// and its files (photos and the one regulations PDF). Generated with `yarn db:generate`. Both changes are additive —
// a nullable column and a new table — so the previous release ignores them (S14.6). The partial unique index is built
// with the new, empty table, so it needs no concurrent build; `lock_timeout` is set for the DDL on the existing
// `club_core_places` table (S5.4).
export class Migration20261106055958_club_core extends Migration {
  override name = 'Migration20261106055958'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `create table "club_core_place_files" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "place_id" uuid not null, "attachment_id" uuid not null, "kind" varchar(16) not null, "position" int not null default 0, "file_name" text not null, "mime_type" text not null, "file_size" int not null, primary key ("id"));`,
    )
    this.addSql(
      `create unique index "club_core_place_files_regulations_unique" on "club_core_place_files" ("organization_id", "place_id") where kind = 'regulations' and deleted_at is null;`,
    )
    this.addSql(
      `create index "club_core_place_files_tenant_org_idx" on "club_core_place_files" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "club_core_place_files_org_place_kind_idx" on "club_core_place_files" ("organization_id", "place_id", "kind");`,
    )
    this.addSql(
      `alter table "club_core_place_files" add constraint "club_core_place_files_attachment_unique" unique ("attachment_id");`,
    )
    this.addSql(`alter table "club_core_places" add "regulations_text" text null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`alter table "club_core_places" drop column if exists "regulations_text";`)
    this.addSql(`drop table if exists "club_core_place_files";`)
  }
}
