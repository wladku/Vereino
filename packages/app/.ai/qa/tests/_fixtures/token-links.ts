// Foundation phase C test helpers (TEST-F07, #157): run the token-link probe (`token-link-probe/probe.mjs`) against
// the ephemeral app's database.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { APP_ROOT } from './club'

const PROBE = path.join(APP_ROOT, '.ai', 'qa', 'tests', '_fixtures', 'token-link-probe', 'probe.mjs')

export type TokenProbeStep = Record<string, unknown> & { op: string }

export type TokenProbeError = { status: number; code: string | null; message: string }

export type TokenProbeView = {
  found: {
    id: string
    tenantId: string
    organizationId: string
    subjectId: string
    targets: string[]
    usedCount: number | null
    used: boolean
  } | null
  error?: TokenProbeError
  rolledBack?: boolean
}

export type TokenProbeStored = {
  tenantId: string
  organizationId: string
  hashIsHmacOfRaw: boolean
  rowContainsRaw: boolean
  usedAt: string | null
  usedCount: number | null
  lastUsedAt: string | null
}

export type TokenProbeResult = {
  failure: string | null
  outputs: Array<Record<string, unknown>>
  events: Array<{ event: string; payload: unknown }>
  /** The raw tokens the probe issued and their hashes — only so the test can prove nothing else carries them. */
  secrets: string[]
}

export type TokenProbeRun = {
  result: TokenProbeResult
  /** Every line the probe process logged (stdout before the result line, and stderr). */
  log: string
}

/** Runs one probe script in the club's tenant and organization. */
export function runTokenProbe(
  scope: { tenantId: string; organizationId: string },
  steps: TokenProbeStep[],
): TokenProbeRun {
  const run = spawnSync(process.execPath, [PROBE, JSON.stringify({ ...scope, steps })], {
    cwd: APP_ROOT,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 600_000,
  })
  const stdout = run.stdout
  const lines = stdout.trimEnd().split(/\r?\n/)
  const last = lines.pop() ?? ''
  if (run.status !== 0 || !last.startsWith('{')) {
    throw new Error(
      `[internal] the token-link probe exited ${String(run.status)}: ${run.stderr}\n${stdout.slice(-4000)}`,
    )
  }
  return { result: JSON.parse(last) as TokenProbeResult, log: `${lines.join('\n')}\n${run.stderr}` }
}

/** The output of step `index` of a probe run (the caller names its shape). */
export function tokenOutput(run: TokenProbeRun, index: number): unknown {
  return run.result.outputs[index]
}
