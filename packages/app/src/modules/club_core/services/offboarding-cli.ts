// The operator commands of a club leaving the shared instance (many clubs spec phase 4, REQ-M06, J-M03; #632):
//
//   yarn mercato club_core offboard-club --slug <slug> [--notice-days 30] [--cancel]
//   yarn mercato club_core export-club   --slug <slug> --out <file.zip>
//   yarn mercato club_core delete-club   --slug <slug> --confirm <slug> [--dry-run]
//   yarn mercato club_core restore-club  --in <file.zip> [--dry-run]
//
// Each prints one JSON line with a `status`; a refusal exits 1 before anything is written (`docs/ops/clubs.md`). The
// club is found by its slug through the operator's lookup (`lookupClubForOffboarding`, the D-024 key), and every step
// runs as a job command for that club (`jobCommandContext`, BR-M1).
import { parseArgs } from 'node:util'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'
import { lookupClubForOffboarding, type OffboardingClub } from '../data/queries'
import { eventsConfig } from '../events'
import {
  countsByModule,
  offboardingState,
  parseDeleteOptions,
  parseExportOptions,
  parseOffboardOptions,
  parseRestoreOptions,
  slugReleaseAt,
  type OffboardingRawOptions,
  type Parsed,
} from '../lib/club-offboarding'
import {
  ClubCatalogError,
  deleteClub,
  readClubArchive,
  releaseClubSlug,
  restoreClub,
  type ClubExportSummary,
  type ClubDeletionSummary,
  type ClubRestoreRefusal,
  type ClubRestoreSummary,
} from './club-offboarding'

export const OFFBOARDING_COMMANDS = ['offboard-club', 'export-club', 'delete-club', 'restore-club'] as const
export type OffboardingCommand = (typeof OFFBOARDING_COMMANDS)[number]

const USAGE: Record<OffboardingCommand, string> = {
  'offboard-club': 'Usage: mercato club_core offboard-club --slug <slug> [--notice-days 30] [--cancel]\n',
  'export-club': 'Usage: mercato club_core export-club --slug <slug> --out <file.zip>\n',
  'delete-club': 'Usage: mercato club_core delete-club --slug <slug> --confirm <slug> [--dry-run]\n',
  'restore-club': 'Usage: mercato club_core restore-club --in <file.zip> [--dry-run]\n',
}

type Output = Record<string, unknown> & { status: string }

function print(output: Output): void {
  process.stdout.write(`${JSON.stringify(output)}\n`)
}

/** Prints a refusal and fails the command (the platform CLI exits 1 only on a thrown error). */
function refuse(command: OffboardingCommand, output: Output): never {
  print(output)
  throw new Error(`[internal] ${command} refused, nothing was written: ${String(output.reason ?? output.status)}`)
}

function readRaw(argv: string[]): OffboardingRawOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      slug: { type: 'string' },
      'notice-days': { type: 'string' },
      cancel: { type: 'boolean' },
      out: { type: 'string' },
      confirm: { type: 'string' },
      'dry-run': { type: 'boolean' },
      in: { type: 'string' },
    },
    strict: false,
    allowPositionals: true,
  })
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value === 'string' || typeof value === 'boolean'),
  ) as OffboardingRawOptions
}

function options<T>(command: OffboardingCommand, parsed: Parsed<T>): T {
  if (parsed.ok) return parsed.options
  process.stderr.write(USAGE[command])
  return refuse(command, { status: 'invalid', problems: parsed.problems })
}

