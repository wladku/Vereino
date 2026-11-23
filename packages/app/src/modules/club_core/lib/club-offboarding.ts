// A club leaving the shared instance (many clubs spec phase 4, REQ-M06, DD-M09, BR-M4, J-M03; #632): the options of the
// operator commands `club_core offboard-club`, `export-club`, `delete-club` and `restore-club`, the notice period, the
// tables a club's export and deletion cover (*Deletion targets*), their order, and the archive's manifest. Pure: the
// database catalogue, the clock and the archive bytes are passed in.

/**
 * Days between the notice and the first possible deletion (owner's decision Q-M06, 2026-11-23): 30 by default and at
 * least, so no command shortens the notice; a longer one up to a year when the club asks for it.
 */
export const OFFBOARDING_NOTICE_DAYS_DEFAULT = 30
export const OFFBOARDING_NOTICE_DAYS_MAX = 365
/** Days a deleted club's slug stays reserved, so old links never reach a new club (BR-M4, Q-M06). */
export const SLUG_RESERVATION_DAYS = 90
const DAY_MS = 86_400_000

export const CLUB_ARCHIVE_FORMAT = 'vereino-club-export'
export const CLUB_ARCHIVE_VERSION = 1
export const CLUB_ARCHIVE_MANIFEST = 'manifest.json'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[0-9a-f]{64}$/

/**
 * How a table's rows belong to a club. `tenant`: the rows with the club's `tenant_id`. `user`: the rows whose
 * `user_id` is one of the club's users (sessions, password resets, user roles; *Deletion targets* step 3). `tenant_row`:
 * the club's own row of `tenants`.
 */
export type ClubTableKey = 'tenant' | 'user' | 'tenant_row'

/**
 * What the export does with a table. `data`: exported and restored. `derived`: deleted, not exported — an index or a
 * work queue the platform rebuilds after a restore (`query_index reindex`). `secret`: deleted, not exported — a sign-in
 * token, an API key or a provider credential that must not leave the instance in a file; re-created after a restore.
 */
export type ClubTableKind = 'data' | 'derived' | 'secret'

export type ClubTable = { module: string; table: string; key: ClubTableKey; kind: ClubTableKind }

function platform(module: string, kind: ClubTableKind, tables: string[], key: ClubTableKey = 'tenant'): ClubTable[] {
  return tables.map((table) => ({ module, table, key, kind }))
}

/**
 * Platform tables that hold a club's rows (*Deletion targets* steps 2 and 3), grouped by the platform module that owns
 * them. The installed table names were read from the catalogue of `@open-mercato/*` 0.9.0; a table the platform adds
 * later is not covered until it is listed here, and `export-club` and `delete-club` refuse to run until then
 * (`uncoveredTables`). Reviewed against `.ai/guides/upstream/BACKWARD_COMPATIBILITY.md`: the rows are deleted by their
 * tenant or user key only, never by a change to a platform table.
 */
export const PLATFORM_CLUB_TABLES: readonly ClubTable[] = [
  ...platform('directory', 'data', ['tenants'], 'tenant_row'),
  ...platform('directory', 'data', ['organizations']),
  ...platform('auth', 'data', [
    'users',
    'roles',
    'role_acls',
    'user_acls',
    'user_consents',
    'role_sidebar_preferences',
    'user_sidebar_preferences',
    'sidebar_variants',
  ]),
  ...platform('auth', 'data', ['user_roles'], 'user'),
  ...platform('auth', 'secret', ['sessions', 'password_resets'], 'user'),
  ...platform('api_keys', 'secret', ['api_keys']),
  ...platform('audit_logs', 'data', ['action_logs', 'access_logs']),
  ...platform('attachments', 'data', ['attachments', 'attachment_partitions']),
  ...platform('attachments', 'derived', ['attachment_quota_reservations']),
  ...platform('entities', 'data', [
    'encryption_maps',
    'custom_entities',
    'custom_entities_storage',
    'custom_field_defs',
    'custom_field_entity_configs',
    'custom_field_values',
  ]),
  ...platform('dictionaries', 'data', ['dictionaries', 'dictionary_entries']),
  ...platform('dashboards', 'data', ['dashboard_layouts', 'dashboard_role_widgets', 'dashboard_user_widgets']),
  ...platform('configs', 'data', ['module_configs', 'upgrade_action_runs']),
  ...platform('notifications', 'data', [
    'notifications',
    'notification_preferences',
    'notification_type_overrides',
    'notification_types',
  ]),
  ...platform('communication_channels', 'data', [
    'communication_channels',
    'channel_thread_mappings',
    'external_conversations',
    'external_messages',
    'message_channel_links',
    'message_reactions',
  ]),
  ...platform('communication_channels', 'derived', ['channel_ingest_dead_letters']),
  ...platform('communication_channels', 'secret', ['channel_thread_tokens']),
  ...platform('integrations', 'data', ['integration_states', 'integration_logs', 'sync_external_id_mappings']),
  ...platform('integrations', 'secret', ['integration_credentials']),
  ...platform('payment_gateways', 'data', [
    'gateway_transactions',
    'gateway_payment_operations',
    'gateway_session_initializations',
    'gateway_webhook_events',
  ]),
  ...platform('scheduler', 'data', ['scheduled_jobs']),
  ...platform('progress', 'derived', ['progress_jobs']),
  ...platform('query_index', 'derived', [
    'entity_indexes',
    'entity_index_coverage',
    'entity_index_jobs',
    'indexer_error_logs',
    'indexer_status_logs',
  ]),
  ...platform('search', 'derived', ['search_tokens']),
]

