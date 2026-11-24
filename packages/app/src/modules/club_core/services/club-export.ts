// The club administrator's own export (many clubs spec phase 4, REQ-M06; E22-S06b, #676). `POST
// /api/club_core/offboarding/export` runs the command `club_core.clubs.export_request`, which creates a platform
// progress job (the export's only state, `lib/club-export.ts`), and then enqueues it here; the worker
// `club_core:club-export` runs the operator's `club_core.clubs.export` command for the job's club (the same
// `exportClub` service, as a job of that club, BR-M1) into a temporary file, stores the archive in the private
// attachments partition and completes the job. `GET /api/club_core/offboarding/export` reads the newest finished
// archive back. A newer export replaces the older archives; `delete-club` removes every archive of the club (`deleteClub`). Jobs carry
// ids and the scope the server wrote; a failure records an error code, never a message or a path.
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { ProgressJob } from '@open-mercato/core/modules/progress/data/entities'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { createModuleQueue, type Queue } from '@open-mercato/queue'
import { jobCommandContext } from '@/modules/foundation'
import { clubCoreErrors } from '../api/errors'
import { ClubSettings } from '../data/entities'
import {
  CLUB_EXPORT_JOB_TYPE,
  CLUB_EXPORT_PARTITION,
  CLUB_EXPORT_QUEUE,
  clubExportDownload,
  clubExportFileName,
  offboardingView,
  storagePathOf,
  supersededArchives,
  type ClubExportJobLike,
  type OffboardingView,
} from '../lib/club-export'

const logger = createLogger('club_core').child({ component: 'club-export' })

export type ClubExportScope = { tenantId: string; organizationId: string }
export type ClubExportJobPayload = ClubExportScope & { jobId: string }

type ProgressContext = ClubExportScope & { userId?: string | null }

/** The part of the `club_core.clubs.export` result the job records (counts and checksum only). */
type ExportCommandResult = { summary: { bytes: number; sha256: string; files: number; missingFiles: string[] } }

/** The part of the platform `ProgressService` (`progressService` in DI) the export uses, declared structurally. */
export type ProgressServiceLike = {
  createJob(input: Record<string, unknown>, ctx: ProgressContext): Promise<{ id: string }>
  getJob(jobId: string, ctx: ProgressContext): Promise<{ id: string; jobType: string; status: string } | null>
  startJob(jobId: string, ctx: ProgressContext): Promise<unknown>
  touchJobHeartbeat(jobId: string, ctx: ProgressContext): Promise<void>
  completeJob(jobId: string, input: Record<string, unknown>, ctx: ProgressContext): Promise<unknown>
  failJob(jobId: string, input: Record<string, unknown>, ctx: ProgressContext): Promise<unknown>
}

/** The platform storage driver of a partition (`attachments` `storageDriverFactory`). */
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
}
type StorageDriverFactory = { resolveForPartition(partitionCode: string): Promise<StorageDriver> }

/** How often a running export tells the platform it is alive (the stale sweep fails a silent job). */
const HEARTBEAT_MS = 30_000
/** How many export jobs of a club the routes look at (newest first). */
const JOB_LOOKUP_LIMIT = 50

let exportQueue: Queue<ClubExportJobPayload> | null = null

/** The process-wide queue of `club_core:club-export` (`QUEUE_STRATEGY` local or async), created once. */
export function getClubExportQueue(): Queue<ClubExportJobPayload> {
  exportQueue ??= createModuleQueue<ClubExportJobPayload>(CLUB_EXPORT_QUEUE, { concurrency: 1 })
  return exportQueue
}

export function progressServiceOf(container: AwilixContainer): ProgressServiceLike {
  return container.resolve<ProgressServiceLike>('progressService')
}

function storageDriver(container: AwilixContainer): Promise<StorageDriver> {
  return container.resolve<StorageDriverFactory>('storageDriverFactory').resolveForPartition(CLUB_EXPORT_PARTITION)
}

/** The club's export jobs, newest first, read in the club's tenant and organization. */
export async function findClubExportJobs(em: EntityManager, scope: ClubExportScope): Promise<ClubExportJobLike[]> {
  const rows = await em.find(
    ProgressJob,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, jobType: CLUB_EXPORT_JOB_TYPE },
    { orderBy: { createdAt: 'DESC' }, limit: JOB_LOOKUP_LIMIT, disableIdentityMap: true },
  )
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt ?? null,
    organizationId: row.organizationId ?? null,
    resultSummary: row.resultSummary ?? null,
  }))
}

/**
 * Enqueues a requested export. When the queue does not take it, the job is failed at once (so the next request is
 * not refused as `export_running`) and the error is rethrown to the route.
 */
export async function publishClubExport(container: AwilixContainer, payload: ClubExportJobPayload): Promise<void> {
  try {
    await getClubExportQueue().enqueue(payload)
  } catch (error: unknown) {
    await progressServiceOf(container)
      .failJob(payload.jobId, { errorMessage: 'club_core.export.queue_unavailable' }, payload)
      .catch(() => undefined)
    throw error
  }
}

