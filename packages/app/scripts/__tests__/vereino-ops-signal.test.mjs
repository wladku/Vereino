// Unit tests for the operations signals (engineering standards S15.5, E18-S04 #465): the backup log line matches the
// documented alert filter, its success line does not, and the runbook names every filter.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import {
  ALERT_FILTERS,
  HEARTBEAT_URL_VARIABLES,
  OPS_EVENTS,
  REDACTED_URL,
  formatOpsLine,
  heartbeatUrl,
  matchesAlertFilter,
  opsSignal,
  parseCliArgs,
  pingHeartbeat,
  runCli,
} from '../vereino-ops-signal.mjs'
import { REPO_ROOT } from '../vereino-paths.mjs'

const now = () => 1_795_000_000_000

test('a failed backup line is single-line JSON that matches the documented alert filter', () => {
  const line = formatOpsLine('backup.failed', { step: 'upload', exitCode: 1 }, { now })
  assert.ok(!line.includes('\n'))
  assert.deepEqual(JSON.parse(line), {
    level: 'error',
    time: 1_795_000_000_000,
    name: 'ops',
    signal: 'vereino.ops.backup.failed',
    msg: 'Backup failed',
    step: 'upload',
    exitCode: 1,
  })
  assert.equal(matchesAlertFilter(line, ALERT_FILTERS.backupFailed), true)
})

test('the started and succeeded lines do not match the failed-backup filter', () => {
  for (const event of ['backup.started', 'backup.succeeded']) {
    const line = formatOpsLine(event, { durationMs: 1200, sizeBytes: 4096, step: 'upload-failed-before' }, { now })
    assert.equal(JSON.parse(line).level, 'info')
    assert.equal(matchesAlertFilter(line, ALERT_FILTERS.backupFailed), false, event)
  }
})

test('the runbook documents every alert filter and heartbeat variable', () => {
  const runbook = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'ops', 'monitoring.md'), 'utf8')
  for (const filter of Object.values(ALERT_FILTERS)) assert.ok(runbook.includes(filter), filter)
  for (const variable of Object.values(HEARTBEAT_URL_VARIABLES)) assert.ok(runbook.includes(variable), variable)
  for (const event of Object.keys(OPS_EVENTS)) assert.ok(runbook.includes(opsSignal(event)), event)
})

test('formatOpsLine uses Date.now by default, skips undefined fields, keeps booleans and truncates long strings', () => {
  const before = Date.now()
  const record = JSON.parse(
    formatOpsLine('backup.started', { dryRun: true, note: 'x'.repeat(250), skipped: undefined }),
  )
  assert.ok(record.time >= before)
  assert.equal(record.dryRun, true)
  assert.equal(record.note.length, 200)
  assert.equal('skipped' in record, false)
  assert.equal(JSON.parse(formatOpsLine('backup.started')).msg, 'Backup started')
})

test('formatOpsLine redacts URL-like values so a connection string never reaches the log', () => {
  const record = JSON.parse(
    formatOpsLine('backup.failed', { target: 'postgresql://user:pw@db:5432/x', bucket: 's3://bucket/key' }, { now }),
  )
  assert.equal(record.target, REDACTED_URL)
  assert.equal(record.bucket, REDACTED_URL)
})

test('formatOpsLine refuses unknown events, reserved or malformed field names and object values', () => {
  assert.throws(() => formatOpsLine('backup.exploded'), /unknown ops event backup\.exploded/)
  assert.throws(() => formatOpsLine('backup.failed', { msg: 'x' }), /field name msg is not allowed/)
  assert.throws(() => formatOpsLine('backup.failed', { signal: 'x' }), /field name signal is not allowed/)
  assert.throws(() => formatOpsLine('backup.failed', { 'row.count': 1 }), /field name row\.count is not allowed/)
  assert.throws(
    () => formatOpsLine('backup.failed', { error: { message: 'x' } }),
    /must be a string, number or boolean/,
  )
})

test('heartbeatUrl appends /fail only for a failure and trims trailing slashes', () => {
  assert.equal(heartbeatUrl('https://hc.example/ping/abc/', 'success'), 'https://hc.example/ping/abc')
  assert.equal(heartbeatUrl('https://hc.example/ping/abc', 'failure'), 'https://hc.example/ping/abc/fail')
})

