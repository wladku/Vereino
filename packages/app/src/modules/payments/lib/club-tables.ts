// The tables this module holds for a club (many clubs spec phase 4, REQ-M06, DD-M09; #632): `club_core export-club`
// exports and `club_core delete-club` deletes every row of the club's tenant in them, through the contributor the
// module registers in `di.ts`. A new table with a `tenant_id` column is added here, or both commands refuse to run.
export const PAYMENTS_CLUB_TABLES: readonly string[] = [
  'payments_fees',
  'payments_discount_rules',
  'payments_charges',
  'payments_payments',
  'payments_cash_handovers',
  'payments_checkouts',
  'payments_charge_generations',
  'payments_settings',
  'payments_order_campaigns',
  'payments_order_products',
  'payments_orders',
  'payments_order_lines',
  'payments_payer_refs',
  'payments_bank_imports',
  'payments_bank_transactions',
  'payments_order_links',
]