/** A Vereino module's tables as its contributor declares them (`@/modules/foundation` `ClubDataContributor`). */
export type ModuleTables = { module: string; tables: readonly string[] }

/**
 * Every table of a club: the Vereino modules' tables (exported, keyed by tenant) and the platform tables. Throws when
 * a table is claimed twice, so two owners never both export or delete it.
 */
export function clubTables(modules: readonly ModuleTables[]): ClubTable[] {
  const all: ClubTable[] = [
    ...modules.flatMap((entry) =>
      entry.tables.map((table): ClubTable => ({ module: entry.module, table, key: 'tenant', kind: 'data' })),
    ),
    ...PLATFORM_CLUB_TABLES,
  ]
  const seen = new Map<string, string>()
  for (const entry of all) {
    const owner = seen.get(entry.table)
    if (owner)
      throw new Error(`[internal] club table claimed by two owners: ${[entry.table, owner, entry.module].join(' / ')}`)
    seen.set(entry.table, entry.module)
  }
  return all
}

/**
 * Tables of the database that carry a `tenant_id` column but no module or platform list covers, sorted. A club cannot
 * be exported or deleted completely while one exists (TEST-M07's catalogue check, enforced at run time).
 */
export function uncoveredTables(tenantTables: readonly string[], covered: readonly ClubTable[]): string[] {
  const known = new Set(covered.map((entry) => entry.table))
  return tenantTables.filter((table) => !known.has(table)).sort()
}

/** Listed tables the database does not have (a module disabled, or a platform table renamed), sorted. */
export function missingTables(existing: readonly string[], covered: readonly ClubTable[]): string[] {
  const present = new Set(existing)
  return covered
    .map((entry) => entry.table)
    .filter((table) => !present.has(table))
    .sort()
}

/** A foreign key: `table` references `references`. */
export type ForeignKeyEdge = { table: string; references: string }

/**
 * Orders `tables` so every referenced table comes before the tables that reference it (inserting a restore); delete in
 * the reverse order. Self-references and references to tables outside the list are ignored. Ties keep the given
 * order. Throws on a cycle, which the platform's schema does not have today.
 */
export function orderForInsert(tables: readonly string[], edges: readonly ForeignKeyEdge[]): string[] {
  const listed = new Set(tables)
  const parents = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]))
  for (const edge of edges) {
    if (edge.table === edge.references || !listed.has(edge.table) || !listed.has(edge.references)) continue
    ;(parents.get(edge.table) as Set<string>).add(edge.references)
  }
  const ordered: string[] = []
  const placed = new Set<string>()
  while (ordered.length < tables.length) {
    const next = tables.find(
      (table) => !placed.has(table) && [...(parents.get(table) as Set<string>)].every((p) => placed.has(p)),
    )
    if (!next) {
      const left = tables.filter((table) => !placed.has(table))
      throw new Error(`[internal] foreign keys form a cycle among: ${left.join(', ')}`)
    }
    ordered.push(next)
    placed.add(next)
  }
  return ordered
}

