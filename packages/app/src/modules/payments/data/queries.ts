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
