import { Migration } from '@mikro-orm/migrations'

// Issue #683 (training outlines spec phase 2, E24-S03; the module `training` and its migrations approved by the product
// owner on 2026-11-24 on #671): the outlines of the new `training` module and the authors' terms table phase 4 writes.
// Generated with `yarn db:generate` against a throwaway database; new tables only, so no lock on existing tables.
// `down()` is hand-written.
export class Migration20261125055558_training extends Migration {
  override name = 'Migration20261125055558'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "training_outlines" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "author_person_id" uuid not null, "section_id" uuid null, "group_id" uuid null, "activity_id" uuid null, "occurrence_id" uuid null, "source_outline_id" uuid null, "origin_entry_id" uuid null, "origin_credit" jsonb null, "language" text not null, "topic" text not null, "goal" text not null, "specific_goals" text not null, "age_category" text not null, "duration_minutes" int not null, "players_count" int null, "equipment" text not null, "parts" jsonb not null, "published_entry_id" uuid null, "published_visibility" text null, primary key ("id"));`,
    )
    this.addSql(
      `create index "training_outlines_tenant_org_idx" on "training_outlines" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "training_outlines_org_source_idx" on "training_outlines" ("organization_id", "source_outline_id");`,
    )
    this.addSql(
      `create index "training_outlines_org_group_idx" on "training_outlines" ("organization_id", "group_id");`,
    )
    this.addSql(
      `create index "training_outlines_org_author_idx" on "training_outlines" ("organization_id", "author_person_id");`,
    )
    this.addSql(
      `create unique index "training_outlines_org_activity_unique" on "training_outlines" ("organization_id", "activity_id") where deleted_at is null and activity_id is not null;`,
    )
    this.addSql(
      `create unique index "training_outlines_org_occurrence_unique" on "training_outlines" ("organization_id", "occurrence_id") where deleted_at is null and occurrence_id is not null;`,
    )

    this.addSql(
      `create table "training_authors" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "person_id" uuid not null, "terms_version" text not null, "accepted_at" timestamptz not null, primary key ("id"));`,
    )
    this.addSql(
      `create index "training_authors_tenant_org_idx" on "training_authors" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create unique index "training_authors_org_person_terms_unique" on "training_authors" ("organization_id", "person_id", "terms_version") where deleted_at is null;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "training_authors" cascade;`)
    this.addSql(`drop table if exists "training_outlines" cascade;`)
  }
}
