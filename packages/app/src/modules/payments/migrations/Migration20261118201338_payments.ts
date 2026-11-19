import { Migration } from '@mikro-orm/migrations'

// Migration B of the payments parity spec (#301, approved on #254): the overdue-reminder marker of a charge and the
// "Automatic charges and reminders" settings (DD-C08, DD-C09). Additive with defaults. Its `executed_at` in
// `mikro_orm_migrations_payments` is the boundary of the first automatically generated month (Q-C07).
export class Migration20261118201338_payments extends Migration {
  override name = 'Migration20261118201338'

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "payments_charges" add "last_reminded_at" timestamptz null, add "reminder_count" int not null default 0;`,
    )

    this.addSql(
      `alter table "payments_settings" add "auto_generate_charges" boolean not null default true, add "generation_day" int not null default 1, add "overdue_reminders" boolean not null default true;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "payments_charges" drop column "last_reminded_at", drop column "reminder_count";`)

    this.addSql(
      `alter table "payments_settings" drop column "auto_generate_charges", drop column "generation_day", drop column "overdue_reminders";`,
    )
  }
}