function codeOf(error: unknown): string {
  const body = typeof error === 'object' && error !== null ? (error as { body?: { code?: unknown } }).body : undefined
  return typeof body?.code === 'string' ? body.code : 'club_core.export.failed'
}

/**
 * The worker's body: runs one pending export job of the payload's club. A job that is not a pending club export (a
 * repeated delivery, a job of another type) is left alone. Never throws: the job, not the queue, records the outcome.
 */
export async function runClubExportJob(container: AwilixContainer, payload: ClubExportJobPayload): Promise<void> {
  const scope = { tenantId: payload.tenantId, organizationId: payload.organizationId }
  const progress = progressServiceOf(container)
  const job = await progress.getJob(payload.jobId, scope)
  if (!job || job.jobType !== CLUB_EXPORT_JOB_TYPE || job.status !== 'pending') return
  await progress.startJob(job.id, scope)
  const heartbeat = setInterval(() => {
    progress.touchJobHeartbeat(job.id, scope).catch(() => undefined)
  }, HEARTBEAT_MS)
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'vereino-club-export-'))
  try {
    const em = container.resolve<EntityManager>('em').fork()
    const settings = await em.findOne(ClubSettings, { ...scope, deletedAt: null }, { fields: ['id', 'publicSlug'] })
    if (!settings) return await clubCoreErrors.throw('club_not_found')
    const out = path.join(work, 'club.zip')
    const { result } = await container
      .resolve<CommandBus>('commandBus')
      .execute<Record<string, unknown>, ExportCommandResult>('club_core.clubs.export', {
        input: { settingsId: settings.id, slug: settings.publicSlug ?? 'club', out },
        ctx: jobCommandContext(container, scope),
      })
    const storagePath = storagePathOf({ id: job.id, organizationId: scope.organizationId }) as string
    const driver = await storageDriver(container)
    await driver.store({
      partitionCode: CLUB_EXPORT_PARTITION,
      storagePath,
      buffer: await fs.readFile(out),
      fileName: 'club.zip',
      tenantId: scope.tenantId,
      orgId: scope.organizationId,
    })
    await progress.completeJob(
      job.id,
      {
        resultSummary: {
          bytes: result.summary.bytes,
          sha256: result.summary.sha256,
          files: result.summary.files,
          missingFiles: result.summary.missingFiles.length,
        },
      },
      scope,
    )
    for (const older of supersededArchives(await findClubExportJobs(em, scope), job.id)) {
      await driver.delete(CLUB_EXPORT_PARTITION, older)
    }
  } catch (error: unknown) {
    const code = codeOf(error)
    logger.warn('Club export failed', { jobId: job.id, code })
    getTelemetryRuntime()?.reportError(error, { module: 'club_core', code })
    await progress.failJob(job.id, { errorMessage: code }, scope).catch(() => undefined)
  } finally {
    clearInterval(heartbeat)
    await fs.rm(work, { recursive: true, force: true })
  }
}

/** `GET /api/club_core/offboarding`: the club's notice dates and its newest export, in the club's scope. */
export async function readOffboardingView(
  container: AwilixContainer,
  scope: ClubExportScope,
): Promise<OffboardingView> {
  const em = container.resolve<EntityManager>('em').fork()
  const settings = await em.findOne(
    ClubSettings,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null },
    { fields: ['id', 'offboardingNoticeAt', 'offboardingDeleteAfter'] },
  )
  const jobs = settings?.offboardingDeleteAfter ? await findClubExportJobs(em, scope) : []
  return offboardingView(
    { noticeAt: settings?.offboardingNoticeAt, deleteAfter: settings?.offboardingDeleteAfter },
    jobs,
    new Date(),
  )
}

export type ClubExportArchive = { fileName: string; buffer: Buffer }

/**
 * The newest finished archive of the club: 409 `export_running` while an export runs, 404 `export_not_found` without a
 * finished archive (or when the storage no longer has it).
 */
export async function readClubExportArchive(
  container: AwilixContainer,
  scope: ClubExportScope,
): Promise<ClubExportArchive> {
  const em = container.resolve<EntityManager>('em').fork()
  const download = clubExportDownload(await findClubExportJobs(em, scope))
  if (download.kind === 'running') return clubCoreErrors.throw('export_running')
  if (download.kind === 'none') return clubCoreErrors.throw('export_not_found')
  const driver = await storageDriver(container)
  const buffer = await driver.read(CLUB_EXPORT_PARTITION, download.storagePath).then(
    (found) => found.buffer,
    () => null,
  )
  if (!buffer) return clubCoreErrors.throw('export_not_found')
  const settings = await em.findOne(ClubSettings, { ...scope, deletedAt: null }, { fields: ['id', 'publicSlug'] })
  return {
    fileName: clubExportFileName(settings?.publicSlug, download.job.finishedAt ?? download.job.createdAt),
    buffer,
  }
}