// ---------------------------------------------------------------------------------------------------------------------
// The notice period

export type OffboardingDates = { noticeAt: Date; deleteAfter: Date }

/** The notice given at `now` and the first moment the club may be deleted, `noticeDays` later. */
export function offboardingDates(now: Date, noticeDays: number): OffboardingDates {
  return { noticeAt: new Date(now.getTime()), deleteAfter: new Date(now.getTime() + noticeDays * DAY_MS) }
}

export type OffboardingState =
  { state: 'active' } | { state: 'notice'; deleteAfter: Date } | { state: 'due'; deleteAfter: Date }

/** Whether a club may be deleted at `now`: only after notice was given and the notice period ended (J-M03). */
export function offboardingState(deleteAfter: Date | null | undefined, now: Date): OffboardingState {
  if (!deleteAfter) return { state: 'active' }
  if (now.getTime() < deleteAfter.getTime()) return { state: 'notice', deleteAfter }
  return { state: 'due', deleteAfter }
}

/** When a deleted club's slug may be released: `SLUG_RESERVATION_DAYS` after the deletion (BR-M4). */
export function slugReleaseAt(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + SLUG_RESERVATION_DAYS * DAY_MS)
}

// ---------------------------------------------------------------------------------------------------------------------
// Command options

export type OffboardingOptionProblem = { option: string; problem: 'required' | 'invalid' | 'mismatch' }

export type OffboardOptions = { slug: string; noticeDays: number; cancel: boolean }
export type ExportOptions = { slug: string; out: string }
export type DeleteOptions = { slug: string; dryRun: boolean }
export type RestoreOptions = { archive: string; dryRun: boolean }

export type Parsed<T> = { ok: true; options: T } | { ok: false; problems: OffboardingOptionProblem[] }

export type OffboardingRawOptions = Record<string, string | boolean | undefined>

function text(raw: OffboardingRawOptions, name: string): string {
  const value = raw[name]
  return typeof value === 'string' ? value.trim() : ''
}

function slugOption(raw: OffboardingRawOptions, problems: OffboardingOptionProblem[]): string {
  const slug = text(raw, 'slug').toLowerCase()
  if (!slug) problems.push({ option: 'slug', problem: 'required' })
  else if (!SLUG_PATTERN.test(slug)) problems.push({ option: 'slug', problem: 'invalid' })
  return slug
}

function result<T>(problems: OffboardingOptionProblem[], options: T): Parsed<T> {
  return problems.length > 0 ? { ok: false, problems } : { ok: true, options }
}

/** `offboard-club --slug <slug> [--notice-days 30] [--cancel]`. */
export function parseOffboardOptions(raw: OffboardingRawOptions): Parsed<OffboardOptions> {
  const problems: OffboardingOptionProblem[] = []
  const slug = slugOption(raw, problems)
  const daysText = text(raw, 'notice-days')
  const noticeDays = daysText ? Number(daysText) : OFFBOARDING_NOTICE_DAYS_DEFAULT
  if (
    (daysText && !/^\d+$/.test(daysText)) ||
    noticeDays < OFFBOARDING_NOTICE_DAYS_DEFAULT ||
    noticeDays > OFFBOARDING_NOTICE_DAYS_MAX
  ) {
    problems.push({ option: 'notice-days', problem: 'invalid' })
  }
  return result(problems, { slug, noticeDays, cancel: raw.cancel === true })
}

/** `export-club --slug <slug> --out <file.zip>`. */
export function parseExportOptions(raw: OffboardingRawOptions): Parsed<ExportOptions> {
  const problems: OffboardingOptionProblem[] = []
  const slug = slugOption(raw, problems)
  const out = text(raw, 'out')
  if (!out) problems.push({ option: 'out', problem: 'required' })
  else if (!out.toLowerCase().endsWith('.zip')) problems.push({ option: 'out', problem: 'invalid' })
  return result(problems, { slug, out })
}

