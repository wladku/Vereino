// Unit tests for the boot-time environment check (engineering standards S8.10, ENG-TEST-12; issue #462).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  findBootEnvProblems,
  findBootEnvWarnings,
  formatBootEnvProblems,
  KEY_STORE_RULES,
  RATE_LIMIT_RULES,
  REQUIRED_VARIABLES,
  runCli,
} from '../vereino-boot-env.mjs'

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

// Rate limits (#738): the platform limiter's settings a deployment must not run with.
const RAILWAY = {
  ...PRODUCTION,
  RAILWAY_ENVIRONMENT_NAME: 'staging',
  RATE_LIMIT_STRATEGY: 'redis',
  RATE_LIMIT_TRUST_PROXY_DEPTH: '1',
}

test('a complete Railway environment has no rate-limit problems or warnings', () => {
  assert.deepEqual(findBootEnvProblems(RAILWAY), [])
  assert.deepEqual(findBootEnvWarnings(RAILWAY), [])
})

test('the redis strategy needs REDIS_URL itself, which is all the limiter reads', () => {
  const { REDIS_URL: _unused, ...withoutRedis } = RAILWAY
  assert.deepEqual(
    findBootEnvProblems({ ...withoutRedis, CACHE_REDIS_URL: 'redis://cache:6379', QUEUE_REDIS_URL: 'redis://q:6379' }),
    ['REDIS_URL is missing (the rate limiter reads it, because RATE_LIMIT_STRATEGY=redis)'],
  )
})

test('an unknown strategy and a malformed proxy depth are invalid anywhere', () => {
  assert.deepEqual(
    findBootEnvProblems({ ...PRODUCTION, RATE_LIMIT_STRATEGY: 'disk', RATE_LIMIT_TRUST_PROXY_DEPTH: 'one' }),
    [
      'RATE_LIMIT_STRATEGY is invalid (expected memory or redis)',
      'RATE_LIMIT_TRUST_PROXY_DEPTH is invalid (expected a whole number of trusted proxies)',
    ],
  )
  assert.deepEqual(findBootEnvProblems({ ...PRODUCTION, RATE_LIMIT_TRUST_PROXY_DEPTH: ' 2 ' }), [])
})

test('Railway refuses the memory strategy, disabled limits and the integration-test switch', () => {
  assert.deepEqual(
    findBootEnvProblems({
      ...RAILWAY,
      RATE_LIMIT_STRATEGY: undefined,
      RATE_LIMIT_ENABLED: 'false',
      OM_INTEGRATION_TEST: 'true',
      OM_TEST_MODE: '1',
    }),
    [
      'RATE_LIMIT_STRATEGY must be redis on Railway (shared counters that survive a deploy)',
      'RATE_LIMIT_ENABLED must not be false on Railway',
      'OM_INTEGRATION_TEST must not be set on Railway (it switches rate limits off)',
      'OM_TEST_MODE must not be set on Railway (it captures e-mail and lets a request pick the test limiter)',
    ],
  )
  assert.deepEqual(findBootEnvProblems({ ...RAILWAY, RATE_LIMIT_ENABLED: 'true', OM_INTEGRATION_TEST: 'false' }), [])
})

test('outside Railway the rate-limit settings stay free (local runs, the integration runner)', () => {
  assert.deepEqual(
    findBootEnvProblems({ ...PRODUCTION, RATE_LIMIT_ENABLED: 'false', OM_INTEGRATION_TEST: 'true', OM_TEST_MODE: '1' }),
    [],
  )
  assert.deepEqual(findBootEnvWarnings(PRODUCTION), [])
})

test('an unset or zero proxy depth on Railway is a warning, not a stop', () => {
  for (const depth of [undefined, '', '0']) {
    const env = { ...RAILWAY, RATE_LIMIT_TRUST_PROXY_DEPTH: depth }
    assert.deepEqual(findBootEnvProblems(env), [])
    assert.equal(findBootEnvWarnings(env).length, 1)
    assert.match(findBootEnvWarnings(env)[0], /RATE_LIMIT_TRUST_PROXY_DEPTH is unset or 0/)
  }
})

test('every rate-limit rule names its problem', () => {
  for (const rule of RATE_LIMIT_RULES) assert.ok(rule.problem.length > 0)
})

test('every Railway script that runs the boot check sets the rate-limit store default first', async () => {
  const { readFile } = await import('node:fs/promises')
  const root = new URL('../../../../scripts/', import.meta.url)
  for (const name of ['railway-start.sh', 'railway-worker.sh', 'railway-predeploy.sh']) {
    const script = await readFile(new URL(name, root), 'utf8')
    const defaultAt = script.indexOf('export RATE_LIMIT_STRATEGY="${RATE_LIMIT_STRATEGY:-redis}"')
    const checkAt = script.indexOf('node ./packages/app/scripts/vereino-boot-env.mjs')
    assert.ok(checkAt > 0, `${name} runs the boot check`)
    assert.ok(defaultAt > 0 && defaultAt < checkAt, `${name} sets the default before the boot check`)
  }
})

// Key store (#740, DD-K03 of `.ai/specs/2026-11-26-vereino-key-store-and-key-inventory.md`).
const VAULT_MODE = {
  ...PRODUCTION,
  VEREINO_KEY_STORE: 'vault',
  VAULT_ADDR: 'http://vault.railway.internal:8200',
  VAULT_TOKEN: 'hvs.app-token-secret-value',
  VAULT_KV_PATH: 'secret/data',
  VAULT_REQUEST_TIMEOUT_MS: '3000',
  LOOKUP_HASH_PEPPER: 'pepper-secret-value',
}

