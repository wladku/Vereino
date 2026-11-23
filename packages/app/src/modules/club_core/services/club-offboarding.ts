// A club's data as one unit (many clubs spec phase 4, REQ-M06, DD-M09, BR-M1, BR-M4; #632): the export of every row
// and file of one club into one ZIP archive, its deletion after the notice period, and its restore from that archive
// into a database that does not hold the club (a staging copy, or the same instance after a deletion).
//
// The rows are "everything with the club's tenant" (DD-M01): the Vereino modules' tables, named by each module's
// contributor (`club_core.clubExport.<module>` / `club_core.clubDelete.<module>`), and the platform tables of
// `PLATFORM_CLUB_TABLES` (*Deletion targets*). Before anything runs, every table of the database with a `tenant_id`
// column must be covered by one of them, or the command refuses. Every query is narrowed to the club's tenant, taken
// from the operator's command (BR-M1), never from a request.
//
// Rows are read as PostgreSQL prints them (`to_jsonb`) and written back with `json_populate_recordset`, so types round
// trip without a per-column mapping. Encrypted columns are decrypted for the archive (an open format the club can read)
// and encrypted again with the target's key on restore. Attachment files travel through the platform storage driver.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { EntityManager } from '@mikro-orm/postgresql'
import { IsolationLevel } from '@mikro-orm/core'
import type { AwilixContainer } from 'awilix'
import JSZip from 'jszip'
import { runWithCacheTenant, type CacheStrategy } from '@open-mercato/cache'
import { isEncryptedPayloadShape } from '@open-mercato/shared/lib/encryption/aes'
import { resolveEntityIdFromMetadata } from '@open-mercato/shared/lib/encryption/entityIds'
import type { TenantDataEncryptionService } from '@open-mercato/shared/lib/encryption/tenantDataEncryptionService'
import { getCliModules } from '@open-mercato/shared/modules/registry'
import { clubExportContributorToken, type ClubDataContributor } from '@/modules/foundation'
import {
  CLUB_ARCHIVE_FORMAT,
  CLUB_ARCHIVE_MANIFEST,
  CLUB_ARCHIVE_VERSION,
  clubTables,
  fileEntryName,
  missingTables,
  moduleEntryName,
  orderForInsert,
  parseManifest,
  parseRowJson,
  uncoveredTables,
  type ClubArchiveManifest,
  type ClubTable,
  type ForeignKeyEdge,
  type ManifestFile,
  type ManifestTable,
} from '../lib/club-offboarding'

export type ClubScope = { tenantId: string; organizationId: string }
export type ClubIdentity = ClubScope & { slug: string; settingsId: string }

type Row = Record<string, unknown>

/** The platform storage driver of an attachment (`attachments` `storageDriverFactory`). */
type StorageDriver = {
  read(partitionCode: string, storagePath: string): Promise<{ buffer: Buffer }>
  store(payload: {
    partitionCode: string
    storagePath?: string
    buffer: Buffer
    fileName: string
    tenantId: string | null
    orgId: string | null
  }): Promise<{ storagePath: string }>
  delete(partitionCode: string, storagePath: string): Promise<void>
  deleteStrict?(partitionCode: string, storagePath: string): Promise<void>
}
type StorageDriverFactory = { resolveForPartition(partitionCode: string): Promise<StorageDriver> }
type SchedulerService = { unregister(scheduleId: string): Promise<void> }

/** Rows written per `insert … select … from json_populate_recordset` statement. */
const INSERT_BATCH = 500
/** The tables a restored club may already have: its tombstone and the deletion's audit entry (`delete-club`). */
const RESTORE_TOLERATED = new Set(['club_core_club_settings', 'action_logs'])

