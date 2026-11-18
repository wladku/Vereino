import { Migration } from '@mikro-orm/migrations'

// Issue #306 (E13-S04; people life-cycle spec phase L4, *Data Models*, migration A): `people_persons.left_on` (nullable
// date, the person's last day in the club) with its (`organization_id`, `left_on`) index, and the new table
// `people_departure_requests` with one open request per subject (partial unique index). Approved by the product owner
// on #255 (2026-11-16, item 1 of *Rollout*). Generated with `yarn db:generate` against an unreachable database (never
// applied to a dev or real one); `lock_timeout` added for the DDL on the existing table (S5.4) and `down()` written by
// hand. Additive: the previous release works on the new schema.
export class Migration20261118011306_people extends Migration {
  override name = 'Migration20261118011306'

  override up(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(
      `create table "people_departure_requests" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "batch_id" uuid not null, "subject_person_id" uuid not null, "requested_by_person_id" uuid null, "requester_kind" text not null, "requested_last_day" date null, "erasure_requested" boolean not null default false, "note" text null, "status" text not null default 'open', "decided_by_person_id" uuid null, "decided_at" timestamptz null, "decline_reason" text null, primary key ("id"));`,
    )
    this.addSql(
      `create unique index "people_departure_requests_org_subject_open_unique" on "people_departure_requests" ("organization_id", "subject_person_id") where status = 'open' and deleted_at is null;`,
    )
    this.addSql(
      `create index "people_departure_requests_org_status_created_idx" on "people_departure_requests" ("organization_id", "status", "created_at");`,
    )
    this.addSql(
      `create index "people_departure_requests_org_batch_idx" on "people_departure_requests" ("organization_id", "batch_id");`,
    )
    this.addSql(
      `create index "people_departure_requests_tenant_org_idx" on "people_departure_requests" ("tenant_id", "organization_id");`,
    )

    this.addSql(`alter table "people_persons" add "left_on" date null;`)
    this.addSql(`create index "people_persons_org_left_on_idx" on "people_persons" ("organization_id", "left_on");`)
  }

  override down(): void | Promise<void> {
    this.addSql(`set local lock_timeout = '5s';`)
    this.addSql(`drop index if exists "people_persons_org_left_on_idx";`)
    this.addSql(`alter table "people_persons" drop column if exists "left_on";`)
    this.addSql(`drop table if exists "people_departure_requests" cascade;`)
  }
}
