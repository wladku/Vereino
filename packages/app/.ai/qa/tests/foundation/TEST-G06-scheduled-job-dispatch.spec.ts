import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { APP_ROOT, createClub, mercato } from '../_fixtures/club'

// Foundation II TEST-G06, AC-G05 (#591; owner decision 2026-11-24: a forged scope is also a well-formed organization
// id without a registration of the job). `activities:generate-occurrences`, registered with `registerModuleSchedule`:
// - `activities set-up-club` run twice leaves one `scheduled_jobs` row for the organization, under the stable id;
// - a probe process fires it through the platform's `scheduler-execution` worker, which enqueues the target job with
//   the registration's sanitised scope; the module's worker takes that payload and dispatches its command for that
//   organization, and the command logs its counts;
// - the platform refuses a firing whose scope does not match the registration;
// - the module's worker refuses, and dispatches nothing for, a malformed payload and the well-formed scope of another
//   club that holds no registration of the job (`verifyScheduledJobScope`).
test.describe.configure({ timeout: 300_000 })

const PROBE = path.join(APP_ROOT, '.ai', 'qa', 'tests', '_fixtures', 'scheduled-job-probe', 'probe.mjs')
const WORKER = 'activities:generate-occurrences'
const QUEUE = 'activities-generate-occurrences'
const COMMAND = 'activities.occurrences.generate'

type Scope = { tenantId: string; organizationId: string }
type Recorded = { commandId: string; organizationId: string | null }
type ExecuteOutput = { error: string | null; queued: Array<Record<string, unknown>> }
type RunOutput = { commands: Recorded[] }
type ProbeStep =
  ({ op: 'execute'; scheduleId: string; queue: string } & Scope) | { op: 'run'; worker: string; payload: unknown }

function runProbe(steps: ProbeStep[]): { outputs: unknown[]; log: string } {
  const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-g06-queue-'))
  try {
    const run = spawnSync(process.execPath, [PROBE, JSON.stringify({ steps })], {
      cwd: APP_ROOT,
      // The execute worker reads a queue Redis URL even for the local strategy, which never connects to it.
      env: {
        ...process.env,
        QUEUE_BASE_DIR: queueDir,
        QUEUE_STRATEGY: 'local',
        QUEUE_REDIS_URL: 'redis://127.0.0.1:1',
      },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 240_000,
    })
    const lines = run.stdout.trimEnd().split(/\r?\n/)
    const index = run.status === 0 ? lines.findLastIndex(isResultLine) : -1
    if (index < 0)
      throw new Error(`[internal] the probe exited ${String(run.status)}: ${run.stderr}\n${run.stdout.slice(-4000)}`)
    const [resultLine] = lines.splice(index, 1)
    const result = JSON.parse(resultLine) as { failure: string | null; outputs: unknown[] }
    if (result.failure) throw new Error(`[internal] the probe failed: ${result.failure}`)
    return { outputs: result.outputs, log: `${lines.join('\n')}\n${run.stderr}` }
  } finally {
    fs.rmSync(queueDir, { recursive: true, force: true })
  }
}

function isResultLine(line: string): boolean {
  if (!line.startsWith('{')) return false
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>
    return 'failure' in parsed && Array.isArray(parsed.outputs)
  } catch {
    return false
  }
}

async function registrationsOf(scope: Scope) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string; target_queue: string; source_module: string }>(
      `select id, target_queue, source_module from scheduled_jobs
        where tenant_id = $1 and organization_id = $2 and name = $3 and deleted_at is null`,
      [scope.tenantId, scope.organizationId, WORKER],
    )
    return rows
  })
}

test('TEST-G06 a registered job dispatches through the platform worker with its scope; a forged scope is refused', async ({
  request,
}) => {
  const club = await createClub(request, 'test-g06-registered')
  const other = await createClub(request, 'test-g06-unregistered')
  try {
    const scope: Scope = { tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId }
    const forged: Scope = { tenantId: other.tenant.tenantId, organizationId: other.tenant.organizationId }

    // One registration per organization under the stable id, however often the setup runs; the other club (created
    // through the API, which runs no `seedDefaults`) holds none.
    const options = ['--tenant', scope.tenantId, '--org', scope.organizationId]
    for (let run = 0; run < 2; run += 1) {
      const setUp = mercato(['activities', 'set-up-club', ...options]) as { schedules: Record<string, boolean> }
      expect(setUp.schedules.generateOccurrences).toBe(true)
    }
    const registrations = await registrationsOf(scope)
    expect(registrations).toHaveLength(1)
    const [registration] = registrations
    expect(registration).toMatchObject({ target_queue: QUEUE, source_module: 'activities' })
    const firstId = registration.id
    mercato(['activities', 'set-up-club', ...options])
    expect((await registrationsOf(scope)).map((row) => row.id)).toEqual([firstId])
    expect(await registrationsOf(forged)).toHaveLength(0)

    // The platform fires the registration: the target job carries the registration's scope.
    const fired = runProbe([
      { op: 'execute', scheduleId: firstId, queue: QUEUE, ...scope },
      // A firing whose scope is not the registration's is refused by the platform before anything is queued.
      { op: 'execute', scheduleId: firstId, queue: QUEUE, ...forged },
    ])
    const [dispatched, mismatched] = fired.outputs as ExecuteOutput[]
    expect(dispatched.error, fired.log.slice(-4000)).toBeNull()
    expect(dispatched.queued).toHaveLength(1)
    const [payload] = dispatched.queued
    expect(payload).toMatchObject({ ...scope, _jobOrigin: 'scheduler' })
    expect(mismatched.error).toMatch(/mismatch/i)
    expect(mismatched.queued).toEqual([])

    // The module's worker: the sanitised payload dispatches the job command for the registered organization and the
    // command logs its counts; a malformed payload and the scope of a club without the registration dispatch nothing.
    const worked = runProbe([
      { op: 'run', worker: WORKER, payload },
      { op: 'run', worker: WORKER, payload: { tenantId: 'not-a-uuid', organizationId: scope.organizationId } },
      { op: 'run', worker: WORKER, payload: { ...payload, ...forged } },
      { op: 'run', worker: WORKER, payload: { tenantId: scope.tenantId, organizationId: forged.organizationId } },
    ])
    const [registered, malformed, otherClub, crossed] = worked.outputs as RunOutput[]
    expect(registered.commands).toEqual([{ commandId: COMMAND, organizationId: scope.organizationId }])
    expect(worked.log).toContain('Session generation finished')
    expect(worked.log).toMatch(/processed"?:\s*\d+/)
    expect(malformed.commands).toEqual([])
    expect(worked.log).toContain('malformed_scope')
    expect(otherClub.commands).toEqual([])
    expect(crossed.commands).toEqual([])
    expect(worked.log).toContain('unregistered_scope')
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})