test('pingHeartbeat resolves the response status, false without a URL, and never throws', async () => {
  const calls = []
  const ok = async (url, init) => {
    calls.push({ url, method: init.method, hasSignal: init.signal instanceof AbortSignal })
    return { ok: true }
  }
  assert.equal(await pingHeartbeat('https://hc.example/abc', 'failure', { fetchImpl: ok }), true)
  assert.deepEqual(calls, [{ url: 'https://hc.example/abc/fail', method: 'GET', hasSignal: true }])
  assert.equal(
    await pingHeartbeat('https://hc.example/abc', 'success', { fetchImpl: async () => ({ ok: false }) }),
    false,
  )
  const throwing = async () => {
    throw new Error('offline')
  }
  assert.equal(await pingHeartbeat('https://hc.example/abc', 'success', { fetchImpl: throwing }), false)
  assert.equal(await pingHeartbeat('', 'success', { fetchImpl: ok }), false)
  assert.equal(await pingHeartbeat(undefined, 'success'), false)
})

test('parseCliArgs reads the event and key=value fields, digits as numbers', () => {
  assert.deepEqual(parseCliArgs(['backup.failed', 'step=upload', 'exitCode=3', 'note=a=b']), {
    event: 'backup.failed',
    fields: { step: 'upload', exitCode: 3, note: 'a=b' },
  })
  assert.equal(parseCliArgs([]), null)
  assert.equal(parseCliArgs(['backup.unknown']), null)
  assert.equal(parseCliArgs(['backup.failed', 'novalue']), null)
  assert.equal(parseCliArgs(['backup.failed', '=x']), null)
})

function capture() {
  const lines = { out: [], error: [] }
  return { lines, out: (line) => lines.out.push(line), error: (line) => lines.error.push(line) }
}

test('runCli prints the line and pings the failure URL of the backup heartbeat', async () => {
  const io = capture()
  const pinged = []
  const fetchImpl = async (url) => {
    pinged.push(url)
    return { ok: true }
  }
  const env = { VEREINO_OPS_BACKUP_HEARTBEAT_URL: 'https://hc.example/b' }
  const code = await runCli({ argv: ['backup.failed', 'step=dump'], env, fetchImpl, ...io })
  assert.equal(code, 0)
  assert.equal(io.lines.out.length, 1)
  assert.equal(matchesAlertFilter(io.lines.out[0], ALERT_FILTERS.backupFailed), true)
  assert.deepEqual(pinged, ['https://hc.example/b/fail'])
  assert.deepEqual(io.lines.error, [])
})

test('runCli reports a failed ping, skips the ping without an outcome or a URL', async () => {
  const failing = capture()
  const refused = async () => ({ ok: false })
  const env = { VEREINO_OPS_BACKUP_HEARTBEAT_URL: 'https://hc.example/b' }
  assert.equal(await runCli({ argv: ['backup.succeeded'], env, fetchImpl: refused, ...failing }), 0)
  assert.deepEqual(failing.lines.error, ['ops-signal: the heartbeat ping of VEREINO_OPS_BACKUP_HEARTBEAT_URL failed'])

  let calls = 0
  const counting = async () => {
    calls += 1
    return { ok: true }
  }
  assert.equal(await runCli({ argv: ['backup.started'], env, fetchImpl: counting, ...capture() }), 0)
  assert.equal(await runCli({ argv: ['backup.failed'], env: {}, fetchImpl: counting, ...capture() }), 0)
  assert.equal(calls, 0)
})

test('runCli exits 2 on a usage error or an unsafe field', async () => {
  const usage = capture()
  assert.equal(await runCli({ argv: [], env: {}, ...usage }), 2)
  assert.match(
    usage.lines.error[0],
    /^usage: vereino-ops-signal\.mjs <backup\.started\|backup\.succeeded\|backup\.failed>/,
  )
  const unsafe = capture()
  assert.equal(await runCli({ argv: ['backup.failed', 'msg=x'], env: {}, ...unsafe }), 2)
  assert.deepEqual(unsafe.lines.out, [])
  assert.match(unsafe.lines.error[0], /field name msg is not allowed/)
})

test('runCli defaults to process.env and the console', async (t) => {
  const log = t.mock.method(console, 'log', () => {})
  const savedUrl = process.env.VEREINO_OPS_BACKUP_HEARTBEAT_URL
  delete process.env.VEREINO_OPS_BACKUP_HEARTBEAT_URL
  try {
    assert.equal(await runCli({ argv: ['backup.succeeded'] }), 0)
  } finally {
    if (savedUrl !== undefined) process.env.VEREINO_OPS_BACKUP_HEARTBEAT_URL = savedUrl
  }
  assert.equal(log.mock.callCount(), 1)
  const error = t.mock.method(console, 'error', () => {})
  assert.equal(await runCli({ argv: [] }), 2)
  assert.equal(error.mock.callCount(), 1)
})
