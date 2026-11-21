// End-to-end restore drill of the off-site backup (ENG-TEST-10, issue #464), run by `yarn test:backup`.
// It builds the job image `docker/backup/Dockerfile`, starts PostgreSQL 17 with seed data and an S3-compatible
// server (Versity S3 Gateway) in Testcontainers, and runs the real scripts with the real pg_dump, age and rclone:
//   - the dump job uploads an encrypted dump; a restore into a fresh database reproduces every table's row count;
//   - a wrong key fails with a clear message and leaves the target database untouched;
//   - without bucket credentials the job exits non-zero and logs only the missing variable names;
//   - the job pings the E18-S04 backup heartbeat (#519): `<url>` after a successful dump, `<url>/fail` after a failed
//     one, against a recording HTTP server on the drill network.
// Not part of `test:scripts` (it needs Docker); the unit tests in `backup.test.mjs` hold the coverage.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { GenericContainer, Network, Wait } from 'testcontainers'
import { DEFAULT_POSTGRES_IMAGE } from '../vereino-ephemeral.mjs'
import { REPO_ROOT } from '../vereino-paths.mjs'

const IMAGE = 'vereino-backup:drill'
const S3_IMAGE = 'versity/versitygw:v1.11.0@sha256:8319a530d08d537426e2f855bae5280709795dc73a3f0c347973ef915d6343c5'
const SOURCE_URL = 'postgres://vereino:secret@db:5432/vereino_test'
const urlOf = (database) => `postgres://vereino:secret@db:5432/${database}`
const BUCKET = {
  BACKUP_S3_BUCKET: 'vereino-backups',
  BACKUP_S3_ENDPOINT: 'http://s3:7070',
  BACKUP_S3_ACCESS_KEY_ID: 'drill-access',
  BACKUP_S3_SECRET_ACCESS_KEY: 'drill-secret-key',
  BACKUP_S3_REGION: 'us-east-1',
  BACKUP_S3_PREFIX: 'drill',
}

const SEED_SQL = `
create extension if not exists vector;
create schema club;
create table club.members (id serial primary key, name text not null, joined date not null default current_date);
insert into club.members (name) select 'member ' || n from generate_series(1, 137) as n;
create table public.payments (id bigserial primary key, member_id int references club.members(id), amount numeric(10,2), embedding vector(3));
insert into public.payments (member_id, amount, embedding) select (n % 137) + 1, n * 1.5, '[1,2,3]' from generate_series(1, 412) as n;
create table public.empty_table (id int);
`

const state = { keysDir: '', network: null, containers: [] }

// A recording heartbeat monitor: every request path is kept, `GET /seen` returns them as JSON.
const HEARTBEAT_SERVER = `
const seen = []
require('node:http')
  .createServer((request, response) => {
    if (request.url === '/seen') return response.end(JSON.stringify(seen))
    seen.push(request.url)
    response.end('OK')
  })
  .listen(8080, () => console.log('heartbeat listening'))
`
const HEARTBEAT = { VEREINO_OPS_BACKUP_HEARTBEAT_URL: 'http://heartbeat:8080/ping/drill-check' }

async function heartbeatsSeen() {
  const response = await fetch(`http://${state.heartbeat.getHost()}:${state.heartbeat.getMappedPort(8080)}/seen`)
  return response.json()
}

function docker(args, { input } = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 })
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

// Runs the job image on the drill network with the given environment; keys are mounted read-only at /keys.
function job(env, command = []) {
  const flags = Object.entries(env).flatMap(([name, value]) => ['-e', `${name}=${value}`])
  return docker([
    'run',
    '--rm',
    '--network',
    state.network.getName(),
    '-v',
    `${state.keysDir}:/keys:ro`,
    ...flags,
    IMAGE,
    ...command,
  ])
}

function restore(args) {
  return job(BUCKET, ['node', 'scripts/backup-restore.mjs', ...args])
}