function emOf(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

async function liveClub(command: OffboardingCommand, container: AwilixContainer, slug: string) {
  const club = await lookupClubForOffboarding(emOf(container), slug)
  if (!club) return refuse(command, { status: 'refused', reason: 'club_not_found', slug })
  if (club.deletedAt) return refuse(command, { status: 'refused', reason: 'club_deleted', slug })
  return club
}

function scopeOf(club: OffboardingClub) {
  return { tenantId: club.tenantId, organizationId: club.organizationId }
}

/** Runs a job command for the club; a refusal of the command (an HTTP error code) is printed and fails the command. */
async function execute<T>(
  command: OffboardingCommand,
  container: AwilixContainer,
  scope: { tenantId: string; organizationId: string },
  commandId: string,
  input: Record<string, unknown>,
): Promise<T> {
  const commandBus = container.resolve<CommandBus>('commandBus')
  try {
    const { result } = await commandBus.execute<Record<string, unknown>, T>(commandId, {
      input,
      ctx: jobCommandContext(container, scope),
    })
    return result
  } catch (error: unknown) {
    if (error instanceof ClubCatalogError) {
      return refuse(command, {
        status: 'refused',
        reason: 'tables_not_covered',
        uncovered: error.uncovered,
        missing: error.missing,
      })
    }
    if (isCrudHttpError(error)) {
      const code = typeof error.body.code === 'string' ? error.body.code : 'refused'
      return refuse(command, { status: 'refused', reason: code })
    }
    throw error
  }
}

async function offboard(argv: string[]): Promise<void> {
  const opts = options('offboard-club', parseOffboardOptions(readRaw(argv)))
  // Options are checked before the app boots, so a usage error prints its line before any log line.
  const container = await createRequestContainer()
  const club = await liveClub('offboard-club', container, opts.slug)
  const result = await execute<{ noticeAt: string | null; deleteAfter: string | null; changed: boolean }>(
    'offboard-club',
    container,
    scopeOf(club),
    'club_core.clubs.offboard',
    { settingsId: club.settingsId, noticeDays: opts.noticeDays, cancel: opts.cancel },
  )
  const status = !result.changed ? 'unchanged' : opts.cancel ? 'cancelled' : 'offboarded'
  print({ status, slug: club.slug, ...scopeOf(club), noticeAt: result.noticeAt, deleteAfter: result.deleteAfter })
}

async function exportCommand(argv: string[]): Promise<void> {
  const opts = options('export-club', parseExportOptions(readRaw(argv)))
  const container = await createRequestContainer()
  const club = await liveClub('export-club', container, opts.slug)
  const { summary } = await execute<{ summary: ClubExportSummary }>(
    'export-club',
    container,
    scopeOf(club),
    'club_core.clubs.export',
    { settingsId: club.settingsId, slug: club.slug, out: opts.out },
  )
  print({
    status: 'exported',
    slug: club.slug,
    ...scopeOf(club),
    path: summary.path,
    sha256: summary.sha256,
    bytes: summary.bytes,
    files: summary.files,
    missingFiles: summary.missingFiles,
    rows: countsByModule(summary.tables),
  })
}

async function deleteCommand(argv: string[]): Promise<void> {
  const opts = options('delete-club', parseDeleteOptions(readRaw(argv)))
  const container = await createRequestContainer()
  const club = await lookupClubForOffboarding(emOf(container), opts.slug)
  if (!club) return refuse('delete-club', { status: 'refused', reason: 'club_not_found', slug: opts.slug })
  const now = new Date()
  if (club.deletedAt) {
    // Deleted before: only its tombstone is left, which keeps the slug reserved for 90 days (BR-M4).
    const releaseAt = slugReleaseAt(club.deletedAt)
    if (now.getTime() >= releaseAt.getTime() && !opts.dryRun) {
      await releaseClubSlug(container, { ...scopeOf(club), slug: club.slug, settingsId: club.settingsId })
      return print({ status: 'slug_released', slug: club.slug, ...scopeOf(club) })
    }
    return print({
      status: 'already_deleted',
      slug: club.slug,
      ...scopeOf(club),
      deletedAt: club.deletedAt.toISOString(),
      slugReleaseAt: releaseAt.toISOString(),
    })
  }
  const state = offboardingState(club.deleteAfter, now)
  if (state.state === 'active') return refuse('delete-club', { status: 'refused', reason: 'not_offboarded' })
  if (state.state === 'notice') {
    return refuse('delete-club', {
      status: 'refused',
      reason: 'notice_running',
      deleteAfter: state.deleteAfter.toISOString(),
    })
  }
  const identity = { ...scopeOf(club), slug: club.slug, settingsId: club.settingsId }
  if (opts.dryRun) {
    let summary: ClubDeletionSummary
    try {
      summary = await deleteClub(container, identity, { dryRun: true })
    } catch (error: unknown) {
      if (!(error instanceof ClubCatalogError)) throw error
      return refuse('delete-club', {
        status: 'refused',
        reason: 'tables_not_covered',
        uncovered: error.uncovered,
        missing: error.missing,
      })
    }
    return print({ status: 'dry-run', slug: club.slug, ...scopeOf(club), tables: summary.tables })
  }
  const result = await execute<{ deletedAt: string; summary: ClubDeletionSummary }>(
    'delete-club',
    container,
    scopeOf(club),
    'club_core.clubs.delete',
    { settingsId: club.settingsId, slug: club.slug },
  )
  await eventsConfig.emit('club_core.club.deleted', { id: club.organizationId, ...scopeOf(club) }, { persistent: true })
  print({
    status: 'deleted',
    slug: club.slug,
    ...scopeOf(club),
    deletedAt: result.deletedAt,
    slugReleaseAt: slugReleaseAt(new Date(result.deletedAt)).toISOString(),
    rows: countsByModule(result.summary.tables),
    tables: result.summary.tables,
    schedulesUnregistered: result.summary.schedulesUnregistered,
    filesDeleted: result.summary.filesDeleted,
    filesFailed: result.summary.filesFailed,
    // Derived from the master secret and the tenant id (Q-M07): nothing to destroy until a key store holds the keys.
    encryptionKey: 'derived',
  })
}

function restoreOutput(outcome: ClubRestoreSummary | ClubRestoreRefusal, dryRun: boolean): Output {
  if ('status' in outcome) return outcome
  return {
    status: dryRun ? 'dry-run' : 'restored',
    slug: outcome.club.slug,
    tenantId: outcome.club.tenantId,
    organizationId: outcome.club.organizationId,
    rows: countsByModule(outcome.tables),
    tables: outcome.tables,
    files: outcome.files,
  }
}

async function restoreCommand(argv: string[]): Promise<void> {
  const opts = options('restore-club', parseRestoreOptions(readRaw(argv)))
  const container = await createRequestContainer()
  const plan = await readClubArchive(opts.archive)
  if ('status' in plan) return refuse('restore-club', plan)
  const scope = { tenantId: plan.manifest.club.tenantId, organizationId: plan.manifest.club.organizationId }
  let outcome: ClubRestoreSummary | ClubRestoreRefusal
  if (opts.dryRun) {
    outcome = await restoreClub(container, plan, { dryRun: true })
  } else {
    outcome = (
      await execute<{ outcome: ClubRestoreSummary | ClubRestoreRefusal }>(
        'restore-club',
        container,
        scope,
        'club_core.clubs.restore',
        { archive: opts.archive },
      )
    ).outcome
  }
  const output = restoreOutput(outcome, opts.dryRun)
  if (output.status === 'refused') return refuse('restore-club', output)
  print(output)
}

/** Runs one of the offboarding commands with its arguments. */
export async function runOffboardingCli(command: OffboardingCommand, argv: string[]): Promise<void> {
  if (command === 'offboard-club') return offboard(argv)
  if (command === 'export-club') return exportCommand(argv)
  if (command === 'delete-club') return deleteCommand(argv)
  return restoreCommand(argv)
}
