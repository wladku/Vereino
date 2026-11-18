import { Migration } from '@mikro-orm/migrations'

// Migration C of the groups and activities parity spec (REQ-A15, Q-A21, #272; approved on #252 on 2026-11-16): the
// score of a match or sparring on the session — `score_home`, `score_away` (both or neither, 0–99, the named check
// `activities_occurrences_score_pair`) and `result_note`. Nullable columns that every existing row satisfies, ignored
// by the previous release.
export class Migration20261117214826_activities extends Migration {
  override name = 'Migration20261117214826'

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "activities_occurrences" add "score_home" smallint null, add "score_away" smallint null, add "result_note" text null;`,
    )
    this.addSql(
      `alter table "activities_occurrences" add constraint "activities_occurrences_score_pair" check ((score_home IS NULL) = (score_away IS NULL) AND (score_home IS NULL OR score_home BETWEEN 0 AND 99) AND (score_away IS NULL OR score_away BETWEEN 0 AND 99));`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "activities_occurrences" drop constraint if exists "activities_occurrences_score_pair";`)
    this.addSql(
      `alter table "activities_occurrences" drop column if exists "score_home", drop column if exists "score_away", drop column if exists "result_note";`,
    )
  }
}
