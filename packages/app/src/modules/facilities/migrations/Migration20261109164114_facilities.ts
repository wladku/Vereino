import { Migration } from '@mikro-orm/migrations'

// Issue #125 (facilities spec phase 5 step 6; the `facilities_*` migrations of phase 5 approved by the product owner on
// 2026-11-05 on #119): the language an online requester's e-mails are sent in (the request form's locale). Generated
// with `yarn db:generate` against an unreachable database; one nullable column, no rewrite of existing rows.
export class Migration20261109164114_facilities extends Migration {
  override name = 'Migration20261109164114'

  override up(): void | Promise<void> {
    this.addSql(`alter table "facilities_rentals" add "contact_locale" text null;`)
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "facilities_rentals" drop column "contact_locale";`)
  }
}
