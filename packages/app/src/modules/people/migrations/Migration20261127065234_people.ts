import { Migration } from '@mikro-orm/migrations'

export class Migration20261127065234_people extends Migration {
  override name = 'Migration20261127065234'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "people_consent_events" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "subject_person_id" uuid not null, "guardianship_id" uuid null, "kind" varchar(24) not null, "granted" boolean not null, "by_person_id" uuid null, "by_role" varchar(16) not null, "note" text null, "wording_changed_at" timestamptz null, "wording_sha256" char(64) not null, "locale" varchar(8) not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "people_consent_events_tenant_org_idx" on "people_consent_events" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "people_consent_events_org_subject_kind_created_idx" on "people_consent_events" ("organization_id", "subject_person_id", "kind", "created_at");`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "people_consent_events" cascade;`)
  }
}
