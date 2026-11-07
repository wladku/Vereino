import { Migration } from '@mikro-orm/migrations'

// Issue #96 (club spec *Data Models* → `club_core_contracts`, DD-09; approved by the owner on 2026-11-05): the club's
// contracts — a coach contract carries the rates of the club's settlement model as encrypted JSON text in `terms`.
// Generated with `yarn db:generate`. A new, empty table with its indexes: nothing existing is locked or rewritten, and
// the previous release ignores it (S14.6). `down()` written by hand.
export class Migration20261107084915_club_core extends Migration {
  override name = 'Migration20261107084915'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "club_core_contracts" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "party_type" text not null, "party_id" uuid not null, "kind" text not null, "valid_from" date not null, "valid_to" date null, "terms" text null, primary key ("id"));`,
    )
    this.addSql(
      `create index "club_core_contracts_tenant_org_idx" on "club_core_contracts" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "club_core_contracts_party_idx" on "club_core_contracts" ("organization_id", "party_type", "party_id", "kind");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "club_core_contracts";`)
  }
}
