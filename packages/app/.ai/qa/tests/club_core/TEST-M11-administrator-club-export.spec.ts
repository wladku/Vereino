import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { expect, test, type APIRequestContext } from '@playwright/test'
import JSZip from 'jszip'
import { getAuthToken } from '../_fixtures/auth'
import { APP_ROOT, call, createClub, type Club } from '../_fixtures/club'
import { signInBrowser } from '../_fixtures/club-structure'
import { signedInStaff } from '../_fixtures/groups'
import { putSettings } from '../_fixtures/publication'
import { uiTextIn } from '../_fixtures/ui-text'

// TEST-M11 (many clubs spec phase 4, REQ-M06, *UI and Interaction Contracts* banner row; E22-S06b, #676): the club
// administrator's side of offboarding. Without a notice `GET /api/club_core/offboarding` answers nulls and the export is
// refused (409 `export_unavailable`); after the operator's `offboard-club` it answers the dates, `POST
// /api/club_core/offboarding/export` queues one export (a second request while it runs answers 409 `export_running`),
// and the administrator downloads the finished archive of their own club. A treasurer of the same club gets 403 on all
// three calls. On `/backend` the banner shows the deletion date in both locales at 375 px and downloads the archive.
test.describe.configure({ timeout: 600_000 })

const OFFBOARDING = '/api/club_core/offboarding'
const EXPORT = '/api/club_core/offboarding/export'