/** Thrown when the database holds a table no module or platform list covers, or a listed table is absent. */
export class ClubCatalogError extends Error {
  constructor(
    readonly uncovered: string[],
    readonly missing: string[],
  ) {
    super(`club tables not covered: ${uncovered.join(', ') || '-'}; listed but missing: ${missing.join(', ') || '-'}`)
  }
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`[internal] unexpected identifier ${name}`)
  return `"${name}"`
}

function emOf(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

// ---------------------------------------------------------------------------------------------------------------------
// Catalogue and targets

type Catalogue = {
  /** Tables of the public schema that have a `tenant_id` column. */
  tenantTables: string[]
  /** Every base table of the public schema with its writable (not generated) columns. */
  columns: Map<string, string[]>
  edges: ForeignKeyEdge[]
}

async function readCatalogue(em: EntityManager): Promise<Catalogue> {
  const columnRows = await em.execute<{ table_name: string; column_name: string; is_generated: string }[]>(
    `select c.table_name, c.column_name, c.is_generated
       from information_schema.columns c
       join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      order by c.table_name, c.ordinal_position`,
  )
  const columns = new Map<string, string[]>()
  const tenantTables: string[] = []
  for (const row of columnRows) {
    const list = columns.get(row.table_name) ?? []
    if (row.is_generated !== 'ALWAYS') list.push(row.column_name)
    columns.set(row.table_name, list)
    if (row.column_name === 'tenant_id' && !row.table_name.startsWith('mikro_orm_migrations')) {
      tenantTables.push(row.table_name)
    }
  }
  const edges = await em.execute<{ table: string; references: string }[]>(
    `select c.conrelid::regclass::text as "table", c.confrelid::regclass::text as "references"
       from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace`,
  )
  return { tenantTables, columns, edges: edges.map((edge) => ({ table: edge.table, references: edge.references })) }
}

/** The Vereino modules' contributors, read with `hasRegistration` in module order. */
function moduleContributors(container: AwilixContainer): ClubDataContributor[] {
  return getCliModules()
    .map((mod) => clubExportContributorToken(mod.id))
    .filter((token) => container.hasRegistration(token))
    .map((token) => container.resolve<ClubDataContributor>(token))
}

type ClubTargets = { tables: ClubTable[]; insertOrder: ClubTable[]; catalogue: Catalogue }

/**
 * Every table of a club in insert order (referenced tables first), after checking that the lists cover every table
 * of the database with a `tenant_id` column and that every listed table exists. Throws `ClubCatalogError` otherwise.
 */
async function clubTargets(container: AwilixContainer, em: EntityManager): Promise<ClubTargets> {
  const catalogue = await readCatalogue(em)
  const tables = clubTables(moduleContributors(container))
  const uncovered = uncoveredTables(catalogue.tenantTables, tables)
  const missing = missingTables([...catalogue.columns.keys()], tables)
  if (uncovered.length > 0 || missing.length > 0) throw new ClubCatalogError(uncovered, missing)
  const byName = new Map(tables.map((entry) => [entry.table, entry]))
  const insertOrder = orderForInsert(
    tables.map((entry) => entry.table),
    catalogue.edges,
  ).map((table) => byName.get(table) as ClubTable)
  return { tables, insertOrder, catalogue }
}

/** The `where` clause and parameters selecting a club's rows of `entry`. */
function clubWhere(entry: ClubTable, scope: ClubScope): { sql: string; params: string[] } {
  if (entry.key === 'tenant_row') return { sql: 'id = ?', params: [scope.tenantId] }
  if (entry.key === 'user') {
    return { sql: 'user_id in (select id from users where tenant_id = ?)', params: [scope.tenantId] }
  }
  return { sql: 'tenant_id = ?', params: [scope.tenantId] }
}

async function countRows(em: EntityManager, entry: ClubTable, scope: ClubScope): Promise<number> {
  const where = clubWhere(entry, scope)
  const rows = await em.execute<{ count: string | number }[]>(
    `select count(*) as count from ${quoteIdent(entry.table)} where ${where.sql}`,
    where.params,
  )
  return Number(rows[0]?.count ?? 0)
}

/** The colon-form entity id of each table the ORM knows (`resolveEntityIdFromMetadata`), for the encryption maps. */
function entityIdsByTable(em: EntityManager): Map<string, string> {
  const map = new Map<string, string>()
  for (const meta of em.getMetadata().getAll().values()) {
    if (!meta.tableName || map.has(meta.tableName)) continue
    const entityId = resolveEntityIdFromMetadata(meta)
    if (entityId) map.set(meta.tableName, entityId)
  }
  return map
}

function encryptionService(container: AwilixContainer): TenantDataEncryptionService | null {
  return container.hasRegistration('tenantEncryptionService')
    ? container.resolve<TenantDataEncryptionService>('tenantEncryptionService')
    : null
}

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

// ---------------------------------------------------------------------------------------------------------------------
// Export

export type ClubExportSummary = {
  path: string
  sha256: string
  bytes: number
  tables: ManifestTable[]
  files: number
  /** Attachments whose file the storage no longer has; their rows are exported without the file. */
  missingFiles: string[]
}

type AttachmentRow = {
  id: string
  partition_code: string
  storage_path: string
  file_name: string
}

/** Reads a club's rows of one table in id order, decrypting the columns its encryption map covers. */
async function exportRows(
  em: EntityManager,
  entry: ClubTable,
  scope: ClubScope,
  encryption: TenantDataEncryptionService | null,
  entityId: string | undefined,
): Promise<{ rows: Row[]; decrypted: string[] }> {
  const where = clubWhere(entry, scope)
  const result = await em.execute<{ row: string }[]>(
    `select to_jsonb(t)::text as row from ${quoteIdent(entry.table)} t where ${where.sql} order by t.id`,
    where.params,
  )
  const rows = result.map((item) => parseRowJson(item.row))
  if (!encryption || !entityId || rows.length === 0) return { rows, decrypted: [] }
  const fields = await encryption.getEncryptedFieldNames(entityId, scope.tenantId, scope.organizationId, {
    ignoreRuntimeHealth: true,
    em,
  })
  const present = fields.filter((field) => field in (rows[0] as Row))
  if (present.length === 0) return { rows, decrypted: [] }
  const decryptedRows: Row[] = []
  for (const row of rows) {
    const plain = (await encryption.decryptEntityPayload(
      entityId,
      row,
      (row.tenant_id as string | null) ?? scope.tenantId,
      (row.organization_id as string | null) ?? null,
      { em },
    )) as Row
    // Fail closed: a value still sealed means the key is missing, and the archive would carry unreadable data.
    for (const field of present) {
      if (isEncryptedPayloadShape(plain[field])) {
        throw new Error(`[internal] ${entry.table}.${field} of row ${String(row.id)} could not be decrypted`)
      }
    }
    decryptedRows.push(plain)
  }
  return { rows: decryptedRows, decrypted: present.sort() }
}

/**
 * Writes the club's archive to `outPath` (a new file, readable only by its owner): `manifest.json`, one
 * `data/<module>.json` per module with `{ <table>: row[] }`, and every attachment file under `files/<id>/`. The rows are
 * read in one repeatable-read transaction, so the archive is one consistent moment of the club. Secret and derived
 * tables are not exported (`ClubTableKind`).
 */
export async function exportClub(
  container: AwilixContainer,
  club: ClubIdentity,
  outPath: string,
  now: Date,
): Promise<ClubExportSummary> {
  const target = path.resolve(outPath)
  const exists = await fs.stat(target).then(
    () => true,
    () => false,
  )
  if (exists) throw new Error(`[internal] the archive ${target} already exists; choose another --out`)
  const scope = { tenantId: club.tenantId, organizationId: club.organizationId }
  const encryption = encryptionService(container)
  const zip = new JSZip()
  const tables: ManifestTable[] = []
  const files: ManifestFile[] = []
  const missingFiles: string[] = []
  const checksums: Record<string, string> = {}
  await emOf(container).transactional(
    async (em) => {
      const { insertOrder } = await clubTargets(container, em)
      const entityIds = entityIdsByTable(em)
      const modules = new Map<string, Record<string, Row[]>>()
      for (const entry of insertOrder) {
        if (entry.kind !== 'data') continue
        const { rows, decrypted } = await exportRows(em, entry, scope, encryption, entityIds.get(entry.table))
        const bucket = modules.get(entry.module) ?? {}
        bucket[entry.table] = rows
        modules.set(entry.module, bucket)
        tables.push({ module: entry.module, table: entry.table, key: entry.key, rows: rows.length, decrypted })
      }
      for (const [module, data] of modules) {
        const text = `${JSON.stringify(data, null, 2)}\n`
        checksums[moduleEntryName(module)] = sha256(text)
        zip.file(moduleEntryName(module), text)
      }
      const attachments = (modules.get('attachments')?.attachments ?? []) as unknown as AttachmentRow[]
      const factory = container.resolve<StorageDriverFactory>('storageDriverFactory')
      for (const attachment of attachments) {
        const driver = await factory.resolveForPartition(attachment.partition_code)
        let buffer: Buffer
        try {
          buffer = (await driver.read(attachment.partition_code, attachment.storage_path)).buffer
        } catch {
          missingFiles.push(attachment.id)
          continue
        }
        const entryName = fileEntryName(attachment.id, attachment.file_name)
        zip.file(entryName, buffer)
        files.push({ attachmentId: attachment.id, path: entryName, bytes: buffer.length, sha256: sha256(buffer) })
      }
    },
    { isolationLevel: IsolationLevel.REPEATABLE_READ, readOnly: true },
  )
  const manifest: ClubArchiveManifest = {
    format: CLUB_ARCHIVE_FORMAT,
    version: CLUB_ARCHIVE_VERSION,
    exportedAt: now.toISOString(),
    club: { slug: club.slug, tenantId: club.tenantId, organizationId: club.organizationId },
    tables,
    files,
    checksums,
  }
  zip.file(CLUB_ARCHIVE_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, bytes, { flag: 'wx', mode: 0o600 })
  const digest = sha256(bytes)
  await fs.writeFile(`${target}.sha256`, `${digest}  ${path.basename(target)}\n`, { mode: 0o600 })
  return { path: target, sha256: digest, bytes: bytes.length, tables, files: files.length, missingFiles }
}

// ---------------------------------------------------------------------------------------------------------------------
// Deletion

export type ClubDeletionSummary = {
  /** Rows deleted (or, on a dry run, to delete) per table, in deletion order; empty tables are left out. */
  tables: { module: string; table: string; rows: number }[]
  schedulesUnregistered: number
  filesDeleted: number
  filesFailed: number
  cacheEntriesCleared: number
}

/** The columns of the club's settings row a tombstone keeps; everything else is cleared or reset (BR-M4). */
const TOMBSTONE_SCRUB = `
  deleted_at = now(), updated_at = now(), short_name = null, contact_phone = null, bank_account = null,
  logo_attachment_id = null, public_description = null, rules_url = null, privacy_policy_url = null,
  consent_texts = '{}'::jsonb, publication = '{"enabled": false, "blocks": {}}'::jsonb`

/**
 * Deletes every row of the club from every covered table, in one transaction, children first; the club's settings row
 * stays as the slug's tombstone (`deleted_at` set, the slug, time zone and notice dates kept) until the slug is
 * released. Before it, the club's schedules are unregistered through the scheduler (which also removes their BullMQ
 * repeatables); after the commit, the attachment files are deleted from storage and the club's cache entries cleared.
 * With `dryRun` it only counts. The data-encryption key is derived from the master secret and the tenant id (Q-M07), so
 * there is no key to destroy until a key store holds the keys.
 */
export async function deleteClub(
  container: AwilixContainer,
  club: ClubIdentity,
  options: { dryRun: boolean },
): Promise<ClubDeletionSummary> {
  const scope = { tenantId: club.tenantId, organizationId: club.organizationId }
  const em = emOf(container)
  const { insertOrder } = await clubTargets(container, em)
  const deleteOrder = [...insertOrder].reverse()
  const summary: ClubDeletionSummary = {
    tables: [],
    schedulesUnregistered: 0,
    filesDeleted: 0,
    filesFailed: 0,
    cacheEntriesCleared: 0,
  }
  if (options.dryRun) {
    for (const entry of deleteOrder) {
      const rows = await countRows(em, entry, scope)
      if (rows > 0) summary.tables.push({ module: entry.module, table: entry.table, rows })
    }
    return summary
  }
  const schedules = await em.execute<{ id: string }[]>(`select id from scheduled_jobs where tenant_id = ?`, [
    scope.tenantId,
  ])
  if (schedules.length > 0) {
    const scheduler = container.resolve<SchedulerService>('schedulerService')
    for (const schedule of schedules) await scheduler.unregister(schedule.id)
    summary.schedulesUnregistered = schedules.length
  }
  const attachments = await em.execute<AttachmentRow[]>(
    `select id, partition_code, storage_path, file_name from attachments where tenant_id = ?`,
    [scope.tenantId],
  )
  await em.transactional(async (tx) => {
    await tx.execute(`update club_core_club_settings set ${TOMBSTONE_SCRUB} where id = ? and tenant_id = ?`, [
      club.settingsId,
      scope.tenantId,
    ])
    for (const entry of deleteOrder) {
      const where = clubWhere(entry, scope)
      const keepTombstone = entry.table === 'club_core_club_settings'
      const result = await tx.execute<{ id: string }[]>(
        `delete from ${quoteIdent(entry.table)} where ${where.sql}${keepTombstone ? ' and id <> ?' : ''} returning id`,
        keepTombstone ? [...where.params, club.settingsId] : where.params,
      )
      if (result.length > 0) summary.tables.push({ module: entry.module, table: entry.table, rows: result.length })
    }
  })
  const factory = container.resolve<StorageDriverFactory>('storageDriverFactory')
  for (const attachment of attachments) {
    try {
      const driver = await factory.resolveForPartition(attachment.partition_code)
      if (driver.deleteStrict) await driver.deleteStrict(attachment.partition_code, attachment.storage_path)
      else await driver.delete(attachment.partition_code, attachment.storage_path)
      summary.filesDeleted += 1
    } catch {
      summary.filesFailed += 1
    }
  }
  if (container.hasRegistration('cache')) {
    const cache = container.resolve<CacheStrategy>('cache')
    summary.cacheEntriesCleared = Number(await runWithCacheTenant(scope.tenantId, () => cache.clear())) || 0
  }
  return summary
}

/** Releases a deleted club's slug: removes the tombstone, which is the club's only row left besides its audit entries. */
export async function releaseClubSlug(container: AwilixContainer, club: ClubIdentity): Promise<void> {
  await emOf(container).execute(
    `delete from club_core_club_settings where id = ? and tenant_id = ? and deleted_at is not null`,
    [club.settingsId, club.tenantId],
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Restore

export type ClubRestoreRefusal =
  | { status: 'refused'; reason: 'not_a_club_archive' | 'checksum_mismatch' | 'tenant_exists' | 'slug_taken' }
  | { status: 'refused'; reason: 'club_rows_exist'; tables: string[] }
  | { status: 'refused'; reason: 'schema_mismatch'; tables: string[] }

export type ClubRestorePlan = {
  manifest: ClubArchiveManifest
  data: Map<string, Record<string, Row[]>>
  zip: JSZip
}

/** Reads and checks an archive: the manifest, the checksum of every data entry and file. */
export async function readClubArchive(
  archivePath: string,
): Promise<ClubRestorePlan | { status: 'refused'; reason: 'not_a_club_archive' | 'checksum_mismatch' }> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(await fs.readFile(archivePath))
  } catch {
    return { status: 'refused', reason: 'not_a_club_archive' }
  }
  const manifestEntry = zip.file(CLUB_ARCHIVE_MANIFEST)
  const manifest = manifestEntry ? parseManifest(await manifestEntry.async('string')) : null
  if (!manifest) return { status: 'refused', reason: 'not_a_club_archive' }
  const data = new Map<string, Record<string, Row[]>>()
  for (const [entryName, checksum] of Object.entries(manifest.checksums)) {
    const entry = zip.file(entryName)
    const text = entry ? await entry.async('string') : null
    if (text === null || sha256(text) !== checksum) return { status: 'refused', reason: 'checksum_mismatch' }
    data.set(entryName, JSON.parse(text) as Record<string, Row[]>)
  }
  for (const file of manifest.files) {
    const entry = zip.file(file.path)
    const buffer = entry ? await entry.async('nodebuffer') : null
    if (!buffer || sha256(buffer) !== file.sha256) return { status: 'refused', reason: 'checksum_mismatch' }
  }
  return { manifest, data, zip }
}

/** The rows of one manifest table from the archive's data. */
function archiveRows(plan: ClubRestorePlan, table: ManifestTable): Row[] {
  return plan.data.get(moduleEntryName(table.module))?.[table.table] ?? []
}

/** Why the target cannot take the club, or null: it must not hold the tenant, the slug or any row of the club. */
async function restoreBlocker(
  container: AwilixContainer,
  em: EntityManager,
  plan: ClubRestorePlan,
): Promise<ClubRestoreRefusal | null> {
  const { club } = plan.manifest
  const scope = { tenantId: club.tenantId, organizationId: club.organizationId }
  const tenant = await em.execute<{ id: string }[]>(`select id from tenants where id = ?`, [club.tenantId])
  if (tenant.length > 0) return { status: 'refused', reason: 'tenant_exists' }
  const holder = await em.execute<{ organization_id: string; deleted_at: Date | null }[]>(
    `select organization_id, deleted_at from club_core_club_settings where public_slug = ?`,
    [club.slug],
  )
  const slugHolder = holder.at(0)
  if (slugHolder && (slugHolder.organization_id !== club.organizationId || slugHolder.deleted_at === null)) {
    return { status: 'refused', reason: 'slug_taken' }
  }
  const { tables, catalogue } = await clubTargets(container, em)
  const nonEmpty: string[] = []
  for (const entry of tables) {
    if (RESTORE_TOLERATED.has(entry.table)) continue
    if ((await countRows(em, entry, scope)) > 0) nonEmpty.push(entry.table)
  }
  if (nonEmpty.length > 0) return { status: 'refused', reason: 'club_rows_exist', tables: nonEmpty.sort() }
  const mismatched = plan.manifest.tables
    .filter((table) => {
      const columns = catalogue.columns.get(table.table)
      const first = archiveRows(plan, table)[0]
      if (!columns) return true
      return first !== undefined && Object.keys(first).some((column) => !columns.includes(column))
    })
    .map((table) => table.table)
  if (mismatched.length > 0) return { status: 'refused', reason: 'schema_mismatch', tables: mismatched.sort() }
  return null
}

export type ClubRestoreSummary = {
  club: ClubArchiveManifest['club']
  tables: { module: string; table: string; rows: number }[]
  files: number
}

/** Encrypts the columns the target's encryption map covers, with the target's key for the club's tenant. */
async function encryptRows(
  em: EntityManager,
  encryption: TenantDataEncryptionService | null,
  entityId: string | undefined,
  rows: Row[],
  scope: ClubScope,
): Promise<Row[]> {
  if (!encryption || !entityId) return rows
  const sealed: Row[] = []
  for (const row of rows) {
    sealed.push(
      (await encryption.encryptEntityPayload(
        entityId,
        row,
        (row.tenant_id as string | null) ?? scope.tenantId,
        (row.organization_id as string | null) ?? null,
        { em },
      )) as Row,
    )
  }
  return sealed
}

async function insertRows(em: EntityManager, table: string, columns: string[], rows: Row[]): Promise<void> {
  const list = columns.map(quoteIdent).join(', ')
  for (let start = 0; start < rows.length; start += INSERT_BATCH) {
    const batch = rows.slice(start, start + INSERT_BATCH)
    await em.execute(
      `insert into ${quoteIdent(table)} (${list})
       select ${list} from json_populate_recordset(null::${quoteIdent(table)}, ?::json)`,
      [JSON.stringify(batch)],
    )
  }
}

/**
 * Restores a club from its archive into this database, in one transaction: the club's tombstone (when the club was
 * deleted here) is replaced, the encryption maps go in first, then every table in foreign-key order, each row
 * encrypted again with this database's key for the club's tenant, then the attachment files through the storage
 * driver. Refuses — before writing — an archive that is not a club export or fails a checksum, a database that holds
 * the tenant, the slug of another club or any row of the club, and a schema without a column the archive has.
 */
export async function restoreClub(
  container: AwilixContainer,
  plan: ClubRestorePlan,
  options: { dryRun: boolean },
): Promise<ClubRestoreSummary | ClubRestoreRefusal> {
  const { club } = plan.manifest
  const scope = { tenantId: club.tenantId, organizationId: club.organizationId }
  const em = emOf(container)
  const blocker = await restoreBlocker(container, em, plan)
  if (blocker) return blocker
  const summary: ClubRestoreSummary = { club, tables: [], files: 0 }
  const ordered = [...plan.manifest.tables].sort(
    (a, b) => Number(b.table === 'encryption_maps') - Number(a.table === 'encryption_maps'),
  )
  if (options.dryRun) {
    summary.tables = ordered
      .filter((table) => table.rows > 0)
      .map((table) => ({ module: table.module, table: table.table, rows: table.rows }))
    summary.files = plan.manifest.files.length
    return summary
  }
  const encryption = encryptionService(container)
  await em.transactional(async (tx) => {
    const { catalogue } = await clubTargets(container, tx)
    const entityIds = entityIdsByTable(tx)
    await tx.execute(
      `delete from club_core_club_settings where public_slug = ? and organization_id = ? and deleted_at is not null`,
      [club.slug, club.organizationId],
    )
    for (const table of ordered) {
      const rows = archiveRows(plan, table)
      if (rows.length === 0) continue
      const writable = new Set(catalogue.columns.get(table.table) ?? [])
      const columns = Object.keys(rows[0] as Row).filter((column) => writable.has(column))
      const sealed = await encryptRows(tx, encryption, entityIds.get(table.table), rows, scope)
      await insertRows(tx, table.table, columns, sealed)
      summary.tables.push({ module: table.module, table: table.table, rows: rows.length })
    }
    const attachments = new Map(
      (archiveRows(plan, { module: 'attachments', table: 'attachments' } as ManifestTable) as unknown as AttachmentRow[]).map(
        (row) => [row.id, row],
      ),
    )
    const factory = container.resolve<StorageDriverFactory>('storageDriverFactory')
    for (const file of plan.manifest.files) {
      const attachment = attachments.get(file.attachmentId)
      const entry = plan.zip.file(file.path)
      if (!attachment || !entry) continue
      const driver = await factory.resolveForPartition(attachment.partition_code)
      await driver.store({
        partitionCode: attachment.partition_code,
        storagePath: attachment.storage_path,
        buffer: await entry.async('nodebuffer'),
        fileName: attachment.file_name,
        tenantId: club.tenantId,
        orgId: club.organizationId,
      })
      summary.files += 1
    }
  })
  return summary
}
