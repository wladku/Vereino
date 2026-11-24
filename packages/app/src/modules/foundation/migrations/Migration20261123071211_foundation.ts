import { Migration } from '@mikro-orm/migrations'

export class Migration20261123071211_foundation extends Migration {
  override name = 'Migration20261123071211'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "foundation_club_jobs" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "job_key" text not null, "next_due_at" timestamptz null, "lease_until" timestamptz null, "last_started_at" timestamptz null, "last_finished_at" timestamptz null, "last_error" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`,
    )
    this.addSql(`create index "foundation_club_jobs_key_due_idx" on "foundation_club_jobs" ("job_key", "next_due_at");`)
    this.addSql(
      `create unique index "foundation_club_jobs_scope_key_unique" on "foundation_club_jobs" ("tenant_id", "organization_id", "job_key");`,
    )
  }
}
