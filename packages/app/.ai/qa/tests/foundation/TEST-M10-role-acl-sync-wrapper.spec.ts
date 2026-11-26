import { spawnSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { APP_ROOT, createClub, type Club } from '../_fixtures/club'

// TEST-M10 (many clubs spec DD-M11, REQ-M09, AC-M09; #673): the pre-deploy wrapper `foundation
// sync-role-acls-if-changed` runs the platform's ACL sync over every club's tenant only when the role-feature defaults
// changed since the last successful sync. Run twice with unchanged defaults, the second run skips the sync (a feature
// removed from a club's role stays removed); with a changed stored fingerprint (a release that changed the defaults)
// it syncs every tenant once and the feature is back; `--force` always syncs; an unknown option is a usage error.
test.describe.configure({ timeout: 600_000 })

const HASH_CONFIG = { moduleId: 'foundation', name: 'role_acl_defaults_hash' }
const ROLE = 'vereino_member'

type WrapperRun = {
  exitCode: number | null
  result: { status?: string; reason?: string; hash?: string; previousHash?: string | null } | null
  syncedTenants: string[]
  stderr: string
}

function runWrapper(args: string[] = []): WrapperRun {
  const run = spawnSync('yarn', ['mercato', 'foundation', 'sync-role-acls-if-changed', ...args], {
    cwd: APP_ROOT,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 300_000,
  })
  const lines = run.stdout.split(/\r?\n/)
  // The platform logger may flush its own JSON lines (pg pool) after the result, so pick the line with a `status`.
  const json = [...lines].reverse().find((line) => line.trim().startsWith('{') && line.includes('"status":'))
  const syncedTenants = lines
    .map((line) => /Synced role ACLs for tenant ([0-9a-f-]{36})/.exec(line)?.[1])
    .filter((id): id is string => Boolean(id))
  return {
    exitCode: run.status,
    result: json ? (JSON.parse(json) as WrapperRun['result']) : null,
    syncedTenants,
    stderr: run.stderr,
  }
}

/** Replaces the stored fingerprint, as a release with other role defaults would find it. */
async function storeHash(hash: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `update module_configs set value_json = jsonb_set(value_json::jsonb, '{hash}', to_jsonb($3::text))
        where module_id = $1 and name = $2 and tenant_id is null`,
      [HASH_CONFIG.moduleId, HASH_CONFIG.name, hash],
    )
  })
}

async function tenantIds(): Promise<string[]> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(`select id from tenants where deleted_at is null`)
    return rows.map((row) => row.id)
  })
}

/** The features of the club's role ACL; `drop` removes one of them first. */
async function roleFeatures(club: Club, drop?: string): Promise<string[]> {
  return withClient(async (client) => {
    // Live rows only: Open Mercato 0.10 grants through live ACL rows and soft-deletes duplicates (#498).
    const where = `role_id = (select id from roles where name = $1 and tenant_id = $2 and deleted_at is null) and tenant_id = $2 and deleted_at is null`
    if (drop) {
      await client.query(
        `update role_acls set features_json = (select coalesce(jsonb_agg(f), '[]'::jsonb)
           from jsonb_array_elements(features_json::jsonb) f where f <> to_jsonb($3::text)) where ${where}`,
        [ROLE, club.tenant.tenantId, drop],
      )
    }
    const { rows } = await client.query<{ features_json: string[] }>(
      `select features_json from role_acls where ${where}`,
      [ROLE, club.tenant.tenantId],
    )
    return rows[0]?.features_json ?? []
  })
}

test('TEST-M10 the pre-deploy wrapper syncs role ACLs only when the role defaults changed', async ({ request }) => {
  const club = await createClub(request, 'TEST-M10')
  try {
    // Whatever an earlier run stored, a forced run leaves the current fingerprint stored.
    const forced = runWrapper(['--force'])
    expect(forced.exitCode, forced.stderr).toBe(0)
    expect(forced.result).toMatchObject({ status: 'synced', reason: 'forced' })
    expect(forced.syncedTenants).toContain(club.tenant.tenantId)
    const hash = forced.result?.hash as string
    expect(hash).toMatch(/^[0-9a-f]{64}$/)

    const features = await roleFeatures(club)
    expect(features.length).toBeGreaterThan(0)
    const [dropped] = features
    expect(await roleFeatures(club, dropped)).not.toContain(dropped)

    // Unchanged defaults: no tenant is visited and the dropped feature stays dropped.
    const skipped = runWrapper()
    expect(skipped.exitCode, skipped.stderr).toBe(0)
    expect(skipped.result).toEqual(expect.objectContaining({ status: 'skipped', reason: 'unchanged', hash }))
    expect(skipped.syncedTenants).toEqual([])
    expect(await roleFeatures(club)).not.toContain(dropped)

    // Changed defaults: every tenant that existed before the run is synced exactly once, and the hash is stored again.
    await storeHash('0'.repeat(64))
    const before = await tenantIds()
    const changed = runWrapper()
    expect(changed.exitCode, changed.stderr).toBe(0)
    expect(changed.result).toMatchObject({ status: 'synced', reason: 'changed', hash, previousHash: '0'.repeat(64) })
    for (const tenantId of before) {
      expect(
        changed.syncedTenants.filter((id) => id === tenantId),
        tenantId,
      ).toHaveLength(1)
    }
    expect(await roleFeatures(club)).toContain(dropped)

    const again = runWrapper()
    expect(again.result).toMatchObject({ status: 'skipped', reason: 'unchanged', hash })
    expect(again.syncedTenants).toEqual([])

    const usage = runWrapper(['--tenant', club.tenant.tenantId])
    expect(usage.exitCode).toBe(1)
    expect(usage.stderr).toContain('Usage: mercato foundation sync-role-acls-if-changed')
  } finally {
    await club.cleanup()
  }
})
