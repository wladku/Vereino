import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { createClub, mercato, type Club } from '../_fixtures/club'

// Issue #525 (engineering standards S9.5; `docs/compliance/retention.md` row R9): the daily purge jobs
// `activities:purge-declaration-links`, `payments:purge-order-links` and `facilities:purge-rental-links` delete the
// link tokens that expired, were used (single-use rental links) or were deleted at least 30 days ago, and keep a valid
// link and one dead for less (the negative case). Each run touches only its own club, a second run deletes nothing,
// and `set-up-club` registers each job once a day. The rows are seeded directly: the job reads only the scope and the
// time columns, and the tables hold scalar ids without foreign keys.
test.describe.configure({ timeout: 300_000 })

const DAY = 24 * 60 * 60 * 1000

type Table = 'activities_declaration_tokens' | 'payments_order_links' | 'facilities_rental_links'

type Seed = { label: string; expiresAt: Date; usedAt?: Date | null; deletedAt?: Date | null }

function scopeArgs(club: Club): string[] {
  return ['--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]
}

async function seedLink(club: Club, table: Table, seed: Seed): Promise<string> {
  const id = randomUUID()
  const scope = [id, club.tenant.organizationId, club.tenant.tenantId, randomBytes(32).toString('hex')]
  const times = [seed.expiresAt, seed.deletedAt ?? null]
  await withClient(async (client) => {
    if (table === 'facilities_rental_links') {
      await client.query(
        `insert into facilities_rental_links
           (id, organization_id, tenant_id, token_hash, expires_at, deleted_at, used_at, rental_id, purpose,
            created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'cancel', now(), now())`,
        [...scope, ...times, seed.usedAt ?? null, randomUUID()],
      )
    } else if (table === 'payments_order_links') {
      await client.query(
        `insert into payments_order_links
           (id, organization_id, tenant_id, token_hash, expires_at, deleted_at, campaign_id, guardian_person_id,
            created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
        [...scope, ...times, randomUUID(), randomUUID()],
      )
    } else {
      await client.query(
        `insert into activities_declaration_tokens
           (id, organization_id, tenant_id, token_hash, expires_at, deleted_at, guardian_person_id, occurrence_id,
            created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
        [...scope, ...times, randomUUID(), randomUUID()],
      )
    }
  })
  return id
}

async function remainingIds(table: Table, ids: string[]): Promise<string[]> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(`select id from ${table} where id = any($1::uuid[])`, [ids])
    return rows.map((row) => row.id).sort()
  })
}

async function dropRows(table: Table, organizationIds: string[]): Promise<void> {
  await withClient(async (client) => {
    await client.query(`delete from ${table} where organization_id = any($1::uuid[])`, [organizationIds])
  })
}

async function purgeSchedules(organizationId: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ name: string; schedule_type: string; schedule_value: string }>(
      `select name, schedule_type, schedule_value from scheduled_jobs
        where organization_id = $1 and name like '%:purge-%-links' and deleted_at is null order by name`,
      [organizationId],
    )
    return rows
  })
}

const JOBS: Array<{ table: Table; cli: string[] }> = [
  { table: 'activities_declaration_tokens', cli: ['activities', 'purge-declaration-links'] },
  { table: 'payments_order_links', cli: ['payments', 'run-job', '--job', 'purge-order-links'] },
  { table: 'facilities_rental_links', cli: ['facilities', 'purge-rental-links'] },
]

test('ISSUE-525 the daily jobs delete link tokens dead for 30 days and keep the others', async ({ request }) => {
  const club = await createClub(request, 'issue-525-purge')
  const other = await createClub(request, 'issue-525-other')
  const orgIds = [club.tenant.organizationId, other.tenant.organizationId]
  try {
    const now = new Date()
    const ago = (days: number) => new Date(now.getTime() - days * DAY)
    const ahead = (days: number) => new Date(now.getTime() + days * DAY)

    for (const { table, cli } of JOBS) {
      const singleUse = table === 'facilities_rental_links'
      const dead = [
        await seedLink(club, table, { label: 'expired 31 days ago', expiresAt: ago(31) }),
        await seedLink(club, table, { label: 'deleted 31 days ago', expiresAt: ahead(5), deletedAt: ago(31) }),
        ...(singleUse
          ? [await seedLink(club, table, { label: 'used 31 days ago', expiresAt: ahead(5), usedAt: ago(31) })]
          : []),
      ]
      const kept = [
        await seedLink(club, table, { label: 'valid', expiresAt: ahead(5) }),
        await seedLink(club, table, { label: 'expired 29 days ago', expiresAt: ago(29) }),
        ...(singleUse
          ? [await seedLink(club, table, { label: 'used 29 days ago', expiresAt: ahead(5), usedAt: ago(29) })]
          : []),
      ]
      const otherClub = await seedLink(other, table, { label: 'other club, expired 31 days ago', expiresAt: ago(31) })

      const first = mercato([...cli, ...scopeArgs(club), '--now', now.toISOString()]) as { deleted: number }
      expect(first.deleted, table).toBe(dead.length)
      expect(await remainingIds(table, [...dead, ...kept, otherClub]), table).toEqual([...kept, otherClub].sort())

      const second = mercato([...cli, ...scopeArgs(club), '--now', now.toISOString()]) as { deleted: number }
      expect(second.deleted, table).toBe(0)

      // The other club's own run deletes its dead link.
      expect((mercato([...cli, ...scopeArgs(other), '--now', now.toISOString()]) as { deleted: number }).deleted).toBe(
        1,
      )
      expect(await remainingIds(table, [otherClub]), table).toEqual([])
    }

    // `set-up-club` registers each purge once a day, once, however often it runs.
    for (let run = 0; run < 2; run += 1) {
      expect(mercato(['activities', 'set-up-club', ...scopeArgs(club)])).toMatchObject({
        schedules: { purgeDeclarationLinks: true },
      })
      expect(mercato(['payments', 'set-up-club', ...scopeArgs(club)])).toMatchObject({
        schedules: { 'purge-order-links': true },
      })
      expect(mercato(['facilities', 'set-up-club', ...scopeArgs(club)])).toMatchObject({
        schedules: { 'purge-rental-links': true },
      })
    }
    expect(await purgeSchedules(club.tenant.organizationId)).toEqual([
      { name: 'activities:purge-declaration-links', schedule_type: 'interval', schedule_value: '1d' },
      { name: 'facilities:purge-rental-links', schedule_type: 'interval', schedule_value: '1d' },
      { name: 'payments:purge-order-links', schedule_type: 'interval', schedule_value: '1d' },
    ])
  } finally {
    for (const { table } of JOBS) await dropRows(table, orgIds)
    await club.cleanup()
    await other.cleanup()
  }
})
