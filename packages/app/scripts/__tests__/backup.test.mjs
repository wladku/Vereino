// Unit tests of the off-site backup job and the restore drill (issue #464). The binaries (pg_dump, age, rclone,
// pg_restore, psql) are replaced by a scripted `run`; the end-to-end drill against real PostgreSQL, MinIO and the
// job image is `backup-drill.e2e.mjs` (`yarn test:backup`).
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import {
  DEFAULT_RECIPIENTS_FILE,
  backupNames,
  expiredBackups,
  failures,
  latestDaily,
  missingVariables,
  objectKey,
  parseListing,
  rcloneEnv,
  remotePath,
  runPipeline,
  sanitizeStderr,
} from '../../../../scripts/backup-common.mjs'
import { countRecipients, main as dumpMain, REQUIRED_VARIABLES } from '../../../../scripts/backup-dump.mjs'
import {
  COUNTS_SQL,
  main as restoreMain,
  parseArgs,
  parseCounts,
  tableCounts,
} from '../../../../scripts/backup-restore.mjs'

const KEY = 'age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3290gq'
const BUCKET_ENV = {
  BACKUP_S3_BUCKET: 'vereino-backups',
  BACKUP_S3_ENDPOINT: 'https://s3.example.eu',
  BACKUP_S3_ACCESS_KEY_ID: 'access',
  BACKUP_S3_SECRET_ACCESS_KEY: 'secret-value',
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function recipientsFile(dir, content = `# comment\n${KEY}\n`) {
  const file = path.join(dir, 'recipients.txt')
  fs.writeFileSync(file, content)
  return file
}

// A scripted `run`: `respond(step, calls)` returns `{ code, stdout, stderr }` for the first step of a pipeline
// (or for each step when it returns an array). Writes the `age --output` file so the dump can stat it.
function scriptedRun(respond) {
  const calls = []
  const run = async (steps, options = {}) => {
    calls.push({ steps, options })
    const outcome = respond(steps, calls) ?? {}
    const outcomes = Array.isArray(outcome) ? outcome : steps.map(() => outcome)
    for (const step of steps) {
      const output = step.args.indexOf('--output')
      if (step.command === 'age' && output >= 0 && (outcomes[1]?.code ?? 0) === 0)
        fs.writeFileSync(step.args[output + 1], 'ciphertext')
    }
    const results = steps.map((step, index) => ({
      command: step.command,
      code: outcomes[index]?.code ?? 0,
      stderr: outcomes[index]?.stderr ?? '',
    }))
    return {
      results,
      stdout: outcomes[outcomes.length - 1]?.stdout ?? '',
      ok: results.every((result) => result.code === 0),
    }
  }
  return { run, calls }
}

function collector() {
  const lines = []
  return { write: (text) => lines.push(JSON.parse(text)), lines }
}

const listing = (names) => JSON.stringify(names.map((Name) => ({ Name, IsDir: false })))

test('missingVariables lists unset and blank names in order', () => {
  assert.deepEqual(missingVariables({ A: 'x', B: ' ' }, ['A', 'B', 'C']), ['B', 'C'])
})

test('rcloneEnv maps the bucket variables to an on-the-fly s3 remote with defaults', () => {
  const env = rcloneEnv({ ...BUCKET_ENV, PATH: '/p', HOME: '/h', BACKUP_S3_REGION: 'eu-central' })
  assert.equal(env.RCLONE_S3_SECRET_ACCESS_KEY, 'secret-value')
  assert.equal(env.RCLONE_S3_REGION, 'eu-central')
  assert.equal(env.PATH, '/p')
  assert.equal(env.RCLONE_CONFIG, '/dev/null')
  const defaults = rcloneEnv(BUCKET_ENV)
  assert.equal(defaults.RCLONE_S3_REGION, undefined)
  assert.equal(defaults.PATH, '/usr/local/bin:/usr/bin:/bin')
  assert.equal(defaults.HOME, '/tmp')
})

test('objectKey and remotePath build keys under an optional prefix', () => {
  assert.equal(objectKey(undefined, 'daily', 'a'), 'daily/a')
  assert.equal(objectKey('/prod/', 'daily'), 'prod/daily')
  assert.equal(remotePath('b', 'prod/daily'), ':s3:b/prod/daily')
})

test('backupNames uses the UTC date', () => {
  assert.deepEqual(backupNames(new Date('2026-11-20T23:59:00Z')), {
    daily: 'vereino-2026-11-20.dump.age',
    monthly: 'vereino-2026-11.dump.age',
  })
})

test('expiredBackups keeps the newest copies and ignores foreign files', () => {
  const daily = Array.from({ length: 32 }, (_, index) => `vereino-2026-10-${String(index).padStart(2, '0')}.dump.age`)
  const expired = expiredBackups([...daily.slice().reverse(), 'notes.txt', 'vereino-2026-10.dump.age'], {
    monthly: false,
    keep: 30,
  })
  assert.deepEqual(expired, ['vereino-2026-10-00.dump.age', 'vereino-2026-10-01.dump.age'])
  assert.deepEqual(
    expiredBackups(['vereino-2026-10.dump.age', 'vereino-2026-11.dump.age'], { monthly: true, keep: 1 }),
    ['vereino-2026-10.dump.age'],
  )
  assert.deepEqual(expiredBackups(['vereino-2026-10.dump.age'], { monthly: true, keep: 12 }), [])
})

test('latestDaily picks the newest daily copy or null', () => {
  assert.equal(
    latestDaily(['vereino-2026-11-02.dump.age', 'vereino-2026-11-19.dump.age', 'x']),
    'vereino-2026-11-19.dump.age',
  )
  assert.equal(latestDaily(['x']), null)
})

test('sanitizeStderr drops detail lines and redacts urls and passwords', () => {
  const text =
    'pg_dump: error: connection to postgres://u:p@h/db failed\nDETAIL: Key (email)=(a@b.c)\n\nCONTEXT: COPY x\nhost=h password=hunter2\n'
  assert.equal(sanitizeStderr(text), 'pg_dump: error: connection to [redacted-url] failed | host=h password=[redacted]')
  assert.equal(sanitizeStderr('x'.repeat(600)).length, 500)
})

test('failures and parseListing read run results', () => {
  const run = {
    results: [
      { command: 'a', code: 0, stderr: '' },
      { command: 'b', code: 2, stderr: 'bad' },
    ],
  }
  assert.deepEqual(failures(run), [{ step: 'b', exitCode: 2, detail: 'bad' }])
  assert.deepEqual(parseListing('[{"Name":"a","IsDir":false},{"Name":"d","IsDir":true}]'), ['a'])
  assert.deepEqual(parseListing(''), [])
})

function fakeChild({ code = 0, stdout = '', stderr = '', error = false, closeCode }) {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin.resume()
  setImmediate(() => {
    if (error) {
      child.emit('error', new Error('spawn ENOENT'))
      child.emit('close', -2)
      return
    }
    child.stdout.end(stdout)
    child.stderr.end(stderr)
    child.stdout.resume()
    setImmediate(() => child.emit('close', closeCode === undefined ? code : closeCode))
  })
  return child
}

test('runPipeline chains processes, captures the last stdout and reports exit codes', async () => {
  const spawned = []
  const spawnImpl = (command, args, options) => {
    spawned.push({ command, stdio: options.stdio })
    return fakeChild(command === 'first' ? { stdout: 'data' } : { stdout: 'out', stderr: 'warn', code: 3 })
  }
  const result = await runPipeline(
    [
      { command: 'first', args: [], env: {} },
      { command: 'second', args: [], env: {} },
    ],
    { spawnImpl, capture: true },
  )
  assert.equal(result.ok, false)
  assert.equal(result.stdout, 'out')
  assert.deepEqual(
    result.results.map((entry) => [entry.command, entry.code, entry.stderr]),
    [
      ['first', 0, ''],
      ['second', 3, 'warn'],
    ],
  )
  assert.deepEqual(spawned[0].stdio, ['ignore', 'pipe', 'pipe'])
  assert.deepEqual(spawned[1].stdio, ['pipe', 'pipe', 'pipe'])
})

test('runPipeline treats a missing binary as 127 and a signal as failure', async () => {
  const missing = await runPipeline([{ command: 'nope', args: [], env: {} }], {
    spawnImpl: () => fakeChild({ error: true }),
  })
  assert.equal(missing.results[0].code, 127)
  assert.match(missing.results[0].stderr, /command not found/)
  const signalled = await runPipeline([{ command: 'x', args: [], env: {} }], {
    spawnImpl: () => fakeChild({ closeCode: null }),
  })
  assert.equal(signalled.results[0].code, 1)
  assert.equal(signalled.ok, false)
})

test('runPipeline ignores stdin errors of a step that ended early', async () => {
  const children = []
  const spawnImpl = (command) => {
    const child = fakeChild({})
    children.push(child)
    return child
  }
  const pending = runPipeline(
    [
      { command: 'a', args: [], env: {} },
      { command: 'b', args: [], env: {} },
    ],
    { spawnImpl },
  )
  children[1].stdin.emit('error', new Error('EPIPE'))
  assert.equal((await pending).ok, true)
})

test('dump: missing variables exit 1 and log only the names', async () => {
  const log = collector()
  const code = await dumpMain({ env: { DATABASE_URL: 'postgres://u:p@h/db' }, stderr: log.write, stdout: log.write })
  assert.equal(code, 1)
  assert.deepEqual(log.lines, [
    {
      level: 'error',
      job: 'backup:dump',
      msg: 'backup.dump.failed',
      reason: 'missing-variable',
      variables: REQUIRED_VARIABLES.slice(1),
    },
  ])
  assert.doesNotMatch(JSON.stringify(log.lines), /postgres:/)
})

test('dump: refuses to run without an age recipient', async (t) => {
  const dir = tempDir(t)
  const log = collector()
  const env = {
    ...BUCKET_ENV,
    DATABASE_URL: 'postgres://h/db',
    BACKUP_AGE_RECIPIENTS_FILE: recipientsFile(dir, '# none\n'),
  }
  assert.equal(await dumpMain({ env, stderr: log.write }), 1)
  assert.equal(log.lines[0].reason, 'no-recipient')
  const absent = collector()
  assert.equal(
    await dumpMain({ env: { ...env, BACKUP_AGE_RECIPIENTS_FILE: path.join(dir, 'absent') }, stderr: absent.write }),
    1,
  )
  assert.equal(absent.lines[0].reason, 'no-recipient')
  // The repository file holds no key until the owner adds one, so the job refuses rather than upload plaintext.
  const repository = collector()
  const withoutFile = { ...env, BACKUP_AGE_RECIPIENTS_FILE: '' }
  assert.equal(await dumpMain({ env: withoutFile, stderr: repository.write }), 1)
  assert.equal(repository.lines[0].recipientsFile, DEFAULT_RECIPIENTS_FILE)
})

test('countRecipients counts age public keys only', () => {
  assert.equal(countRecipients(`# x\n\n ${KEY}\n${KEY}\nssh-ed25519 AAAA\n`), 2)
  assert.equal(countRecipients(fs.readFileSync(DEFAULT_RECIPIENTS_FILE, 'utf8')), 0)
})

function dumpEnv(dir, extra = {}) {
  return {
    ...BUCKET_ENV,
    DATABASE_URL: 'postgres://u:p@h/db',
    BACKUP_AGE_RECIPIENTS_FILE: recipientsFile(dir),
    ...extra,
  }
}

const clock = () => {
  let tick = 0
  return () => new Date(Date.UTC(2026, 10, 20, 2, 30, 0, (tick += 1000)))
}

test('dump: streams pg_dump into age, uploads daily and first monthly copy, prunes old copies', async (t) => {
  const dir = tempDir(t)
  const oldDaily = Array.from(
    { length: 31 },
    (_, index) => `vereino-2026-10-${String(index + 1).padStart(2, '0')}.dump.age`,
  )
  const oldMonthly = Array.from({ length: 13 }, (_, index) => `vereino-2025-${String(index).padStart(2, '0')}.dump.age`)
  const { run, calls } = scriptedRun((steps) => {
    const [command, sub, target] = [steps[0].command, steps[0].args[0], steps[0].args.at(-1)]
    if (command === 'rclone' && sub === 'lsjson') {
      return { stdout: listing(target.endsWith('monthly') ? oldMonthly : [...oldDaily, 'vereino-2026-11-20.dump.age']) }
    }
    return { code: 0 }
  })
  const out = collector()
  const code = await dumpMain({
    env: dumpEnv(dir, { BACKUP_S3_PREFIX: 'prod' }),
    run,
    stdout: out.write,
    now: clock(),
    tmpDir: dir,
  })
  assert.equal(code, 0)
  const [dump] = calls
  assert.deepEqual(
    dump.steps.map((step) => step.command),
    ['pg_dump', 'age'],
  )
  assert.ok(dump.steps[0].args.includes('--format=custom'))
  assert.equal(dump.steps[0].env.RCLONE_S3_SECRET_ACCESS_KEY, undefined)
  const commands = calls
    .slice(1)
    .map((call) => call.steps[0].args.slice(0, 1).concat(call.steps[0].args.at(-1)).join(' '))
  assert.deepEqual(commands.slice(0, 4), [
    'copyto :s3:vereino-backups/prod/daily/vereino-2026-11-20.dump.age',
    'lsjson :s3:vereino-backups/prod/monthly',
    'copyto :s3:vereino-backups/prod/monthly/vereino-2026-11.dump.age',
    'lsjson :s3:vereino-backups/prod/daily',
  ])
  assert.deepEqual(commands.slice(4), [
    'deletefile :s3:vereino-backups/prod/daily/vereino-2026-10-01.dump.age',
    'deletefile :s3:vereino-backups/prod/daily/vereino-2026-10-02.dump.age',
    'lsjson :s3:vereino-backups/prod/monthly',
    'deletefile :s3:vereino-backups/prod/monthly/vereino-2025-00.dump.age',
  ])
  assert.deepEqual(
    out.lines.map((line) => line.msg),
    ['backup.dump.started', 'backup.dump.succeeded'],
  )
  assert.deepEqual(
    { ...out.lines[1], durationMs: undefined },
    {
      level: 'info',
      job: 'backup:dump',
      msg: 'backup.dump.succeeded',
      key: 'prod/daily/vereino-2026-11-20.dump.age',
      monthlyKey: 'prod/monthly/vereino-2026-11.dump.age',
      bytes: 10,
      prunedDaily: 2,
      prunedMonthly: 1,
      durationMs: undefined,
    },
  )
  assert.equal(out.lines[1].durationMs, 1000)
  assert.doesNotMatch(JSON.stringify(out.lines), /postgres:|secret-value/)
  assert.deepEqual(fs.readdirSync(dir), ['recipients.txt'])
})

test('dump: an empty bucket gets the first daily and monthly copy and nothing is pruned', async (t) => {
  const dir = tempDir(t)
  const { run, calls } = scriptedRun((steps) =>
    steps[0].args[0] === 'lsjson' ? { code: 3, stderr: 'directory not found' } : { code: 0 },
  )
  const out = collector()
  assert.equal(await dumpMain({ env: dumpEnv(dir), run, stdout: out.write, now: clock(), tmpDir: dir }), 0)
  assert.equal(calls.filter((call) => call.steps[0].args[0] === 'copyto').length, 2)
  assert.equal(out.lines[1].prunedDaily, 0)
})

test('dump: an existing monthly copy is not uploaded again', async (t) => {
  const dir = tempDir(t)
  const { run, calls } = scriptedRun((steps) =>
    steps[0].args[0] === 'lsjson' ? { stdout: listing(['vereino-2026-11.dump.age']) } : { code: 0 },
  )
  const out = collector()
  assert.equal(await dumpMain({ env: dumpEnv(dir), run, stdout: out.write, now: clock(), tmpDir: dir }), 0)
  assert.equal(calls.filter((call) => call.steps[0].args[0] === 'copyto').length, 1)
  assert.equal(out.lines[1].monthlyKey, null)
})

const failingCases = [
  [
    'dump-failed',
    (steps) =>
      steps[0].command === 'pg_dump' ? [{ code: 1, stderr: 'pg_dump: error: postgres://u:p@h/db' }, { code: 0 }] : {},
  ],
  ['upload-failed', (steps) => (steps[0].args[0] === 'copyto' ? { code: 1, stderr: 'AccessDenied' } : {})],
  ['list-failed', (steps) => (steps[0].args[0] === 'lsjson' ? { code: 1 } : {})],
  [
    'prune-failed',
    (steps) => {
      if (steps[0].args[0] === 'lsjson')
        return {
          stdout: listing(
            Array.from({ length: 31 }, (_, i) => `vereino-2026-09-${String(i).padStart(2, '0')}.dump.age`),
          ),
        }
      return steps[0].args[0] === 'deletefile' ? { code: 1 } : {}
    },
  ],
]

for (const [reason, respond] of failingCases) {
  test(`dump: ${reason} logs backup.dump.failed and exits 1`, async (t) => {
    const dir = tempDir(t)
    const { run } = scriptedRun(respond)
    const err = collector()
    const code = await dumpMain({
      env: dumpEnv(dir),
      run,
      stdout: () => {},
      stderr: err.write,
      now: clock(),
      tmpDir: dir,
    })
    assert.equal(code, 1)
    assert.equal(err.lines[0].msg, 'backup.dump.failed')
    assert.equal(err.lines[0].reason, reason)
    assert.doesNotMatch(JSON.stringify(err.lines), /postgres:/)
    assert.deepEqual(fs.readdirSync(dir), ['recipients.txt'])
  })
}

test('dump: an unexpected error is reported without its message', async (t) => {
  const dir = tempDir(t)
  const err = collector()
  const run = async () => {
    throw new Error('postgres://u:p@h/db')
  }
  assert.equal(await dumpMain({ env: dumpEnv(dir), run, stdout: () => {}, stderr: err.write, tmpDir: dir }), 1)
  assert.equal(err.lines[0].reason, 'unexpected')
  assert.doesNotMatch(JSON.stringify(err.lines), /postgres:/)
})

test('restore parseArgs validates the options', () => {
  assert.deepEqual(parseArgs(['--identity', 'k', '--target', 't', '--object', 'o']), {
    identity: 'k',
    target: 't',
    object: 'o',
    countsOnly: false,
  })
  assert.equal(parseArgs(['--counts-only', '--target', 't']).countsOnly, true)
  assert.deepEqual(parseArgs(['--target']), { error: '--target needs a value' })
  assert.deepEqual(parseArgs(['--target', '--x']), { error: '--target needs a value' })
  assert.deepEqual(parseArgs(['--what']), { error: 'Unknown argument: --what' })
  assert.deepEqual(parseArgs([]), { error: '--target is required' })
  assert.deepEqual(parseArgs(['--target', 't']), { error: '--identity is required' })
})

test('restore parseCounts reads tab separated lines', () => {
  assert.deepEqual(parseCounts('public.a\t3\npublic.b\t0\n\nnoise\n'), { 'public.a': 3, 'public.b': 0 })
  assert.match(COUNTS_SQL, /query_to_xml/)
})

function messages() {
  const out = []
  const err = []
  return { out, err, log: (line) => out.push(line), logError: (line) => err.push(line) }
}

test('restore: bad arguments print usage and exit 2', async () => {
  const io = messages()
  assert.equal(await restoreMain({ args: ['--nope'], ...io }), 2)
  assert.match(io.err.join('\n'), /Usage:/)
})

test('restore: --counts-only prints counts or the failure', async () => {
  const ok = messages()
  const { run, calls } = scriptedRun(() => ({ stdout: 'public.a\t2\n' }))
  assert.equal(await restoreMain({ args: ['--counts-only', '--target', 'postgres://t'], env: {}, run, ...ok }), 0)
  assert.deepEqual(ok.out, ['public.a\t2', '1 tables'])
  assert.equal(calls[0].steps[0].env.PATH, '/usr/local/bin:/usr/bin:/bin')
  const failed = messages()
  const broken = scriptedRun(() => ({ code: 2, stderr: 'psql: error: postgres://t refused' }))
  assert.equal(
    await restoreMain({ args: ['--counts-only', '--target', 'postgres://t'], env: {}, run: broken.run, ...failed }),
    1,
  )
  assert.equal(failed.err[0], 'Counting rows failed: psql exited 2: psql: error: [redacted-url] refused')
})

test('restore: tableCounts passes the target and returns counts', async () => {
  const { run, calls } = scriptedRun(() => ({ stdout: 'public.x\t5' }))
  assert.deepEqual(await tableCounts(run, 'postgres://t', { PATH: '/p' }), { counts: { 'public.x': 5 } })
  assert.ok(calls[0].steps[0].args.includes('--dbname=postgres://t'))
})

function restoreSetup(t) {
  const dir = tempDir(t)
  const identity = path.join(dir, 'key.txt')
  fs.writeFileSync(identity, 'AGE-SECRET-KEY-1')
  return { dir, identity, args: ['--identity', identity, '--target', 'postgres://local/restored'] }
}

test('restore: missing bucket variables or identity file stop before any command', async (t) => {
  const { dir, identity } = restoreSetup(t)
  const { run, calls } = scriptedRun(() => ({}))
  const io = messages()
  assert.equal(
    await restoreMain({ args: ['--identity', identity, '--target', 't'], env: { BACKUP_S3_BUCKET: 'b' }, run, ...io }),
    1,
  )
  assert.equal(io.err[0], 'Missing variable: BACKUP_S3_ENDPOINT, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY')
  const absent = messages()
  assert.equal(
    await restoreMain({ args: ['--identity', path.join(dir, 'x'), '--target', 't'], env: BUCKET_ENV, run, ...absent }),
    1,
  )
  assert.match(absent.err[0], /Identity file not found/)
  assert.equal(calls.length, 0)
})

test('restore: newest daily copy is downloaded, decrypted, restored and counted', async (t) => {
  const { dir, args } = restoreSetup(t)
  const { run, calls } = scriptedRun((steps) => {
    if (steps[0].args[0] === 'lsjson')
      return { stdout: listing(['vereino-2026-11-18.dump.age', 'vereino-2026-11-19.dump.age']) }
    if (steps[0].command === 'psql') return { stdout: 'public.a\t3\npublic.b\t0\n' }
    return {}
  })
  const io = messages()
  assert.equal(
    await restoreMain({ args, env: { ...BUCKET_ENV, BACKUP_S3_PREFIX: 'prod' }, run, tmpDir: dir, ...io }),
    0,
  )
  assert.deepEqual(
    calls.map((call) => call.steps[0].command),
    ['rclone', 'rclone', 'age', 'pg_restore', 'psql'],
  )
  assert.equal(calls[1].steps[0].args[1], ':s3:vereino-backups/prod/daily/vereino-2026-11-19.dump.age')
  assert.deepEqual(io.out, [
    'Restoring prod/daily/vereino-2026-11-19.dump.age',
    'Restored prod/daily/vereino-2026-11-19.dump.age. Row counts:',
    'public.a\t3',
    'public.b\t0',
    '2 tables',
  ])
  assert.deepEqual(fs.readdirSync(dir), ['key.txt'])
})

test('restore: --object restores the named copy', async (t) => {
  const { dir, args } = restoreSetup(t)
  const { run, calls } = scriptedRun((steps) => (steps[0].command === 'psql' ? { stdout: '' } : {}))
  const io = messages()
  assert.equal(
    await restoreMain({
      args: [...args, '--object', 'monthly/vereino-2026-10.dump.age'],
      env: BUCKET_ENV,
      run,
      tmpDir: dir,
      ...io,
    }),
    0,
  )
  assert.equal(calls[0].steps[0].args[1], ':s3:vereino-backups/monthly/vereino-2026-10.dump.age')
  assert.equal(io.out.at(-1), '0 tables')
})

const restoreFailures = [
  [
    'empty bucket',
    (steps) => (steps[0].args[0] === 'lsjson' ? { stdout: '[]' } : {}),
    /^No daily backup found in daily$/,
    1,
  ],
  [
    'listing error',
    (steps) => (steps[0].args[0] === 'lsjson' ? { code: 3, stderr: 'directory not found' } : {}),
    /No daily backup found in daily: rclone exited 3: directory not found/,
    1,
  ],
  [
    'download error',
    (steps) =>
      steps[0].args[0] === 'copyto'
        ? { code: 1 }
        : steps[0].args[0] === 'lsjson'
          ? { stdout: listing(['vereino-2026-11-19.dump.age']) }
          : {},
    /^Download of daily\/vereino-2026-11-19.dump.age failed: rclone exited 1$/,
    2,
  ],
  [
    'wrong key',
    (steps) =>
      steps[0].command === 'age'
        ? { code: 1, stderr: 'age: error: no identity matched any of the recipients' }
        : steps[0].args[0] === 'lsjson'
          ? { stdout: listing(['vereino-2026-11-19.dump.age']) }
          : {},
    /^Decryption failed: .*No database was touched\. age exited 1: age: error: no identity matched/,
    3,
  ],
  [
    'restore error',
    (steps) =>
      steps[0].command === 'pg_restore'
        ? { code: 1, stderr: 'pg_restore: error: x\nDETAIL: secret row' }
        : steps[0].args[0] === 'lsjson'
          ? { stdout: listing(['vereino-2026-11-19.dump.age']) }
          : {},
    /^pg_restore failed: pg_restore exited 1: pg_restore: error: x$/,
    4,
  ],
  [
    'count error',
    (steps) =>
      steps[0].command === 'psql'
        ? { code: 2 }
        : steps[0].args[0] === 'lsjson'
          ? { stdout: listing(['vereino-2026-11-19.dump.age']) }
          : {},
    /^Restored, but counting rows failed: psql exited 2$/,
    5,
  ],
]

for (const [name, respond, message, commandsRun] of restoreFailures) {
  test(`restore: ${name} exits 1 with a clear message`, async (t) => {
    const { dir, args } = restoreSetup(t)
    const { run, calls } = scriptedRun(respond)
    const io = messages()
    assert.equal(await restoreMain({ args, env: BUCKET_ENV, run, tmpDir: dir, ...io }), 1)
    assert.match(io.err[0], message)
    assert.equal(calls.length, commandsRun)
    assert.deepEqual(fs.readdirSync(dir), ['key.txt'])
  })
}
