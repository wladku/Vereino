import { describe, expect, it } from '@jest/globals'
import {
  CLUB_EXPORT_JOB_TYPE,
  CLUB_EXPORT_PARTITION,
  CLUB_EXPORT_QUEUE,
  clubExportDownload,
  clubExportFileName,
  clubExportStoragePath,
  exportView,
  isActiveExport,
  offboardingView,
  storagePathOf,
  supersededArchives,
  type ClubExportJobLike,
} from '../club-export'

const ORG = 'c7fdbb54-0491-4325-a2a8-90d163c43d91'
const JOB_A = '0b7e3c4a-1111-4222-8333-944455556666'
const JOB_B = '1c8f4d5b-2222-4333-8444-a55566667777'
const JOB_C = '2d905e6c-3333-4444-8555-b66677778888'
const NOW = new Date('2026-11-23T12:00:00.000Z')

function job(
  id: string,
  status: string,
  minutesAgo: number,
  extra: Partial<ClubExportJobLike> = {},
): ClubExportJobLike {
  return {
    id,
    status,
    createdAt: new Date(NOW.getTime() - minutesAgo * 60_000),
    organizationId: ORG,
    ...extra,
  }
}

describe('club export constants', () => {
  it('names the job type, queue and private partition', () => {
    expect(CLUB_EXPORT_JOB_TYPE).toBe('club_core.clubs.export')
    expect(CLUB_EXPORT_QUEUE).toBe('club_core-club-export')
    expect(CLUB_EXPORT_PARTITION).toBe('privateAttachments')
  })
})

describe('clubExportStoragePath / storagePathOf', () => {
  it('puts one archive per job under the organization, lower-cased', () => {
    expect(clubExportStoragePath(ORG.toUpperCase(), JOB_A)).toBe(`club-exports/org_${ORG}/${JOB_A}.zip`)
  })

  it('refuses ids that are not uuids', () => {
    expect(() => clubExportStoragePath('../etc', JOB_A)).toThrow('[internal]')
    expect(() => clubExportStoragePath(ORG, 'x')).toThrow('[internal]')
  })

  it('derives the path of a job of a club organization only', () => {
    expect(storagePathOf(job(JOB_A, 'completed', 1))).toBe(`club-exports/org_${ORG}/${JOB_A}.zip`)
    expect(storagePathOf({ id: JOB_A, organizationId: null })).toBeNull()
    expect(storagePathOf({ id: JOB_A })).toBeNull()
    expect(storagePathOf({ id: JOB_A, organizationId: '../x' })).toBeNull()
    expect(storagePathOf({ id: 'x', organizationId: ORG })).toBeNull()
  })
})

describe('clubExportFileName', () => {
  it('uses the slug and the day', () => {
    expect(clubExportFileName('Orlik-Zielonka', NOW)).toBe('orlik-zielonka-export-2026-11-23.zip')
  })

  it('falls back to "club" without a usable slug', () => {
    expect(clubExportFileName(null, NOW)).toBe('club-export-2026-11-23.zip')
    expect(clubExportFileName(undefined, NOW)).toBe('club-export-2026-11-23.zip')
    expect(clubExportFileName('"; /', NOW)).toBe('club-export-2026-11-23.zip')
  })
})

describe('exportView / isActiveExport', () => {
  it('maps a completed job with its size', () => {
    const finishedAt = new Date(NOW.getTime() - 60_000)
    expect(exportView(job(JOB_A, 'completed', 5, { finishedAt, resultSummary: { bytes: 1234 } }))).toEqual({
      jobId: JOB_A,
      status: 'completed',
      requestedAt: new Date(NOW.getTime() - 300_000).toISOString(),
      finishedAt: finishedAt.toISOString(),
      bytes: 1234,
    })
  })

  it('maps a running job without a size and an unknown status as failed', () => {
    expect(exportView(job(JOB_A, 'running', 1))).toMatchObject({ status: 'running', finishedAt: null, bytes: null })
    expect(exportView(job(JOB_A, 'weird', 1, { resultSummary: { bytes: '12' } }))).toMatchObject({
      status: 'failed',
      bytes: null,
    })
  })

  it('treats pending and running as active', () => {
    expect(isActiveExport({ status: 'pending' })).toBe(true)
    expect(isActiveExport({ status: 'running' })).toBe(true)
    expect(isActiveExport({ status: 'completed' })).toBe(false)
    expect(isActiveExport({ status: 'failed' })).toBe(false)
  })
})

describe('offboardingView', () => {
  const deleteAfter = new Date(NOW.getTime() + 10 * 86_400_000)
  const noticeAt = new Date(NOW.getTime() - 20 * 86_400_000)

  it('answers no notice and no export for an active club', () => {
    expect(offboardingView({ noticeAt: null, deleteAfter: null }, [], NOW)).toEqual({
      noticeAt: null,
      deleteAfter: null,
      exportAvailable: false,
      export: null,
    })
    expect(offboardingView({ noticeAt: undefined, deleteAfter: undefined }, [], NOW).exportAvailable).toBe(false)
  })

  it('offers the export during the notice and after it is due, with the newest job', () => {
    const view = offboardingView(
      { noticeAt, deleteAfter },
      [job(JOB_A, 'completed', 60), job(JOB_B, 'running', 1), job(JOB_C, 'failed', 30)],
      NOW,
    )
    expect(view).toMatchObject({
      noticeAt: noticeAt.toISOString(),
      deleteAfter: deleteAfter.toISOString(),
      exportAvailable: true,
      export: { jobId: JOB_B, status: 'running' },
    })
    const due = new Date(NOW.getTime() - 60_000)
    expect(offboardingView({ noticeAt, deleteAfter: due }, [], NOW).exportAvailable).toBe(true)
  })
})

describe('clubExportDownload', () => {
  it('refuses while an export runs', () => {
    expect(clubExportDownload([job(JOB_A, 'completed', 60), job(JOB_B, 'pending', 1)])).toEqual({ kind: 'running' })
  })

  it('serves the newest completed export with a stored archive', () => {
    const older = job(JOB_A, 'completed', 60)
    const newer = job(JOB_B, 'completed', 30)
    const failed = job(JOB_C, 'failed', 5)
    expect(clubExportDownload([older, failed, newer])).toEqual({
      kind: 'ready',
      job: newer,
      storagePath: `club-exports/org_${ORG}/${JOB_B}.zip`,
    })
    const broken = job(JOB_B, 'completed', 1, { organizationId: null })
    expect(clubExportDownload([older, broken])).toMatchObject({ kind: 'ready', job: older })
  })

  it('answers none without a finished export', () => {
    expect(clubExportDownload([])).toEqual({ kind: 'none' })
    expect(clubExportDownload([job(JOB_A, 'failed', 1)])).toEqual({ kind: 'none' })
  })
})

describe('supersededArchives', () => {
  it('lists every stored archive except the kept one', () => {
    const jobs = [
      job(JOB_A, 'completed', 60),
      job(JOB_B, 'completed', 1),
      job(JOB_C, 'failed', 5, { organizationId: null }),
    ]
    expect(supersededArchives(jobs, JOB_B)).toEqual([`club-exports/org_${ORG}/${JOB_A}.zip`])
    expect(supersededArchives(jobs, '')).toHaveLength(2)
  })
})
