// The club administrator's own export during the notice period (many clubs spec phase 4, REQ-M06, *UI and Interaction
// Contracts* banner row; E22-S06b, #676). Pure: the platform progress job is the export's only state (no table of its
// own), so this file names the job type, the queue, where the finished archive lives in the private storage partition,
// and turns the club's notice dates and its export jobs into what the banner and the routes answer.
import { offboardingState } from './club-offboarding'

/** The `progress_jobs.job_type` of an administrator's export. */
export const CLUB_EXPORT_JOB_TYPE = 'club_core.clubs.export'
/** The queue of the `club_core:club-export` worker. */
export const CLUB_EXPORT_QUEUE = 'club_core-club-export'
/** The attachments partition the archive is stored in: private, never served by a public URL. */
export const CLUB_EXPORT_PARTITION = 'privateAttachments'

export type ClubExportStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** The part of a platform `ProgressJob` the export reads. */
export type ClubExportJobLike = {
  id: string
  status: string
  createdAt: Date
  finishedAt?: Date | null
  organizationId?: string | null
  resultSummary?: Record<string, unknown> | null
}

/** The latest export as the banner shows it. */
export type ClubExportView = {
  jobId: string
  status: ClubExportStatus
  requestedAt: string
  finishedAt: string | null
  /** The archive's size once the export completed. */
  bytes: number | null
}

export type OffboardingView = {
  noticeAt: string | null
  deleteAfter: string | null
  /** True while a notice is recorded: the administrator may start an export (and download a finished one). */
  exportAvailable: boolean
  export: ClubExportView | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUSES: readonly ClubExportStatus[] = ['pending', 'running', 'completed', 'failed', 'cancelled']
const ACTIVE: readonly string[] = ['pending', 'running']

/** The archive's path in the private partition: one file per job, under the club's organization. */
export function clubExportStoragePath(organizationId: string, jobId: string): string {
  if (!UUID.test(organizationId) || !UUID.test(jobId)) throw new Error('[internal] club export path needs two uuids')
  return `club-exports/org_${organizationId.toLowerCase()}/${jobId.toLowerCase()}.zip`
}

/** Where a job's archive is (or would be) stored; null for a job without a club organization. */
export function storagePathOf(job: Pick<ClubExportJobLike, 'id' | 'organizationId'>): string | null {
  return job.organizationId && UUID.test(job.organizationId) && UUID.test(job.id)
    ? clubExportStoragePath(job.organizationId, job.id)
    : null
}

/** The download's file name: the club's slug (or `club`) and the day of the export, e.g. `orlik-export-2026-12-01.zip`. */
export function clubExportFileName(slug: string | null | undefined, finishedAt: Date): string {
  const safe = (slug ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '')
  return `${safe || 'club'}-export-${finishedAt.toISOString().slice(0, 10)}.zip`
}

export function isActiveExport(job: Pick<ClubExportJobLike, 'status'>): boolean {
  return ACTIVE.includes(job.status)
}

function statusOf(value: string): ClubExportStatus {
  return (STATUSES as readonly string[]).includes(value) ? (value as ClubExportStatus) : 'failed'
}

export function exportView(job: ClubExportJobLike): ClubExportView {
  const bytes = job.resultSummary?.bytes
  return {
    jobId: job.id,
    status: statusOf(job.status),
    requestedAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    bytes: typeof bytes === 'number' ? bytes : null,
  }
}

/** Newest first, by creation time. */
function newestFirst(jobs: readonly ClubExportJobLike[]): ClubExportJobLike[] {
  return [...jobs].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
}

/** What `GET /api/club_core/offboarding` answers for the club's notice dates and its export jobs. */
export function offboardingView(
  club: { noticeAt: Date | null | undefined; deleteAfter: Date | null | undefined },
  jobs: readonly ClubExportJobLike[],
  now: Date,
): OffboardingView {
  const state = offboardingState(club.deleteAfter, now)
  const latest = newestFirst(jobs).at(0)
  return {
    noticeAt: club.noticeAt ? club.noticeAt.toISOString() : null,
    deleteAfter: club.deleteAfter ? club.deleteAfter.toISOString() : null,
    exportAvailable: state.state !== 'active',
    export: latest ? exportView(latest) : null,
  }
}

export type ClubExportDownload =
  { kind: 'running' } | { kind: 'none' } | { kind: 'ready'; job: ClubExportJobLike; storagePath: string }

/**
 * Which archive the download serves: none while an export runs (`export_running`), otherwise the newest completed
 * export with a stored archive, or nothing.
 */
export function clubExportDownload(jobs: readonly ClubExportJobLike[]): ClubExportDownload {
  const sorted = newestFirst(jobs)
  if (sorted.some(isActiveExport)) return { kind: 'running' }
  for (const job of sorted) {
    const storagePath = job.status === 'completed' ? storagePathOf(job) : null
    if (storagePath) return { kind: 'ready', job, storagePath }
  }
  return { kind: 'none' }
}

/** The archives a new export replaces: every stored archive except the one of `keepJobId`. */
export function supersededArchives(jobs: readonly ClubExportJobLike[], keepJobId: string): string[] {
  return jobs.flatMap((job) => {
    const storagePath = job.id === keepJobId ? null : storagePathOf(job)
    return storagePath ? [storagePath] : []
  })
}
