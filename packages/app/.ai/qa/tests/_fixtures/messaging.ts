// Foundation III test helpers (TEST-M01…M04): run the messaging probe (`messaging-probe/probe.mjs`) against the
// ephemeral app's database with a private local queue, and read the e-mails the app captured (`OM_TEST_MODE`).
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { APP_ROOT } from './club'

const PROBE = path.join(APP_ROOT, '.ai', 'qa', 'tests', '_fixtures', 'messaging-probe', 'probe.mjs')

export type ProbeStep = Record<string, unknown> & { op: string }

export type ProbeDelivery = {
  id: string
  personId: string | null
  userId: string | null
  channel: 'in_app' | 'email'
  locale: string
  reasons: string[]
  status: 'queued' | 'sent' | 'failed' | 'skipped'
  skipReason: string | null
  failureCode: string | null
  attempts: number
  hasEmail: boolean
  hasEmailHash: boolean
  hasSecret: boolean
  secretCipherPrefix: string | null
}

export type ProbeRecipient = {
  personId: string
  userId: string | null
  hasEmail: boolean
  locale: string
  reasons: string[]
  channels: string[]
}

export type ProbeError = { status: number; code: string | null; fingerprint: string | null; message: string }

export type ProbeSend = { to: string; subject: string; at: number; html: string }

export type ProbeResult = {
  failure: string | null
  outputs: Array<Record<string, unknown>>
  sends: ProbeSend[]
  events: Array<{ event: string; payload: Record<string, unknown> }>
  allEventPayloads: unknown[]
  persistedEventPayloads: unknown[]
  jobPayloads: unknown[]
}

export type ProbeRun = {
  result: ProbeResult
  /** Every line the probe process logged (stdout before the result line, and stderr). */
  log: string
}

/** Runs one probe script in the club's tenant and organization; each run gets its own private queue directory. */
export function runProbe(scope: { tenantId: string; organizationId: string }, steps: ProbeStep[]): ProbeRun {
  const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-probe-queue-'))
  try {
    const run = spawnSync(process.execPath, [PROBE, JSON.stringify({ ...scope, steps })], {
      cwd: APP_ROOT,
      env: { ...process.env, QUEUE_BASE_DIR: queueDir },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 600_000,
    })
    const stdout = run.stdout
    const lines = stdout.trimEnd().split(/\r?\n/)
    const last = lines.pop() ?? ''
    if (run.status !== 0 || !last.startsWith('{')) {
      throw new Error(
        `[internal] the messaging probe exited ${String(run.status)}: ${run.stderr}\n${stdout.slice(-4000)}`,
      )
    }
    return { result: JSON.parse(last) as ProbeResult, log: `${lines.join('\n')}\n${run.stderr}` }
  } finally {
    fs.rmSync(queueDir, { recursive: true, force: true })
  }
}

/** The output of step `index` of a probe run (the caller names its shape). */
export function outputOf(run: ProbeRun, index: number): unknown {
  return run.result.outputs[index]
}

const capturePath =
  process.env.OM_TEST_EMAIL_CAPTURE_PATH?.trim() || path.join(os.tmpdir(), 'open-mercato-email-capture.jsonl')

export type CapturedMessage = { to: string; subject: string; from: string | null; links: string[]; text: string }

/** Every captured e-mail to one of `addresses`, oldest first. */
export function capturedTo(addresses: readonly string[]): CapturedMessage[] {
  if (!fs.existsSync(capturePath)) return []
  const wanted = new Set(addresses)
  return fs
    .readFileSync(capturePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as CapturedMessage)
    .filter((entry) => wanted.has(entry.to))
}

/** The largest number of sends inside any window of `windowMs` (inclusive). */
export function maxSendsPerWindow(times: readonly number[], windowMs = 1000): number {
  const sorted = [...times].sort((a, b) => a - b)
  let best = 0
  let start = 0
  for (let end = 0; end < sorted.length; end += 1) {
    while (sorted[end] - sorted[start] > windowMs) start += 1
    best = Math.max(best, end - start + 1)
  }
  return best
}

export function uniqueAddress(label: string): string {
  return `${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`
}
