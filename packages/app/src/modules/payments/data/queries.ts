// Raw SQL of `payments` (engineering standards S5.8: raw SQL lives in a module's data/queries.ts and takes the
// organization explicitly).
import type { EntityManager } from '@mikro-orm/postgresql'

/**
 * Creates the organization's payment settings row with the column defaults when it does not exist yet; a no-op
 * otherwise (`on conflict` on the unique `organization_id`). Runs inside the caller's write transaction.
 */
export async function ensurePaymentsSettingsRow(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
): Promise<void> {
  await em.execute(
    `insert into payments_settings (id, tenant_id, organization_id, created_at, updated_at)
     values (gen_random_uuid(), ?, ?, now(), now())
     on conflict (organization_id) do nothing`,
    [scope.tenantId, scope.organizationId],
  )
}

/**
 * The class name of migration B of the payments parity spec (#301). Its row in `mikro_orm_migrations_payments` dates
 * the arrival of the automatic generation: the first automatic month is the next one (DD-C08, Q-C07).
 */
export const AUTOMATIC_GENERATION_MIGRATION = 'Migration20261118201338'

/**
 * When migration B was applied, or null when neither it nor a later migration is recorded. One deployment-wide row,
 * not tenant data. The lookup takes the earliest migration whose name sorts at or after migration B's (names start
 * with their creation timestamp; `collate "C"` compares them byte by byte): on a deployment that applied migration B
 * that is migration B itself, the stored name possibly carrying the module suffix of the file; after a greenfield
 * rebuild, whose regenerated migrations all carry later names and already contain migration B's columns, it is the
 * first of them, so the automatic generation starts the month after the module was installed instead of never (#405).
 */
export async function automaticGenerationSince(em: EntityManager): Promise<Date | null> {
  const rows = await em.execute<{ executed_at: Date | string | null }[]>(
    `select executed_at from mikro_orm_migrations_payments
      where name collate "C" >= ? order by executed_at asc limit 1`,
    [AUTOMATIC_GENERATION_MIGRATION],
  )
  const value = rows[0]?.executed_at
  return value ? new Date(value) : null
}

/** The advisory-lock key of one club's charge generation (also taken by its undo). */
export function generationLockKey(organizationId: string): string {
  return `payments.charges.generate:${organizationId}`
}

/**
 * Tries to take the club's charge-generation lock until the caller's transaction ends; false when another
 * generation (or its undo) of the club holds it — the caller answers 409 `generation_in_progress` instead of waiting.
 */
export async function tryLockGeneration(em: EntityManager, organizationId: string): Promise<boolean> {
  const rows = await em.execute<{ locked: boolean }[]>(
    'select pg_try_advisory_xact_lock(hashtextextended(?, 0)) as locked',
    [generationLockKey(organizationId)],
  )
  return rows[0]?.locked ?? false
}

/**
 * The charges of the organization with a live payment of `method` that no reversing entry cancelled (the B-21 "Cash
 * payments" perspective, #109). Distinct charge ids; a club has at most a few thousand charges a year.
 */
export async function chargeIdsWithPayment(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  method: string,
): Promise<string[]> {
  const rows = await em.execute<{ charge_id: string }[]>(
    `select distinct p.charge_id
       from payments_payments p
      where p.tenant_id = ? and p.organization_id = ? and p.method = ? and p.deleted_at is null
        and p.reverses_payment_id is null and p.is_overpayment = false
        and not exists (
          select 1 from payments_payments r
           where r.reverses_payment_id = p.id and r.organization_id = p.organization_id and r.deleted_at is null
        )`,
    [scope.tenantId, scope.organizationId, method],
  )
  return rows.map((row) => row.charge_id)
}

/**
 * The live charges of the organization holding an online overpayment "to refund" (Q-049) that its refunds have not
 * covered yet (the B-21 "To refund" perspective and `meta.toRefundCount`, payments parity DD-C10, #296). Distinct
 * charge ids; overpayments are rare.
 */
