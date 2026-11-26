import { Migration } from '@mikro-orm/migrations'

export class Migration20261126061659_club_core extends Migration {
  override name = 'Migration20261126061659'

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "club_core_club_settings" add "application_age_reference_day" text not null default '09-01', add "application_answer_days" smallint not null default 7, add "application_information" text null;`,
    )
    this.addSql(
      `alter table "club_core_club_settings" add constraint "club_core_club_settings_answer_days_check" check (application_answer_days between 1 and 60);`,
    )

    this.addSql(`alter table "club_core_sections" add "accepts_applications" boolean not null default false;`)
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "club_core_club_settings" drop constraint if exists "club_core_club_settings_answer_days_check";`,
    )
    this.addSql(
      `alter table "club_core_club_settings" drop column "application_age_reference_day", drop column "application_answer_days", drop column "application_information";`,
    )

    this.addSql(`alter table "club_core_sections" drop column "accepts_applications";`)
  }
}