/** `yarn mercato club_core <args>`: the exit code and the JSON line with a `status` it printed. */
function clubCli(args: string[]): { exitCode: number | null; output: Record<string, unknown> | null } {
  const run = spawnSync('yarn', ['mercato', 'club_core', ...args], {
    cwd: APP_ROOT,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 300_000,
  })
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

type OffboardingView = {
  noticeAt: string | null
  deleteAfter: string | null
  exportAvailable: boolean
  export: { jobId: string; status: string; bytes: number | null } | null
}

async function offboarding(request: APIRequestContext, token: string): Promise<OffboardingView> {
  const result = await call<OffboardingView>(request, 'GET', OFFBOARDING, token)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body as OffboardingView
}

async function waitForExport(request: APIRequestContext, token: string, jobId: string): Promise<void> {
  await expect
    .poll(async () => (await offboarding(request, token)).export, { timeout: 180_000, intervals: [1_000, 2_000] })
    .toMatchObject({ jobId, status: 'completed' })
}

/** The archive's manifest, checked to be the export of `club`. */
async function expectClubArchive(bytes: Buffer, club: Club): Promise<void> {
  const zip = await JSZip.loadAsync(bytes)
  const manifest = JSON.parse(await (zip.file('manifest.json') as JSZip.JSZipObject).async('string')) as {
    format: string
    club: { tenantId: string; organizationId: string }
    tables: { table: string; rows: number }[]
  }
  expect(manifest.format).toBe('vereino-club-export')
  expect(manifest.club).toMatchObject({ tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId })
  expect(manifest.tables.find((table) => table.table === 'people_persons')?.rows ?? 0).toBeGreaterThan(0)
  expect(Object.keys(zip.files).some((name) => name.startsWith('data/') && name.endsWith('.json'))).toBe(true)
}

test('TEST-M11 the club administrator exports their own club during the notice period', async ({ page, request }) => {
  const club = await createClub(request, 'm11')
  try {
    const slug = `m11-${club.tenant.tenantId.slice(0, 8)}`
    const named = await putSettings(request, club.adminToken, { publicSlug: slug })
    expect(named.status, JSON.stringify(named.body)).toBe(200)
    const treasurer = await signedInStaff(request, club, {
      firstName: 'Teresa',
      lastName: 'Skarbnik',
      role: 'treasurer',
    })

    // No notice: nothing to show, the export is refused.
    expect(await offboarding(request, club.adminToken)).toEqual({
      noticeAt: null,
      deleteAfter: null,
      exportAvailable: false,
      export: null,
    })
    const early = await call(request, 'POST', EXPORT, club.adminToken, { data: {} })
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body?.code).toBe('export_unavailable')
    const nothing = await call(request, 'GET', EXPORT, club.adminToken)
    expect(nothing.status, JSON.stringify(nothing.body)).toBe(404)

    // The operator records the notice.
    const notice = clubCli(['offboard-club', '--slug', slug, '--notice-days', '30'])
    expect(notice.exitCode, JSON.stringify(notice.output)).toBe(0)
    const view = await offboarding(request, club.adminToken)
    expect(view.exportAvailable).toBe(true)
    expect(view.noticeAt).not.toBeNull()
    const days = (Date.parse(String(view.deleteAfter)) - Date.parse(String(view.noticeAt))) / 86_400_000
    expect(Math.round(days)).toBe(30)

    // Another role of the same club reaches none of it.
    for (const [method, url] of [
      ['GET', OFFBOARDING],
      ['POST', EXPORT],
      ['GET', EXPORT],
    ] as const) {
      const denied = await call(request, method, url, treasurer.token, method === 'POST' ? { data: {} } : {})
      expect(denied.status, `${method} ${url} as treasurer ${JSON.stringify(denied.body)}`).toBe(403)
    }

    // One export at a time, then the administrator downloads the archive of their own club.
    const started = await call<{ jobId: string; status: string }>(request, 'POST', EXPORT, club.adminToken, {
      data: {},
    })
    expect(started.status, JSON.stringify(started.body)).toBe(202)
    const jobId = String(started.body?.jobId)
    const second = await call(request, 'POST', EXPORT, club.adminToken, { data: {} })
    if (second.status !== 202) {
      expect(second.status, JSON.stringify(second.body)).toBe(409)
      expect(second.body?.code).toBe('export_running')
    }
    const lastJob = second.status === 202 ? String((second.body as { jobId?: string } | null)?.jobId) : jobId
    await waitForExport(request, club.adminToken, lastJob)
    const download = (await call(request, 'GET', EXPORT, club.adminToken)).response
    expect(download.status()).toBe(200)
    expect(download.headers()['content-type']).toContain('application/zip')
    expect(download.headers()['cache-control']).toContain('no-store')
    expect(download.headers()['content-disposition']).toContain(`${slug}-export-`)
    await expectClubArchive(await download.body(), club)

    // The banner on /backend, both locales, 375 px; its download is the same archive.
    const password = await signInBrowser(page, request, club, club.adminUserId, club.tenant.email)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/backend')
    for (const locale of ['pl', 'en'] as const) {
      await page.context().addCookies([{ name: 'locale', value: locale, url: new URL(page.url()).origin }])
      await page.goto('/backend')
      const banner = page.getByTestId('club-core-offboarding-banner')
      await expect(banner).toBeVisible({ timeout: 30_000 })
      await expect(banner).toContainText(uiTextIn(locale, 'club_core.offboarding.banner.title'))
      await expect(page.getByTestId('club-core-offboarding-banner-date')).not.toBeEmpty()
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width, `no horizontal scroll at 375 px (${locale})`).toBeLessThanOrEqual(375)
    }
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('club-core-offboarding-download').click(),
    ])
    const saved = await file.path()
    await expectClubArchive(fs.readFileSync(saved), club)

    // The notice withdrawn: no banner, and the export is no longer offered (a fresh token: the browser sign-in ended
    // the administrator's old ones).
    const withdrawn = clubCli(['offboard-club', '--slug', slug, '--cancel'])
    expect(withdrawn.exitCode, JSON.stringify(withdrawn.output)).toBe(0)
    await page.goto('/backend')
    await expect(page.getByTestId('club-core-offboarding-banner')).toHaveCount(0)
    const adminToken = await getAuthToken(request, club.tenant.email, password)
    expect((await offboarding(request, adminToken)).exportAvailable).toBe(false)
  } finally {
    await club.cleanup()
  }
})