export async function chargeIdsToRefund(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
): Promise<string[]> {
  const rows = await em.execute<{ charge_id: string }[]>(
    `select distinct p.charge_id
       from payments_payments p
       join payments_charges c
         on c.id = p.charge_id and c.organization_id = p.organization_id and c.deleted_at is null
      where p.tenant_id = ? and p.organization_id = ? and p.method = 'online' and p.is_overpayment = true
        and p.reverses_payment_id is null and p.deleted_at is null
        and p.amount + coalesce((
          select sum(r.amount) from payments_payments r
           where r.reverses_payment_id = p.id and r.organization_id = p.organization_id and r.deleted_at is null
        ), 0) > 0`,
    [scope.tenantId, scope.organizationId],
  )
  return rows.map((row) => row.charge_id)
}

/**
 * Takes the club's receipt-numbering lock until the caller's transaction ends ("Accept cash", #114): two acceptances
 * of one club wait for each other, so the month's highest number read after the lock is never issued twice.
 */
export async function lockReceiptNumbering(em: EntityManager, organizationId: string): Promise<void> {
  await em.execute('select pg_advisory_xact_lock(hashtextextended(?, 0))', [`payments.cash.receipt:${organizationId}`])
}

/**
 * The club's highest receipt number starting with `prefix` (`KP/2026/11/`), or null. Read under
 * `lockReceiptNumbering`; numbers past 999 are longer, so length orders before text.
 */
export async function lastReceiptNumber(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  prefix: string,
): Promise<string | null> {
  const rows = await em.execute<{ receipt_number: string }[]>(
    `select receipt_number
       from payments_payments
      where tenant_id = ? and organization_id = ? and receipt_number like ?
      order by length(receipt_number) desc, receipt_number desc
      limit 1`,
    [scope.tenantId, scope.organizationId, `${prefix}%`],
  )
  return rows[0]?.receipt_number ?? null
}

/**
 * Takes the club's handover-numbering lock until the caller's transaction ends (B-33, #118): two handovers of one club
 * wait for each other, so the month's highest `RG` number read after the lock is never issued twice.
 */
export async function lockHandoverNumbering(em: EntityManager, organizationId: string): Promise<void> {
  await em.execute('select pg_advisory_xact_lock(hashtextextended(?, 0))', [`payments.cash.handover:${organizationId}`])
}

/** The club's highest handover number starting with `prefix` (`RG/2026/11/`), or null; read under the lock. */
export async function lastHandoverNumber(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  prefix: string,
): Promise<string | null> {
  const rows = await em.execute<{ number: string }[]>(
    `select number
       from payments_cash_handovers
      where tenant_id = ? and organization_id = ? and number like ?
      order by length(number) desc, number desc
      limit 1`,
    [scope.tenantId, scope.organizationId, `${prefix}%`],
  )
  return rows[0]?.number ?? null
}

/**
 * Closes the club's `open` campaigns whose orders deadline is before `today` (the `payments:close-order-campaigns`
 * sweep, #115) in one conditional UPDATE, so a campaign the administrator closed meanwhile is not touched twice.
 * Returns the ids it closed.
 */
export async function closeExpiredCampaigns(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  today: string,
): Promise<string[]> {
  const rows = await em.execute<{ id: string }[]>(
    `update payments_order_campaigns
        set status = 'closed', updated_at = now()
      where tenant_id = ? and organization_id = ? and status = 'open' and closes_on < ? and deleted_at is null
      returning id`,
    [scope.tenantId, scope.organizationId, today],
  )
  return rows.map((row) => row.id)
}

/**
 * Takes the club's statement lock until the caller's transaction ends (#113): an import and every decision on a
 * transfer (Confirm, Assign, Undo) wait for each other, so two of them never spread one transfer — or one charge's
 * remaining amount — twice.
 */
export async function lockBankStatements(em: EntityManager, organizationId: string): Promise<void> {
  await em.execute('select pg_advisory_xact_lock(hashtextextended(?, 0))', [`payments.bank:${organizationId}`])
}
