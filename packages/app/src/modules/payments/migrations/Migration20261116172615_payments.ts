import { Migration } from '@mikro-orm/migrations'

// Migration A1 of the payments parity spec (#291, approved on #254): the payer institution, the payee institution and
// the encrypted typed-in renter's name of a rental charge. Transactional; its indexes are migration A2
// (`Migration20261116172616_payments`), built `CONCURRENTLY` outside a transaction.
export class Migration20261116172615_payments extends Migration {
  override name = 'Migration20261116172615'

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "payments_charges" add "payer_institution_id" uuid null, add "payee_institution_id" uuid null, add "payer_label" text null;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "payments_charges" drop column "payer_institution_id", drop column "payee_institution_id", drop column "payer_label";`,
    )
  }
}