function counts(stdout) {
  return Object.fromEntries(
    stdout
      .split('\n')
      .filter((line) => line.includes('\t'))
      .map((line) => line.split('\t'))
      .map(([table, count]) => [table, Number(count)]),
  )
}

function keyPair() {
  const generated = job({}, ['age-keygen'])
  assert.equal(generated.code, 0, generated.stderr)
  const publicKey = /public key: (age1\S+)/i.exec(`${generated.stdout}\n${generated.stderr}`)[1]
  return { publicKey, identity: generated.stdout }
}

before(async () => {
  const build = docker([
    'build',
    '--quiet',
    '-t',
    IMAGE,
    '-f',
    path.join(REPO_ROOT, 'docker', 'backup', 'Dockerfile'),
    REPO_ROOT,
  ])
  assert.equal(build.code, 0, build.stderr)
  state.network = await new Network().start()
  const db = await new GenericContainer(DEFAULT_POSTGRES_IMAGE)
    .withNetwork(state.network)
    .withNetworkAliases('db')
    .withEnvironment({ POSTGRES_DB: 'vereino_test', POSTGRES_USER: 'vereino', POSTGRES_PASSWORD: 'secret' })
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start()
  state.containers.push(db)
  const s3 = await new GenericContainer(S3_IMAGE)
    .withNetwork(state.network)
    .withNetworkAliases('s3')
    .withCommand([
      '--access',
      BUCKET.BACKUP_S3_ACCESS_KEY_ID,
      '--secret',
      BUCKET.BACKUP_S3_SECRET_ACCESS_KEY,
      '--port',
      ':7070',
      'posix',
      '--nometa',
      '/tmp',
    ])
    .withExposedPorts(7070)
    .withWaitStrategy(Wait.forListeningPorts())
    .start()
  state.containers.push(s3)
  state.db = db
  state.heartbeat = await new GenericContainer(IMAGE)
    .withNetwork(state.network)
    .withNetworkAliases('heartbeat')
    .withCommand(['node', '-e', HEARTBEAT_SERVER])
    .withExposedPorts(8080)
    .withWaitStrategy(Wait.forLogMessage(/heartbeat listening/))
    .start()
  state.containers.push(state.heartbeat)

  const seeded = await db.exec(['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'vereino', '-d', 'vereino_test', '-c', SEED_SQL])
  assert.equal(seeded.exitCode, 0, seeded.output)
  for (const database of ['restored', 'untouched']) {
    const created = await db.exec(['createdb', '-U', 'vereino', database])
    assert.equal(created.exitCode, 0, created.output)
  }

  state.keysDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-drill-'))
  fs.chmodSync(state.keysDir, 0o755)
  const right = keyPair()
  const wrong = keyPair()
  fs.writeFileSync(path.join(state.keysDir, 'recipients.txt'), `# drill\n${right.publicKey}\n`, { mode: 0o644 })
  fs.writeFileSync(path.join(state.keysDir, 'identity.txt'), right.identity, { mode: 0o644 })
  fs.writeFileSync(path.join(state.keysDir, 'wrong-identity.txt'), wrong.identity, { mode: 0o644 })

  const bucket = job(
    {
      RCLONE_CONFIG: '/dev/null',
      RCLONE_S3_PROVIDER: 'Other',
      RCLONE_S3_ENDPOINT: BUCKET.BACKUP_S3_ENDPOINT,
      RCLONE_S3_ACCESS_KEY_ID: BUCKET.BACKUP_S3_ACCESS_KEY_ID,
      RCLONE_S3_SECRET_ACCESS_KEY: BUCKET.BACKUP_S3_SECRET_ACCESS_KEY,
      RCLONE_S3_REGION: BUCKET.BACKUP_S3_REGION,
      RCLONE_S3_FORCE_PATH_STYLE: 'true',
    },
    ['rclone', 'mkdir', `:s3:${BUCKET.BACKUP_S3_BUCKET}`],
  )
  assert.equal(bucket.code, 0, bucket.stderr)
})

after(async () => {
  for (const container of state.containers.reverse()) await container.stop()
  await state.network?.stop()
  if (state.keysDir) fs.rmSync(state.keysDir, { recursive: true, force: true })
})

test('ENG-TEST-10 the nightly dump restores into a fresh database with equal row counts', async () => {
  const dump = job({
    ...BUCKET,
    ...HEARTBEAT,
    DATABASE_URL: SOURCE_URL,
    BACKUP_AGE_RECIPIENTS_FILE: '/keys/recipients.txt',
  })
  assert.equal(dump.code, 0, dump.stderr)
  assert.deepEqual(await heartbeatsSeen(), ['/ping/drill-check'])
  assert.match(dump.stdout, /"signal":"vereino\.ops\.backup\.succeeded"/)
  assert.doesNotMatch(dump.stdout + dump.stderr, /drill-check/)
  const lines = dump.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  const succeeded = lines.find((line) => line.msg === 'backup.dump.succeeded')
  assert.ok(succeeded, dump.stdout)
  assert.match(succeeded.key, /^drill\/daily\/vereino-\d{4}-\d{2}-\d{2}\.dump\.age$/)
  assert.match(succeeded.monthlyKey, /^drill\/monthly\/vereino-\d{4}-\d{2}\.dump\.age$/)
  assert.ok(succeeded.bytes > 0)
  assert.doesNotMatch(dump.stdout + dump.stderr, /secret@|drill-secret-key|member 1/)

  // A second run on the same day replaces the daily copy and keeps the existing monthly copy.
  const again = job({ ...BUCKET, DATABASE_URL: SOURCE_URL, BACKUP_AGE_RECIPIENTS_FILE: '/keys/recipients.txt' })
  assert.equal(again.code, 0, again.stderr)
  const againLines = again.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.equal(againLines.find((line) => line.msg === 'backup.dump.succeeded').monthlyKey, null)

  const source = restore(['--counts-only', '--target', SOURCE_URL])
  assert.equal(source.code, 0, source.stderr)
  const expected = counts(source.stdout)
  assert.deepEqual(expected, { 'club.members': 137, 'public.empty_table': 0, 'public.payments': 412 })

  const restored = restore(['--identity', '/keys/identity.txt', '--target', urlOf('restored')])
  assert.equal(restored.code, 0, restored.stderr)
  assert.match(restored.stdout, /^Restoring drill\/daily\/vereino-/)
  assert.deepEqual(counts(restored.stdout), expected)
  assert.doesNotMatch(restored.stdout + restored.stderr, /secret@/)
})

test('a wrong key fails with a clear message and touches no database', () => {
  const failed = restore(['--identity', '/keys/wrong-identity.txt', '--target', urlOf('untouched')])
  assert.equal(failed.code, 1)
  assert.match(failed.stderr, /Decryption failed: .*No database was touched\./)
  const untouched = restore(['--counts-only', '--target', urlOf('untouched')])
  assert.equal(untouched.code, 0, untouched.stderr)
  assert.match(untouched.stdout, /^0 tables$/m)
})

test('without bucket credentials the job exits non-zero, logs only the missing variable names and pings /fail', async () => {
  const earlier = await heartbeatsSeen()
  const missing = job({ ...HEARTBEAT, DATABASE_URL: SOURCE_URL, BACKUP_S3_BUCKET: BUCKET.BACKUP_S3_BUCKET })
  assert.notEqual(missing.code, 0)
  assert.equal(missing.stdout, '')
  const [failed, signal, ...rest] = missing.stderr
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.deepEqual(rest, [])
  assert.equal(signal.signal, 'vereino.ops.backup.failed')
  assert.equal(signal.step, 'missing-variable')
  assert.deepEqual((await heartbeatsSeen()).slice(earlier.length), ['/ping/drill-check/fail'])
  assert.doesNotMatch(missing.stderr, /drill-check/)
  assert.deepEqual(failed, {
    level: 'error',
    job: 'backup:dump',
    msg: 'backup.dump.failed',
    reason: 'missing-variable',
    variables: ['BACKUP_S3_ENDPOINT', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY'],
  })
})