/** `delete-club --slug <slug> --confirm <slug> [--dry-run]`: the slug typed twice guards against a wrong club. */
export function parseDeleteOptions(raw: OffboardingRawOptions): Parsed<DeleteOptions> {
  const problems: OffboardingOptionProblem[] = []
  const slug = slugOption(raw, problems)
  const confirm = text(raw, 'confirm').toLowerCase()
  if (!confirm) problems.push({ option: 'confirm', problem: 'required' })
  else if (slug && confirm !== slug) problems.push({ option: 'confirm', problem: 'mismatch' })
  return result(problems, { slug, dryRun: raw['dry-run'] === true })
}

/** `restore-club --in <file.zip> [--dry-run]`. */
export function parseRestoreOptions(raw: OffboardingRawOptions): Parsed<RestoreOptions> {
  const problems: OffboardingOptionProblem[] = []
  const archive = text(raw, 'in')
  if (!archive) problems.push({ option: 'in', problem: 'required' })
  return result(problems, { archive, dryRun: raw['dry-run'] === true })
}

// ---------------------------------------------------------------------------------------------------------------------
// The archive

/** One table of the archive: its module file, row count and the columns that were decrypted for the export. */
export type ManifestTable = { module: string; table: string; key: ClubTableKey; rows: number; decrypted: string[] }

/** One attachment file of the archive, stored at `path`, with its size and SHA-256. */
export type ManifestFile = { attachmentId: string; path: string; bytes: number; sha256: string }

export type ClubArchiveManifest = {
  format: typeof CLUB_ARCHIVE_FORMAT
  version: typeof CLUB_ARCHIVE_VERSION
  exportedAt: string
  club: { slug: string; tenantId: string; organizationId: string }
  tables: ManifestTable[]
  files: ManifestFile[]
  /** SHA-256 of every `data/<module>.json` entry, by entry name. */
  checksums: Record<string, string>
}

/** The archive entry holding one module's rows: `{ <table>: row[] }`. */
export function moduleEntryName(module: string): string {
  return `data/${module}.json`
}

