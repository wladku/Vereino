import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, type APIRequestContext } from '@playwright/test'
import JSZip from 'jszip'
import { clearAuthTokenCache, getAuthToken } from '../_fixtures/auth'
import { deleteOrganizationIfExists, deleteUserIfExists } from '@open-mercato/core/helpers/integration/authFixtures'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { APP_ROOT, call, createPerson, uniqueSuffix } from '../_fixtures/club'
import { getSettings, png, publicGet, publish, upload } from '../_fixtures/publication'

// TEST-M07 (many clubs spec phase 4, REQ-M06, AC-M06, BR-M4, J-M03; E22-S06, #632): two clubs on one instance. Club A
// gets data in several modules (a person with encrypted columns, a logo file, a published page), and both clubs a
// row in the run-time `vector_search` table a running instance has. The operator commands
// refuse to delete before notice and during the notice period; `export-club` writes one archive with a file per module
// and the logo file, decrypted; `delete-club` after the notice leaves only the slug's tombstone and the one deletion
// audit entry of club A in any table with a `tenant_id`, nothing in the user-keyed tables and no logo file, while club B
// is untouched row for row. The archive carries no password hash, and a copy edited to reach another tenant or to
// write a file outside its partition is refused. `restore-club` brings club A back — its administrator signs in again
// (after setting a password) and reads the
// decrypted person, the public logo is served — and the archive round-trips into an empty, freshly migrated database:
// the export taken there equals the original apart from the audit log. A sidebar preference of club A's administrator
// without a tenant (the platform allows a null `tenant_id` there) is exported, deleted with the club and restored
// (#681), and an export whose checksum file already exists is refused before it writes the archive. The archive is
// untrusted (#806): a user role naming a role outside it is refused, and an archive edited to grant the club's roles
// the super-admin flag and instance-wide features is restored without them.
test.describe.configure({ timeout: 900_000 })

type Cli = { exitCode: number | null; output: Record<string, unknown> | null }

/** `yarn mercato club_core <args>` with an optional database: the exit code and the JSON line it printed. */
function clubCli(args: string[], databaseUrl?: string): Cli {
  const run = spawnSync('yarn', ['mercato', 'club_core', ...args], {
    cwd: APP_ROOT,
    env: databaseUrl ? { ...process.env, DATABASE_URL: databaseUrl } : process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 300_000,
  })
  // The command's own line carries a `status`; the app's JSON log lines (production mode) may follow it.
  const output = run.stdout
    .split(/\r?\n/)
    .filter((entry) => entry.trim().startsWith('{'))
    .map((entry) => {
      try {
        return JSON.parse(entry) as Record<string, unknown>
      } catch {
        return null
      }
    })
    .reverse()
    .find((entry) => entry !== null && typeof entry.status === 'string')
  return { exitCode: run.status, output: output ?? null }
}

type Club = { slug: string; tenantId: string; organizationId: string; adminUserId: string }

function createClubCli(slug: string, email: string): Club {
  const run = clubCli([
    'create-club',
    '--slug',
    slug,
    '--name',
    `M07 ${slug}`,
    '--admin-email',
    email,
    '--admin-first-name',
    'Ada',
    '--admin-last-name',
    'Admin',
  ])
  expect(run.exitCode, JSON.stringify(run.output)).toBe(0)
  return run.output as unknown as Club
}

/** Rows of `tenantId` in every table with a `tenant_id` column, tables without rows left out. */
async function tenantRows(tenantId: string): Promise<Record<string, number>> {
  return withClient(async (client) => {
    const { rows: tables } = await client.query<{ table_name: string }>(
      `select c.table_name from information_schema.columns c
         join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
        where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.column_name = 'tenant_id'
        order by c.table_name`,
    )
    const counts: Record<string, number> = {}
    for (const { table_name: table } of tables) {
      const { rows } = await client.query<{ count: string }>(
        `select count(*)::text as count from "${table}" where tenant_id = $1`,
        [tenantId],
      )
      const count = Number(rows[0]?.count ?? 0)
      if (count > 0) counts[table] = count
    }
    return counts
  })
}

