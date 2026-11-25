import { spawnSync } from 'node:child_process'
import { sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { APP_ROOT } from '../_fixtures/club'

// ENT-TEST-02, public shape (enterprise package spec DD-E05, REQ-E01, REQ-E02, exit gate of phase 1a; #649): the
// production build boots without the Enterprise package and without keys, no module of `@vereino/enterprise` is
// registered, and `foundation licence-status` prints "no licence keys installed". A key signed with the committed test
// key pair is rejected as `unknown_kid` by this build — also with `VEREINO_CI=true`, because only an overlay build run
// with `enterprise-overlay.mjs --ci` trusts the test kid — and the output names the key by `lid`, never the key itself.
test.describe.configure({ timeout: 300_000 })

const FIXTURE = path.join(APP_ROOT, '.ai/qa/fixtures/licence-test-key-pair.json')
const PREFIX = 'vereino-lic.v1.'

type StatusReport = {
  instance: string | null
  message?: string
  keys: Array<{ lid: string }>
  rejected: Array<{ reason: string; lid: string | null; position: number }>
  warnings: string[]
}

type StatusRun = { exitCode: number | null; report: StatusReport | null; stdout: string; stderr: string }

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function testSignedKey(lid: string, instance: string): string {
  const pair = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { kid: string; privateKeyPem: string }
  const payload = {
    v: 1,
    kid: pair.kid,
    lid,
    instance,
    tenantId: '3f0c1f9e-6a43-4f0f-9a5b-2a7d3c1b0e11',
    features: ['enterprise_demo'],
    issuedAt: '2026-01-01T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z',
    graceDays: 14,
  }
  const payloadPart = base64Url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const signature = sign(null, Buffer.from(`${PREFIX}${payloadPart}`, 'ascii'), pair.privateKeyPem)
  return `${PREFIX}${payloadPart}.${base64Url(signature)}`
}

function runStatus(env: Record<string, string | undefined>, args: string[] = []): StatusRun {
  const licenceVariables = new Set([
    'VEREINO_LICENCE_KEYS',
    'VEREINO_LICENCE_KEYS_FILE',
    'VEREINO_INSTANCE_ID',
    'VEREINO_CI',
  ])
  const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !licenceVariables.has(name)))
  const run = spawnSync('yarn', ['mercato', 'foundation', 'licence-status', ...args], {
    cwd: APP_ROOT,
    env: { ...baseEnv, ...env },
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 240_000,
  })
  // The platform logger may flush its own JSON lines after the result, so pick the line with the report's keys.
  const json = run.stdout
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith('{') && line.includes('"rejected":'))
  return {
    exitCode: run.status,
    report: json ? (JSON.parse(json) as StatusReport) : null,
    stdout: run.stdout,
    stderr: run.stderr,
  }
}

test('ENT-TEST-02: the public build registers no Enterprise module and reports no licence keys', () => {
  const generated = path.join(APP_ROOT, '.mercato/generated')
  const moduleIds = readFileSync(path.join(generated, 'enabled-module-ids.generated.ts'), 'utf8')
  expect(moduleIds).toContain('"foundation"')
  expect(moduleIds).not.toContain('"enterprise_demo"')
  expect(readFileSync(path.join(generated, 'modules.generated.ts'), 'utf8')).not.toContain('@vereino/enterprise')

  const empty = runStatus({})
  expect(empty.exitCode, empty.stderr).toBe(0)
  expect(empty.report).toEqual({
    instance: null,
    message: 'no licence keys installed',
    keys: [],
    rejected: [],
    warnings: [],
  })
})

test('ENT-TEST-02: a test-signed key is rejected by the public build, even with VEREINO_CI, and never printed', () => {
  const key = testSignedKey('lic-ent-test-02', 'staging-1')
  for (const ci of [undefined, 'true']) {
    const run = runStatus({
      VEREINO_INSTANCE_ID: 'staging-1',
      VEREINO_LICENCE_KEYS: `${key}\nnot-a-key`,
      VEREINO_CI: ci,
    })
    expect(run.exitCode, run.stderr).toBe(0)
    expect(run.report?.instance).toBe('staging-1')
    expect(run.report?.message).toBeUndefined()
    expect(run.report?.keys).toEqual([])
    expect(run.report?.rejected).toEqual([
      { reason: 'unknown_kid', lid: 'lic-ent-test-02', position: 1 },
      { reason: 'wrong_prefix', lid: null, position: 2 },
    ])
    expect(`${run.stdout}${run.stderr}`).not.toContain(PREFIX)
  }
})

test('ENT-TEST-02: licence-status refuses a malformed --now', () => {
  const run = runStatus({}, ['--now', 'yesterday'])
  expect(run.exitCode).not.toBe(0)
  expect(run.stderr).toContain('--now must be an ISO instant')
})
