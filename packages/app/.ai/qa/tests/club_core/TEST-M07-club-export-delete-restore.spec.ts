import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, type APIRequestContext } from '@playwright/test'
import JSZip from 'jszip'
import { clearAuthTokenCache, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { deleteOrganizationIfExists, deleteUserIfExists } from '@open-mercato/core/helpers/integration/authFixtures'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { APP_ROOT, call, createPerson, uniqueSuffix } from '../_fixtures/club'
import { getSettings, png, publicGet, publish, upload } from '../_fixtures/publication'

// TEST-M07 (many clubs spec phase 4, REQ-M06, AC-M06, BR-M4, J-M03; E22-S06, #632): two clubs on one instance. Club A
// gets data in several modules (a person with encrypted columns, a logo file, a published page). The operator commands
// refuse to delete before notice and during the notice period; `export-club` writes one archive with a file per module
// and the logo file, decrypted; `delete-club` after the notice leaves only the slug's tombstone and the one deletion
// audit entry of club A in any table with a `tenant_id`, nothing in the user-keyed tables and no logo file, while club B
// is untouched row for row. `restore-club` brings club A back — its administrator signs in again and reads the
// decrypted person, the public logo is served — and the archive round-trips into an empty, freshly migrated database:
// the export taken there equals the original apart from the audit log.
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
        + (select count(*) from user_roles where user_id = $1))::text as count`,
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
  try {
    const clubA = createClubCli(slugA, emailA)
    clubs.push(clubA)
    const clubB = createClubCli(slugB, `m07-b-${suffix}@example.org`)
    clubs.push(clubB)

    // Club A's data: a person with encrypted columns, a logo file, a published page.
    const password = `Vereino-${suffix}-Aa1!`
    const tokenA = await signIn(request, superToken, clubA, emailA, password)
    const personId = await createPerson(request, tokenA, { firstName: 'Zofia', lastName: 'Wiśniewska' })
    const settings = await getSettings(request, tokenA)
    const logo = await upload(request, tokenA, '/api/club_core/logo', png([200, 30, 30]), {}, settings.updatedAt)
    expect(logo.status, JSON.stringify(logo.body)).toBe(200)
    await publish(request, tokenA, slugA, ['contact'])
    const logoBefore = await publicGet(request, `/api/club_core/public/${slugA}/logo`)
    expect(logoBefore.status).toBe(200)
    const rowsB = await tenantRows(clubB.tenantId)

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
    for (const module of ['foundation', 'club_core', 'people', 'groups', 'activities', 'communication', 'payments']) {
      expect(data.has(`data/${module}.json`), module).toBe(true)
    }
    for (const module of ['facilities', 'directory', 'auth', 'attachments', 'audit_logs', 'entities']) {
      expect(data.has(`data/${module}.json`), module).toBe(true)
    }
    const people = data.get('data/people.json') as { people_persons: Record<string, unknown>[] }
    expect(people.people_persons.find((row) => row.id === personId)).toMatchObject({
      first_name: 'Zofia',
      last_name: 'Wiśniewska',
    })
    const auth = data.get('data/auth.json') as Record<string, unknown[]>
    expect(auth.users).toEqual([expect.objectContaining({ email: emailA })])
    expect(auth.sessions).toBeUndefined()
    expect(auth.password_resets).toBeUndefined()
    const existing = clubCli(['export-club', '--slug', slugA, '--out', archive])
    expect(existing.exitCode).toBe(1)

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

    // The restore on this instance: over its own tombstone; a second one is refused.
    const restored = clubCli(['restore-club', '--in', archive])
    expect(restored.exitCode, JSON.stringify(restored.output)).toBe(0)
    expect(restored.output).toMatchObject({ status: 'restored', tenantId: clubA.tenantId, files: 1 })
    expect(clubCli(['restore-club', '--in', archive]).output).toEqual({ status: 'refused', reason: 'tenant_exists' })
    // The deletion ended the administrator's sessions; the helper's token cache would hand back the dead token.
    clearAuthTokenCache()
    const again = await getAuthToken(request, emailA, password)
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