async function userKeyedRows(userId: string): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ count: string }>(
      `select ((select count(*) from sessions where user_id = $1) + (select count(*) from password_resets where user_id = $1)
        + (select count(*) from user_roles where user_id = $1)
        + (select count(*) from user_sidebar_preferences where user_id = $1))::text as count`,
      [userId],
    )
    return Number(rows[0]?.count ?? 0)
  })
}

/** A sidebar preference of `userId` with a null `tenant_id`, a row the platform's schema allows (#681). */
async function seedTenantlessPreference(userId: string): Promise<void> {
  await withClient((client) =>
    client.query(
      `insert into user_sidebar_preferences (user_id, tenant_id, organization_id, locale, settings_json, created_at)
       values ($1, null, null, 'en', '{"m07": true}'::jsonb, now())`,
      [userId],
    ),
  )
}

async function tenantlessPreferences(userId: string): Promise<number> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from user_sidebar_preferences where user_id = $1 and tenant_id is null`,
      [userId],
    )
    return Number(rows[0]?.count ?? 0)
  })
}

async function moveDeletionDate(tenantId: string): Promise<void> {
  await withClient((client) =>
    client.query(
      `update club_core_club_settings set offboarding_delete_after = now() - interval '1 minute' where tenant_id = $1`,
      [tenantId],
    ),
  )
}

/** The archive's module files, parsed, by entry name. */
async function archiveData(file: string): Promise<Map<string, unknown>> {
  const zip = await JSZip.loadAsync(fs.readFileSync(file))
  const data = new Map<string, unknown>()
  for (const name of Object.keys(zip.files).filter((entry) => entry.startsWith('data/') && entry.endsWith('.json'))) {
    data.set(name, JSON.parse(await (zip.file(name) as JSZip.JSZipObject).async('string')))
  }
  return data
}

/**
 * A copy of `source` at `target` with its data entries changed by `edit` and the manifest's checksums recomputed, as
 * anyone holding the archive could do.
 */
async function tamperedArchive(
  source: string,
  target: string,
  edit: (entries: Record<string, unknown>) => void,
): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(source))
  const read = async (name: string): Promise<unknown> => {
    const entry = zip.file(name)
    if (!entry) throw new Error(`the archive has no ${name}`)
    return JSON.parse(await entry.async('string')) as unknown
  }
  const manifest = (await read('manifest.json')) as { checksums: Record<string, string> }
  const entries: Record<string, unknown> = {}
  for (const name of Object.keys(manifest.checksums)) entries[name] = await read(name)
  edit(entries)
  for (const [name, value] of Object.entries(entries)) {
    const text = `${JSON.stringify(value, null, 2)}\n`
    manifest.checksums[name] = createHash('sha256').update(text).digest('hex')
    zip.file(name, text)
  }
  zip.file('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
  fs.writeFileSync(target, await zip.generateAsync({ type: 'nodebuffer' }))
  return target
}

/**
 * Creates the pgvector driver's `vector_search` table when the database does not have it yet (the columns the driver
 * creates, a 3-dimension embedding) and adds one row per club. Returns whether the table was created here, so the test
 * drops it again.
 */
async function seedVectorRows(clubs: Club[]): Promise<boolean> {
  return withClient(async (client) => {
    const existing = await client.query(`select 1 from information_schema.tables where table_name = 'vector_search'`)
    const create = existing.rowCount === 0
    if (create) {
      await client.query(`create extension if not exists vector`)
      await client.query(
        `create table vector_search (
           id uuid primary key default gen_random_uuid(), driver_id text not null, entity_id text not null,
           record_id text not null, tenant_id uuid not null, organization_id uuid null, checksum text not null,
           embedding vector(3) not null, created_at timestamptz not null default now(),
           updated_at timestamptz not null default now())`,
      )
    }
    for (const club of clubs) {
      await client.query(
        `insert into vector_search (driver_id, entity_id, record_id, tenant_id, organization_id, checksum, embedding)
         values ('pgvector', 'people:person', $1, $2, $3, 'm07', '[0,0,0]')`,
        [club.organizationId, club.tenantId, club.organizationId],
      )
    }
    return create
  })
}

async function signIn(request: APIRequestContext, superToken: string, club: Club, email: string, password: string) {
  const reset = await call(request, 'PUT', '/api/auth/users', superToken, { data: { id: club.adminUserId, password } })
  expect(reset.status, JSON.stringify(reset.body)).toBe(200)
  return getAuthToken(request, email, password)
}

test('TEST-M07 a club is exported, deleted after notice, restored, and round-trips into an empty database', async ({
  request,
}) => {
  const superToken = await getAuthToken(request, 'superadmin')
  const suffix = uniqueSuffix()
  const slugA = `m07-a-${suffix}`
  const slugB = `m07-b-${suffix}`
  const emailA = `m07-a-${suffix}@example.org`
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-m07-'))
  const archive = path.join(work, `${slugA}.zip`)
  const stagingName = `m07_staging_${suffix.replace(/[^a-z0-9]/gi, '').toLowerCase()}`
  const baseUrl = new URL(String(process.env.DATABASE_URL))
  const stagingUrl = new URL(baseUrl.toString())
  stagingUrl.pathname = `/${stagingName}`
  const clubs: Club[] = []
  let createdVectorTable = false
  try {
    const clubA = createClubCli(slugA, emailA)
    clubs.push(clubA)
    const clubB = createClubCli(slugB, `m07-b-${suffix}@example.org`)
    clubs.push(clubB)

    // Club A's data: a person with encrypted columns, a logo file, a published page.
    // A suffix of its own: `emailA` carries `suffix`, and a password made of the address is refused (#779).
    const password = `Vereino-${uniqueSuffix()}-Aa1!`
    const tokenA = await signIn(request, superToken, clubA, emailA, password)
    const personId = await createPerson(request, tokenA, { firstName: 'Zofia', lastName: 'Wiśniewska' })
    const settings = await getSettings(request, tokenA)
    const logo = await upload(request, tokenA, '/api/club_core/logo', png([200, 30, 30]), {}, settings.updatedAt)
    expect(logo.status, JSON.stringify(logo.body)).toBe(200)
    await publish(request, tokenA, slugA, ['contact'])
    const logoBefore = await publicGet(request, `/api/club_core/public/${slugA}/logo`)
    expect(logoBefore.status).toBe(200)
    // A running instance has the pgvector driver's run-time `vector_search` table (no migration creates it); the
    // commands must cover it like any index. One vector row per club; the staging database below has no such table.
    createdVectorTable = await seedVectorRows([clubA, clubB])
    await seedTenantlessPreference(clubA.adminUserId)
    const rowsB = await tenantRows(clubB.tenantId)
    expect(rowsB).toMatchObject({ vector_search: 1 })

    // Deletion needs a notice, and the notice period must end; the slug must be confirmed.
    expect(clubCli(['delete-club', '--slug', slugA, '--confirm', slugA]).output).toEqual({
      status: 'refused',
      reason: 'not_offboarded',
    })
    const shortNotice = clubCli(['offboard-club', '--slug', slugA, '--notice-days', '5'])
    expect(shortNotice.exitCode).toBe(1)
    expect(shortNotice.output).toEqual({ status: 'invalid', problems: [{ option: 'notice-days', problem: 'invalid' }] })
    const notice = clubCli(['offboard-club', '--slug', slugA])
    expect(notice.exitCode, JSON.stringify(notice.output)).toBe(0)
    expect(notice.output).toMatchObject({ status: 'offboarded', tenantId: clubA.tenantId })
    const days =
      (Date.parse(String(notice.output?.deleteAfter)) - Date.parse(String(notice.output?.noticeAt))) / 86_400_000
    expect(days).toBe(30)
    expect(clubCli(['offboard-club', '--slug', slugA]).output).toMatchObject({ status: 'unchanged' })
    const early = clubCli(['delete-club', '--slug', slugA, '--confirm', slugA])
    expect(early.exitCode).toBe(1)
    expect(early.output).toMatchObject({ status: 'refused', reason: 'notice_running' })
    expect(clubCli(['delete-club', '--slug', slugA, '--confirm', slugB]).output).toEqual({
      status: 'invalid',
      problems: [{ option: 'confirm', problem: 'mismatch' }],
    })

    // The export: one archive, a file per module, the logo file, decrypted columns.
    const exported = clubCli(['export-club', '--slug', slugA, '--out', archive])
    expect(exported.exitCode, JSON.stringify(exported.output)).toBe(0)
    expect(exported.output).toMatchObject({ status: 'exported', files: 1, missingFiles: [] })
    expect(fs.readFileSync(`${archive}.sha256`, 'utf8')).toContain(String(exported.output?.sha256))
    const data = await archiveData(archive)
    const modules = ['foundation', 'club_core', 'people', 'groups', 'activities', 'communication', 'payments']
    modules.push('facilities', 'directory', 'auth', 'attachments', 'audit_logs', 'entities')
    for (const name of modules) expect(data.has(`data/${name}.json`), name).toBe(true)
    const people = data.get('data/people.json') as { people_persons: Record<string, unknown>[] }
    expect(people.people_persons.find((row) => row.id === personId)).toMatchObject({
      first_name: 'Zofia',
      last_name: 'Wiśniewska',
    })
    const auth = data.get('data/auth.json') as Record<string, unknown[]>
    // No credential leaves the instance in the archive: the password hash is cleared (*Data out*).
    expect(auth.users).toEqual([expect.objectContaining({ email: emailA, password_hash: null })])
    expect(auth.sessions).toBeUndefined()
    expect(auth.password_resets).toBeUndefined()
    expect(auth.user_sidebar_preferences).toEqual([
      expect.objectContaining({ user_id: clubA.adminUserId, tenant_id: null, settings_json: { m07: true } }),
    ])
    const existing = clubCli(['export-club', '--slug', slugA, '--out', archive])
    expect(existing.exitCode).toBe(1)
    // A checksum file left at the target refuses the export too, before the archive is written (#681).
    const stale = path.join(work, 'stale.zip')
    fs.writeFileSync(`${stale}.sha256`, 'stale\n')
    expect(clubCli(['export-club', '--slug', slugA, '--out', stale]).exitCode).toBe(1)
    expect(fs.existsSync(stale)).toBe(false)
    expect(fs.readFileSync(`${stale}.sha256`, 'utf8')).toBe('stale\n')

    // The deletion after the notice: only the tombstone and the deletion's audit entry stay; club B is untouched.
    await moveDeletionDate(clubA.tenantId)
    const dry = clubCli(['delete-club', '--slug', slugA, '--confirm', slugA, '--dry-run'])
    expect(dry.output).toMatchObject({ status: 'dry-run' })
    // The administrator's person and Zofia: the dry run deleted nothing.
    expect(await tenantRows(clubA.tenantId)).toMatchObject({ people_persons: 2 })
    const deleted = clubCli(['delete-club', '--slug', slugA, '--confirm', slugA])
    expect(deleted.exitCode, JSON.stringify(deleted.output)).toBe(0)
    expect(deleted.output).toMatchObject({
      status: 'deleted',
      schedulesFailed: 0,
      filesDeleted: 1,
      filesFailed: 0,
      encryptionKey: 'derived',
    })
    expect(await tenantRows(clubA.tenantId)).toEqual({ action_logs: 1, club_core_club_settings: 1 })
    const leftovers = await withClient(async (client) => {
      const tenant = await client.query(`select id from tenants where id = $1`, [clubA.tenantId])
      const tomb = await client.query<{ public_slug: string; deleted: boolean; contact_phone: string | null }>(
        `select public_slug, deleted_at is not null as deleted, contact_phone from club_core_club_settings where tenant_id = $1`,
        [clubA.tenantId],
      )
      const audit = await client.query<{ resource_kind: string }>(
        `select resource_kind from action_logs where tenant_id = $1`,
        [clubA.tenantId],
      )
      return { tenants: tenant.rowCount, tomb: tomb.rows, audit: audit.rows }
    })
    expect(leftovers).toEqual({
      tenants: 0,
      tomb: [{ public_slug: slugA, deleted: true, contact_phone: null }],
      audit: [{ resource_kind: 'club_core.club_settings' }],
    })
    expect(await userKeyedRows(clubA.adminUserId)).toBe(0)
    expect((await publicGet(request, `/api/club_core/public/${slugA}`)).status).toBe(404)
    expect(await tenantRows(clubB.tenantId)).toEqual(rowsB)
    // The slug stays reserved: a second run reports the deletion and the release date.
    expect(clubCli(['delete-club', '--slug', slugA, '--confirm', slugA]).output).toMatchObject({
      status: 'already_deleted',
    })
    expect(clubCli(['export-club', '--slug', slugA, '--out', path.join(work, 'again.zip')]).output).toEqual({
      status: 'refused',
      reason: 'club_deleted',
      slug: slugA,
    })

    // The round trip into an empty staging database: migrated, restored, exported again.
    await withClient((client) => client.query(`create database "${stagingName}"`))
    const migrate = spawnSync('yarn', ['mercato', 'db', 'migrate'], {
      cwd: APP_ROOT,
      env: { ...process.env, DATABASE_URL: stagingUrl.toString() },
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 300_000,
    })
    expect(migrate.status, migrate.stderr).toBe(0)
    const staged = clubCli(['restore-club', '--in', archive], stagingUrl.toString())
    expect(staged.exitCode, JSON.stringify(staged.output)).toBe(0)
    expect(staged.output).toMatchObject({ status: 'restored', slug: slugA, files: 1 })
    const stagedArchive = path.join(work, 'staged.zip')
    const reexported = clubCli(['export-club', '--slug', slugA, '--out', stagedArchive], stagingUrl.toString())
    expect(reexported.exitCode, JSON.stringify(reexported.output)).toBe(0)
    const stagedData = await archiveData(stagedArchive)
    expect([...stagedData.keys()].sort()).toEqual([...data.keys()].sort())
    for (const [name, content] of data) {
      if (name === 'data/audit_logs.json') continue
      expect(stagedData.get(name), name).toEqual(content)
    }

    // An archive edited to reach beyond its club is refused before anything is written, even with its checksums
    // recomputed: a row of club B's tenant, and an attachment path out of its partition.
    const otherTenant = await tamperedArchive(archive, path.join(work, 'other-tenant.zip'), (entries) => {
      const rows = (entries['data/people.json'] as Record<string, Record<string, unknown>[]>).people_persons
      rows.push({ ...rows[0], id: '00000000-0000-4000-8000-000000000632', tenant_id: clubB.tenantId })
    })
    expect(clubCli(['restore-club', '--in', otherTenant]).output).toEqual({
      status: 'refused',
      reason: 'archive_out_of_scope',
      tables: ['people_persons: a row of another tenant'],
    })
    const outOfPartition = await tamperedArchive(archive, path.join(work, 'out-of-partition.zip'), (entries) => {
      const rows = (entries['data/attachments.json'] as Record<string, Record<string, unknown>[]>).attachments
      rows[0].storage_path = '../../../m07-escaped.png'
    })
    expect(clubCli(['restore-club', '--in', outOfPartition]).output).toEqual({
      status: 'refused',
      reason: 'archive_out_of_scope',
      tables: ['attachments: a file outside its partition'],
    })
    // A user role of the club's administrator naming a role outside the archive (the instance's own super
    // administrator role, say) is refused too (#806).
    const foreignRole = await tamperedArchive(archive, path.join(work, 'foreign-role.zip'), (entries) => {
      const rows = (entries['data/auth.json'] as Record<string, Record<string, unknown>[]>).user_roles
      rows.push({
        ...rows[0],
        id: '00000000-0000-4000-8000-000000000806',
        role_id: '00000000-0000-4000-8000-000000000807',
      })
    })
    expect(clubCli(['restore-club', '--in', foreignRole]).output).toEqual({
      status: 'refused',
      reason: 'archive_out_of_scope',
      tables: ['user_roles: a reference outside the club'],
    })
    expect(await tenantRows(clubA.tenantId)).toEqual({ action_logs: 1, club_core_club_settings: 1 })

    // The restore on this instance: over its own tombstone; a second one is refused. The archive restored here was
    // edited to make every role of the club a super administrator with the global and tenant-management grants; the
    // restore writes none of them (#806), and the administrator keeps the club's own features (checked below).
    const elevated = await tamperedArchive(archive, path.join(work, 'elevated.zip'), (entries) => {
      const auth = entries['data/auth.json'] as Record<string, Record<string, unknown>[]>
      expect(auth.role_acls.length).toBeGreaterThan(0)
      for (const row of auth.role_acls) {
        row.is_super_admin = true
        row.features_json = [...((row.features_json as string[] | null) ?? []), '*', 'directory.tenants.manage']
      }
    })
    const restored = clubCli(['restore-club', '--in', elevated])
    expect(restored.exitCode, JSON.stringify(restored.output)).toBe(0)
    expect(restored.output).toMatchObject({ status: 'restored', tenantId: clubA.tenantId, files: 1 })
    expect(await tenantlessPreferences(clubA.adminUserId)).toBe(1)
    expect(clubCli(['restore-club', '--in', archive]).output).toEqual({ status: 'refused', reason: 'tenant_exists' })
    const grants = await withClient(async (client) => {
      const result = await client.query<{ is_super_admin: boolean; features_json: string[] | null }>(
        `select is_super_admin, features_json from role_acls where tenant_id = $1
         union all select is_super_admin, features_json from user_acls where tenant_id = $1`,
        [clubA.tenantId],
      )
      return result.rows
    })
    expect(grants.length).toBeGreaterThan(0)
    expect(grants.filter((grant) => grant.is_super_admin)).toEqual([])
    expect(
      grants
        .flatMap((grant) => grant.features_json ?? [])
        .filter((f) => f === '*' || f.startsWith('directory.tenants')),
    ).toEqual([])
    // The deletion ended the administrator's sessions; the helper's token cache would hand back the dead token. The
    // archive carries no password hash, so the administrator sets a password again (here through the superadmin).
    clearAuthTokenCache()
    const again = await signIn(request, superToken, clubA, emailA, `${password}2`)
    const persons = await call<{ items: { id: string; firstName?: string; lastName?: string }[] }>(
      request,
      'GET',
      '/api/people/persons',
      again,
    )
    expect(persons.status, JSON.stringify(persons.body)).toBe(200)
    expect(persons.body?.items.find((item) => item.id === personId)).toMatchObject({
      firstName: 'Zofia',
      lastName: 'Wiśniewska',
    })
    const logoAfter = await publicGet(request, `/api/club_core/public/${slugA}/logo`)
    expect(logoAfter.status).toBe(200)
    expect(logoAfter.bytes.equals(logoBefore.bytes)).toBe(true)
    expect(await tenantRows(clubB.tenantId)).toEqual(rowsB)
  } finally {
    await withClient((client) => client.query(`drop database if exists "${stagingName}" with (force)`)).catch(
      () => undefined,
    )
    if (createdVectorTable) {
      await withClient((client) => client.query(`drop table if exists vector_search`)).catch(() => undefined)
    }
    fs.rmSync(work, { recursive: true, force: true })
    for (const club of clubs) {
      await deleteUserIfExists(request, superToken, club.adminUserId).catch(() => undefined)
      await deleteOrganizationIfExists(request, superToken, club.organizationId).catch(() => undefined)
      await call(request, 'DELETE', '/api/directory/tenants', superToken, { data: { id: club.tenantId } }).catch(
        () => undefined,
      )
    }
  }
})
