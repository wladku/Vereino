import { Migration } from '@mikro-orm/migrations'

export class Migration20261127172542_activities extends Migration {
  override name = 'Migration20261127172542'

  override up(): void | Promise<void> {
    this.addSql(
      `create table "activities_club_event_file_people" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "file_id" uuid not null, "person_id" uuid not null, "created_at" timestamptz not null, "created_by_person_id" uuid null, primary key ("id"));`,
    )
    this.addSql(
      `create index "activities_club_event_file_people_tenant_org_idx" on "activities_club_event_file_people" ("tenant_id", "organization_id");`,
    )
    this.addSql(
      `create index "activities_club_event_file_people_org_person_idx" on "activities_club_event_file_people" ("organization_id", "person_id");`,
    )
    this.addSql(
      `alter table "activities_club_event_file_people" add constraint "activities_club_event_file_people_unique" unique ("file_id", "person_id");`,
    )

    this.addSql(
      `alter table "activities_club_event_files" add "description" text null, add "people_confirmed_at" timestamptz null, add "people_confirmed_by_person_id" uuid null, add "published_at" timestamptz null, add "published_by_person_id" uuid null;`,
    )
    this.addSql(
      `create index "activities_club_event_files_published_pictures_idx" on "activities_club_event_files" ("organization_id", "club_event_id") where kind in ('photo', 'graphic') and published_at is not null and deleted_at is null;`,
    )
    this.addSql(
      `alter table "activities_club_event_files" add constraint "activities_club_event_files_picture_description" check ((kind IN ('photo', 'graphic')) = (description IS NOT NULL));`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "activities_club_event_files_published_pictures_idx";`)
    this.addSql(
      `alter table "activities_club_event_files" drop constraint if exists "activities_club_event_files_picture_description";`,
    )
    this.addSql(
      `alter table "activities_club_event_files" drop column "description", drop column "people_confirmed_at", drop column "people_confirmed_by_person_id", drop column "published_at", drop column "published_by_person_id";`,
    )
    this.addSql(`drop table if exists "activities_club_event_file_people" cascade;`)
  }
}