/** The archive entry of an attachment file; the stored file name is kept after the id, made safe for every unzip. */
export function fileEntryName(attachmentId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '_') || 'file'
  return `files/${attachmentId}/${safe}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function validTable(value: unknown): value is ManifestTable {
  return (
    isRecord(value) &&
    typeof value.module === 'string' &&
    typeof value.table === 'string' &&
    (value.key === 'tenant' || value.key === 'user' || value.key === 'tenant_row') &&
    isNonNegativeInteger(value.rows) &&
    Array.isArray(value.decrypted) &&
    value.decrypted.every((column) => typeof column === 'string')
  )
}

function validFile(value: unknown): value is ManifestFile {
  return (
    isRecord(value) &&
    typeof value.attachmentId === 'string' &&
    UUID_PATTERN.test(value.attachmentId) &&
    typeof value.path === 'string' &&
    value.path.startsWith(`files/${value.attachmentId}/`) &&
    isNonNegativeInteger(value.bytes) &&
    typeof value.sha256 === 'string' &&
    SHA256_PATTERN.test(value.sha256)
  )
}

/** Parses and checks an archive's `manifest.json`; null when it is not a Vereino club export of this version. */
export function parseManifest(raw: string): ClubArchiveManifest | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || value.format !== CLUB_ARCHIVE_FORMAT || value.version !== CLUB_ARCHIVE_VERSION) return null
  const club = value.club
  if (
    !isRecord(club) ||
    typeof club.slug !== 'string' ||
    !SLUG_PATTERN.test(club.slug) ||
    typeof club.tenantId !== 'string' ||
    !UUID_PATTERN.test(club.tenantId) ||
    typeof club.organizationId !== 'string' ||
    !UUID_PATTERN.test(club.organizationId)
  ) {
    return null
  }
  if (typeof value.exportedAt !== 'string' || Number.isNaN(Date.parse(value.exportedAt))) return null
  if (!Array.isArray(value.tables) || !value.tables.every(validTable)) return null
  if (!Array.isArray(value.files) || !value.files.every(validFile)) return null
  const checksums = value.checksums
  if (
    !isRecord(checksums) ||
    !Object.values(checksums).every((sum) => typeof sum === 'string' && SHA256_PATTERN.test(sum))
  ) {
    return null
  }
  const modules = new Set(value.tables.map((table) => table.module))
  if (![...modules].every((module) => typeof checksums[moduleEntryName(module)] === 'string')) return null
  return value as ClubArchiveManifest
}

/** Row counts by module, for the operator's report. */
export function countsByModule(tables: readonly { module: string; rows: number }[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const table of tables) counts[table.module] = (counts[table.module] ?? 0) + table.rows
  return counts
}

type ReviverContext = { source?: string }

/**
 * Parses one row as PostgreSQL's `to_jsonb(row)::text` printed it, keeping every number whose JavaScript value would
 * not print back to the same digits (a long `numeric`, a `bigint` above 2^53) as its exact source text, so an export
 * restores the same values. `json_populate_recordset` reads such a string back into the numeric column.
 */
export function parseRowJson(text: string): Record<string, unknown> {
  const reviver = (_key: string, value: unknown, context?: ReviverContext): unknown =>
    typeof value === 'number' && context?.source !== undefined && String(value) !== context.source
      ? context.source
      : value
  const row: unknown = JSON.parse(text, reviver)
  if (!isRecord(row)) throw new Error('[internal] a table row is not a JSON object')
  return row
}

// ---------------------------------------------------------------------------------------------------------------------
// What leaves the instance, and what an archive may write back

/**
 * Columns of exported tables that are set to null in the archive: credentials that must not reach the club in a file
 * (*Data out*, like the `secret` tables). `users.password_hash` would let the holder of the archive crack every member's
 * password offline; `foundation_deliveries.secret_params` holds the raw one-time link tokens of deliveries still in the
 * queue. After a restore the members set a password again (the administrator through a reset link), and a queued
 * delivery's link no longer works.
 */
export const CLUB_EXPORT_REDACTED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  users: ['password_hash'],
  foundation_deliveries: ['secret_params'],
}

/** The row with the redacted columns of `table` set to null; the row itself when the table has none. */
export function redactExportRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const columns = CLUB_EXPORT_REDACTED_COLUMNS[table]
  if (!columns) return row
  const redacted = { ...row }
  for (const column of columns) if (column in redacted) redacted[column] = null
  return redacted
}

/**
 * Why an archive's tables or rows reach beyond its own club, sorted, or an empty list. The checksums sit inside the
 * archive and only catch corruption, so a restore trusts nothing else in it: every manifest table must be one of the
 * club's exported (`data`) tables with the same module and key, every tenant-keyed row must carry the manifest's
 * tenant, the tenant row must be that tenant, and every user-keyed row must belong to one of the archive's users.
 */
export function archiveScopeViolations(
  manifest: ClubArchiveManifest,
  rowsOf: (table: ManifestTable) => readonly Record<string, unknown>[],
  clubTablesList: readonly ClubTable[],
): string[] {
  const exported = new Map(clubTablesList.filter((entry) => entry.kind === 'data').map((entry) => [entry.table, entry]))
  const { tenantId } = manifest.club
  const users = manifest.tables.find((table) => table.table === 'users')
  const userIds = new Set((users ? rowsOf(users) : []).map((row) => row.id))
  const violations = new Set<string>()
  for (const table of manifest.tables) {
    const entry = exported.get(table.table)
    if (!entry || entry.module !== table.module || entry.key !== table.key) {
      violations.add(`${table.table}: not a table of a club export`)
      continue
    }
    for (const row of rowsOf(table)) {
      const inScope =
        entry.key === 'tenant_row'
          ? row.id === tenantId
          : entry.key === 'user'
            ? userIds.has(row.user_id)
            : row.tenant_id === tenantId
      if (!inScope) violations.add(`${table.table}: a row of another tenant`)
    }
  }
  return [...violations].sort()
}

const PARTITION_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i

/**
 * Whether an archived attachment's partition code and storage path are safe to write: a plain code, and a relative
 * path without `..`, NUL or a drive letter. The local storage driver joins both to its root without a containment
 * check on write, so an archive could otherwise place a file anywhere the process can write.
 */
export function safeAttachmentLocation(partitionCode: unknown, storagePath: unknown): boolean {
  if (typeof partitionCode !== 'string' || !PARTITION_CODE_PATTERN.test(partitionCode)) return false
  if (typeof storagePath !== 'string' || storagePath.length === 0 || storagePath.includes('\0')) return false
  if (/^([/\\]|[a-zA-Z]:)/.test(storagePath)) return false
  return storagePath.split(/[/\\]/).every((segment) => segment !== '..')
}