test("the derived mode is the default and today's fallback-key configuration passes", () => {
  const derived = { ...PRODUCTION, TENANT_DATA_ENCRYPTION_FALLBACK_KEY: 'fallback-secret-value' }
  assert.deepEqual(findBootEnvProblems(derived), [])
  assert.deepEqual(findBootEnvProblems({ ...derived, VEREINO_KEY_STORE: 'derived' }), [])
  assert.deepEqual(findBootEnvProblems({ ...derived, VEREINO_KEY_STORE: '  ' }), [])
  assert.deepEqual(findBootEnvWarnings(derived), [])
})

test('an unknown key-store mode is invalid', () => {
  assert.deepEqual(findBootEnvProblems({ ...PRODUCTION, VEREINO_KEY_STORE: 'kms' }), [
    'VEREINO_KEY_STORE is invalid (expected derived or vault)',
  ])
})

test('a complete vault-mode environment has no problems or warnings', () => {
  assert.deepEqual(findBootEnvProblems(VAULT_MODE), [])
  assert.deepEqual(findBootEnvProblems({ ...VAULT_MODE, VAULT_KV_PATH: undefined }), [])
  assert.deepEqual(findBootEnvProblems({ ...VAULT_MODE, VAULT_KV_PATH: 'secret/data/' }), [])
  assert.deepEqual(findBootEnvProblems({ ...VAULT_MODE, TENANT_DATA_ENCRYPTION: 'yes' }), [])
  assert.deepEqual(findBootEnvWarnings(VAULT_MODE), [])
})

test('vault mode needs the Vault address, the app token and a pinned pepper', () => {
  assert.deepEqual(
    findBootEnvProblems({ ...VAULT_MODE, VAULT_ADDR: '', VAULT_TOKEN: undefined, LOOKUP_HASH_PEPPER: ' ' }),
    [
      'VAULT_ADDR is missing (the private http(s) URL of Vault, because VEREINO_KEY_STORE=vault)',
      'VAULT_TOKEN is missing (the vereino-app token, because VEREINO_KEY_STORE=vault)',
      'LOOKUP_HASH_PEPPER is missing (pin it to the old fallback key before VEREINO_KEY_STORE=vault, DD-K04)',
    ],
  )
})

test('vault mode refuses a malformed address and any KV path but the granted one', () => {
  assert.deepEqual(findBootEnvProblems({ ...VAULT_MODE, VAULT_ADDR: 'vault:8200', VAULT_KV_PATH: 'kv/data' }), [
    'VAULT_ADDR is invalid (expected the private http(s) URL of Vault)',
    'VAULT_KV_PATH must be secret/data (the only path the vereino-app policy grants)',
  ])
})

test('vault mode refuses every derived-key fallback and disabled encryption (BR-K4)', () => {
  const problems = findBootEnvProblems({
    ...VAULT_MODE,
    TENANT_DATA_ENCRYPTION_FALLBACK_KEY: 'fallback-secret-value',
    TENANT_DATA_ENCRYPTION_KEY: 'legacy-secret-value',
    ALLOW_DERIVED_KMS_FALLBACK: 'true',
    TENANT_DATA_ENCRYPTION: 'no',
  })
  assert.deepEqual(problems, [
    'TENANT_DATA_ENCRYPTION_FALLBACK_KEY must not be set when VEREINO_KEY_STORE=vault (derived-key fallback)',
    'TENANT_DATA_ENCRYPTION_KEY must not be set when VEREINO_KEY_STORE=vault (derived-key fallback)',
    'ALLOW_DERIVED_KMS_FALLBACK must not be set when VEREINO_KEY_STORE=vault (derived-key fallback)',
    'TENANT_DATA_ENCRYPTION must not be off when VEREINO_KEY_STORE=vault',
  ])
  for (const value of [
    'fallback-secret-value',
    'legacy-secret-value',
    'hvs.app-token-secret-value',
    'pepper-secret-value',
  ]) {
    assert.ok(!problems.join('\n').includes(value))
  }
})

test('the derived mode refuses Vault variables (the mixed state of DD-K02)', () => {
  const expected = [
    'VAULT_ADDR and VAULT_TOKEN must not be set while VEREINO_KEY_STORE is derived (set VEREINO_KEY_STORE=vault and remove the fallback key in the same deploy, docs/ops/key-store.md)',
  ]
  assert.deepEqual(findBootEnvProblems({ ...PRODUCTION, VAULT_ADDR: 'http://vault:8200' }), expected)
  assert.deepEqual(findBootEnvProblems({ ...PRODUCTION, VEREINO_KEY_STORE: 'derived', VAULT_TOKEN: 't' }), expected)
})

test('vault mode warns about a Vault timeout below 3000 ms', () => {
  for (const timeout of [undefined, '', '1000', 'slow']) {
    const warnings = findBootEnvWarnings({ ...VAULT_MODE, VAULT_REQUEST_TIMEOUT_MS: timeout })
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /VAULT_REQUEST_TIMEOUT_MS is unset or below 3000/)
  }
  assert.deepEqual(findBootEnvWarnings({ ...VAULT_MODE, VAULT_REQUEST_TIMEOUT_MS: '5000' }), [])
})

test('every key-store rule names its problem', () => {
  for (const rule of KEY_STORE_RULES) assert.ok(rule.problem.length > 0)
})
