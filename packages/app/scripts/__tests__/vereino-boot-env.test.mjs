// Unit tests for the boot-time environment check (engineering standards S8.10, ENG-TEST-12; issue #462).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findBootEnvProblems, formatBootEnvProblems, REQUIRED_VARIABLES, runCli } from '../vereino-boot-env.mjs'

const SECRET_VALUE = 'postgres://owner:very-secret-password@db.internal:5432/vereino'

const PRODUCTION = {
  NODE_ENV: 'production',
  DATABASE_URL: SECRET_VALUE,
  JWT_SECRET: 'a-long-signing-secret-value',
  APP_URL: 'https://vereino.example',
  CACHE_STRATEGY: 'redis',
  QUEUE_STRATEGY: 'async',
  REDIS_URL: 'redis://default:redis-secret@redis.internal:6379',
}

test('a complete production environment has no problems', () => {
  assert.deepEqual(findBootEnvProblems(PRODUCTION), [])
})

test('a development environment needs only the database URL', () => {
  assert.deepEqual(findBootEnvProblems({ DATABASE_URL: 'postgresql://localhost/vereino' }), [])
  assert.deepEqual(findBootEnvProblems({ NODE_ENV: 'development' }), [
    'DATABASE_URL is missing (a postgres:// connection URL)',
  ])
})

test('every missing production variable is named', () => {
  assert.deepEqual(findBootEnvProblems({ NODE_ENV: 'production', CACHE_STRATEGY: 'redis', QUEUE_STRATEGY: 'async' }), [
    'DATABASE_URL is missing (a postgres:// connection URL)',
    'JWT_SECRET is missing (the token signing secret)',
    'APP_URL is missing (the public http(s) base URL)',
    'CACHE_REDIS_URL or REDIS_URL is missing (a Redis URL, because CACHE_STRATEGY=redis)',
    'QUEUE_REDIS_URL or REDIS_URL is missing (a Redis URL, because QUEUE_STRATEGY=async)',
  ])
})

test('an empty or blank value counts as missing', () => {
  assert.deepEqual(findBootEnvProblems({ ...PRODUCTION, DATABASE_URL: '' }), [
    'DATABASE_URL is missing (a postgres:// connection URL)',
  ])
  assert.deepEqual(findBootEnvProblems({ ...PRODUCTION, JWT_SECRET: '   ' }), [
    'JWT_SECRET is missing (the token signing secret)',
  ])
})

test('a malformed value is invalid and its value is never echoed', () => {
  const problems = findBootEnvProblems({
    ...PRODUCTION,
    DATABASE_URL: 'mysql://root:hunter2@db/x',
    APP_URL: 'vereino.example',
  })
  assert.deepEqual(problems, [
    'DATABASE_URL is invalid (expected a postgres:// connection URL)',
    'APP_URL is invalid (expected the public http(s) base URL)',
  ])
  assert.ok(!problems.join('\n').includes('hunter2'))
})

test('a subsystem Redis URL replaces REDIS_URL', () => {
  const { REDIS_URL: _unused, ...withoutRedis } = PRODUCTION
  assert.deepEqual(
    findBootEnvProblems({
      ...withoutRedis,
      CACHE_REDIS_URL: 'redis://cache:6379',
      QUEUE_REDIS_URL: 'redis://queue:6379',
    }),
    [],
  )
})

test('Redis is not required by the sqlite cache and the local queue', () => {
  assert.deepEqual(
    findBootEnvProblems({ ...PRODUCTION, REDIS_URL: undefined, CACHE_STRATEGY: 'sqlite', QUEUE_STRATEGY: 'local' }),
    [],
  )
})

test('every required row names at least one variable and a reason', () => {
  for (const row of REQUIRED_VARIABLES) {
    assert.ok(row.names.length > 0)
    assert.ok(row.reason.length > 0)
  }
})

test('formatBootEnvProblems lists the problems or returns null', () => {
  assert.equal(formatBootEnvProblems([]), null)
  const message = formatBootEnvProblems(['DATABASE_URL is missing (a postgres:// connection URL)'])
  assert.match(message ?? '', /Refusing to start/)
  assert.match(message ?? '', /\n {2}- DATABASE_URL is missing/)
})

test('runCli exits 0 on a complete environment and writes nothing', () => {
  const written = []
  assert.equal(runCli({ env: PRODUCTION, error: (message) => written.push(message) }), 0)
  assert.deepEqual(written, [])
})

test('runCli exits 1 naming the missing variable without printing any value', () => {
  const written = []
  assert.equal(runCli({ env: { ...PRODUCTION, JWT_SECRET: '' }, error: (message) => written.push(message) }), 1)
  assert.equal(written.length, 1)
  assert.match(written[0], /JWT_SECRET is missing/)
  for (const value of Object.values(PRODUCTION)) {
    if (value !== 'production' && value !== 'redis' && value !== 'async') assert.ok(!written[0].includes(value))
  }
})

test('runCli defaults to process.env and stderr', (t) => {
  const writes = []
  t.mock.method(process.stderr, 'write', (chunk) => {
    writes.push(String(chunk))
    return true
  })
  const saved = process.env.DATABASE_URL
  t.after(() => {
    if (saved === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = saved
  })
  process.env.DATABASE_URL = 'not-a-url'
  const code = runCli()
  assert.equal(code, 1)
  assert.match(writes.join(''), /DATABASE_URL is invalid/)
})
