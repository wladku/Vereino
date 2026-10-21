// Unit tests for the one-command installer (engineering standards S18, issue #5).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  STEPS,
  createIo,
  dependencyInputs,
  devCommand,
  hashFiles,
  inspectDatabase,
  isLocalDatabaseUrl,
  parseArgs,
  readEnvValue,
  readRequirements,
  setup,
  sslConfig,
} from '../../../../scripts/setup.mjs'

const requirements = { nodeMajor: 24, yarnVersion: '4.17.1' }
const LOCAL_URL = 'postgres://postgres:postgres@localhost:5432/open-mercato'

// An in-memory machine: files, command exit codes and database states are scripted per test.
function fakeIo({
  files = {},
  nodeVersion = '24.1.0',
  yarnVersions = ['4.17.1'],
  statuses = {},
  databases = ['initialized'],
  override = { applied: false },
  env = {},
} = {}) {
  const store = { 'package.json': '{}', 'yarn.lock': 'lock', ...files }
  const ran = []
  const versions = [...yarnVersions]
  const states = [...databases]
  const io = {
    env,
    nodeVersion,
    ran,
    store,
    inspected: [],
    sslSeen: [],
    exists: (file) => file in store,
    listDir: () => ['app', 'core', 'notes.md'],
    readFile: (file) => store[file],
    writeFile: (file, text) => {
      store[file] = text
    },
    copyFile: (from, to) => {
      store[to] = store[from]
    },
    run: (command, args) => {
      const line = [command, ...args].join(' ')
      ran.push(line)
      return statuses[line] ?? 0
    },
    capture: () => (versions.length > 1 ? versions.shift() : versions[0]),
    resolveDatabaseOverride: async (flags) => {
      io.overrideFlags = flags
      if (override instanceof Error) throw override
      return override
    },
    inspectDatabase: async (url, ssl) => {
      io.inspected.push(url)
      io.sslSeen.push(ssl)
      const state = states.length > 1 ? states.shift() : states[0]
      if (state instanceof Error) throw state
      return state
    },
  }
  return io
}

function installedIo(options = {}) {
  const base = {
    'packages/app/package.json': '{"name":"app"}',
    'packages/core/package.json': '{"name":"core"}',
    'packages/app/node_modules': '',
    'packages/core/node_modules': '',
    'packages/app/.env': `DATABASE_URL=${LOCAL_URL}\n`,
    'packages/app/.env.example': `DATABASE_URL=${LOCAL_URL}\n`,
  }
  const io = fakeIo({ ...options, files: { ...base, ...options.files } })
  if (!options.freshInstall) {
    io.store['node_modules/.vereino-setup-install'] = hashFiles(dependencyInputs(io), io.readFile)
  }
  return io
}

async function runSetup(io, argv = [], childEnv = {}) {
  const lines = []
  const code = await setup({ argv, io, requirements, childEnv, log: (line) => lines.push(line) })
  return { code, lines, summary: lines.slice(lines.indexOf('\n[setup] summary') + 1) }
}

test('parseArgs keeps the legacy setup flags and adds --no-dev', () => {
  assert.deepEqual(parseArgs([]), {
    noDev: false,
    reinstall: false,
    classic: false,
    verbose: false,
    databaseFlags: [],
  })
  assert.deepEqual(
    parseArgs(['--no-dev', '--reinstall', '--classic', '--verbose', '--database-name', 'club', '--no-update-env']),
    {
      noDev: true,
      reinstall: true,
      classic: true,
      verbose: true,
      databaseFlags: ['--database-name', 'club', '--no-update-env'],
    },
  )
})

test('readRequirements takes Node and Yarn versions from package.json', () => {
  assert.deepEqual(readRequirements({ engines: { node: '>=24.0.0' }, packageManager: 'yarn@4.17.1+sha512.abc' }), {
    nodeMajor: 24,
    yarnVersion: '4.17.1',
  })
})

test('dependencyInputs lists the lockfile and every workspace manifest', () => {
  const io = installedIo()
  assert.deepEqual(dependencyInputs(io), [
    'package.json',
    'yarn.lock',
    'packages/app/package.json',
    'packages/core/package.json',
  ])
  assert.notEqual(
    hashFiles(['a'], () => 'x'),
    hashFiles(['a'], () => 'y'),
  )
})

test('isLocalDatabaseUrl accepts loopback hosts only', () => {
  assert.equal(isLocalDatabaseUrl(LOCAL_URL), true)
  assert.equal(isLocalDatabaseUrl('postgres://u:p@127.0.0.1:5432/db'), true)
  assert.equal(isLocalDatabaseUrl('postgres://u:p@[::1]:5432/db'), true)
  assert.equal(isLocalDatabaseUrl('postgres://u:p@db.example.com:5432/db'), false)
  assert.equal(isLocalDatabaseUrl('not a url'), false)
})

function fakeClient({ connectError, present = true, count = 0, endError = false } = {}) {
  const calls = []
  class Client {
    constructor(config) {
      calls.push(['new', config])
    }
    async connect() {
      if (connectError) throw connectError
    }
    async query(sql) {
      calls.push(['query', sql])
      return sql.includes('to_regclass') ? { rows: [{ present }] } : { rows: [{ count }] }
    }
    async end() {
      calls.push(['end'])
      if (endError) throw new Error('already closed')
    }
  }
  return { Client, calls }
}

const pgError = (code, message = 'connect failed') => Object.assign(new Error(message), { code })
const inspect = (options) => inspectDatabase(LOCAL_URL, { Client: fakeClient(options).Client, ssl: undefined })

test('inspectDatabase classifies missing, empty and initialized databases', async () => {
  assert.equal(await inspect({ connectError: null }), 'empty')
  assert.equal(await inspect({ connectError: pgError('3D000', 'database does not exist') }), 'empty')
  assert.equal(await inspect({ present: false }), 'empty')
  assert.equal(await inspect({ count: 0 }), 'empty')
  const initialized = fakeClient({ count: 2, endError: true })
  assert.equal(await inspectDatabase(LOCAL_URL, { Client: initialized.Client, ssl: undefined }), 'initialized')
  assert.deepEqual(initialized.calls.at(-1), ['end'])
})

test('inspectDatabase connects with a timeout and the SSL settings it is given', async () => {
  const client = fakeClient({ count: 1 })
  await inspectDatabase(LOCAL_URL, { Client: client.Client, ssl: { rejectUnauthorized: false } })
  assert.deepEqual(client.calls[0], [
    'new',
    { connectionString: LOCAL_URL, connectionTimeoutMillis: 5000, ssl: { rejectUnauthorized: false } },
  ])
})

test('inspectDatabase reports no answering server as unreachable', async () => {
  for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EHOSTUNREACH']) {
    assert.equal(await inspect({ connectError: pgError(code) }), 'unreachable', code)
  }
  assert.equal(await inspect({ connectError: new Error('timeout expired') }), 'unreachable')
  assert.equal(
    await inspect({ connectError: new Error('Connection terminated due to connection timeout') }),
    'unreachable',
  )
})

test('inspectDatabase throws when a server answers but refuses the connection', async () => {
  await assert.rejects(
    inspect({ connectError: pgError('28P01', 'password authentication failed for user "postgres"') }),
    /PostgreSQL rejected the connection \(28P01: password authentication failed for user "postgres"\); check the credentials in DATABASE_URL in packages\/app\/\.env/,
  )
  await assert.rejects(
    inspect({ connectError: pgError(undefined, 'no pg_hba.conf entry') }),
    /\(no code: no pg_hba\.conf entry\)/,
  )
  class Client {
    async connect() {
      throw undefined
    }
  }
  await assert.rejects(inspectDatabase(LOCAL_URL, { Client, ssl: undefined }), /\(no code: undefined\)/)
})

test('readEnvValue reads one key and drops quotes', () => {
  const source = '# DB_SSL=false\nDB_SSL = "true"\nNAME=\'club\'\nEMPTY=\n'
  assert.equal(readEnvValue(source, 'DB_SSL'), 'true')
  assert.equal(readEnvValue(source, 'NAME'), 'club')
  assert.equal(readEnvValue(source, 'EMPTY'), '')
  assert.equal(readEnvValue(source, 'MISSING'), undefined)
})

test('sslConfig follows the platform rule for the inspected URL', () => {
  const none = () => undefined
  assert.equal(sslConfig(LOCAL_URL, none), undefined)
  assert.deepEqual(sslConfig(`${LOCAL_URL}?sslmode=require`, none), { rejectUnauthorized: true })
  assert.deepEqual(sslConfig(`${LOCAL_URL}?ssl=true`, none), { rejectUnauthorized: true })
  const env = { DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'false' }
  assert.deepEqual(
    sslConfig(LOCAL_URL, (key) => env[key]),
    { rejectUnauthorized: false },
  )
})

test('a clean clone runs every step and starts the dev runtime', async () => {
  const io = installedIo({ freshInstall: true, databases: ['unreachable', 'empty'] })
  delete io.store['packages/app/.env']
  const { code, summary } = await runSetup(io)
  assert.equal(code, 0)
  assert.deepEqual(io.ran, [
    'yarn install',
    'docker compose --env-file packages/app/.env up -d --wait postgres redis',
    'yarn generate',
    'yarn db:migrate',
    'yarn initialize',
    'yarn dev',
  ])
  assert.equal(io.store['packages/app/.env'], io.store['packages/app/.env.example'])
  assert.equal(io.store['node_modules/.vereino-setup-install'], hashFiles(dependencyInputs(io), io.readFile))
  assert.deepEqual(
    summary.map((line) => line.trim().split(/\s+/).slice(0, 2).join(' ')),
    [
      'skip node',
      'skip yarn',
      'done dependencies',
      'done env',
      'done database',
      'done generate',
      'done migrate',
      'done initialize',
      '[setup] ready;',
    ],
  )
})

test('a re-run skips completed steps and never initializes a database with users', async () => {
  const io = installedIo()
  const { code, lines } = await runSetup(io, ['--no-dev'])
  assert.equal(code, 0)
  assert.deepEqual(io.ran, ['yarn generate', 'yarn db:migrate'])
  assert.ok(lines.some((line) => line.includes('skip  dependencies up to date with yarn.lock')))
  assert.ok(lines.some((line) => line.includes('skip  env          keeping existing packages/app/.env')))
  assert.ok(lines.some((line) => line.includes('skip  initialize   database already has users')))
  assert.equal(lines.at(-1), '[setup] ready; start the app with: yarn dev')
})

test('--reinstall re-initializes and dev flags are forwarded', async () => {
  const io = installedIo()
  await runSetup(io, ['--reinstall', '--classic', '--verbose', '--database-name', 'club'])
  assert.deepEqual(io.ran.slice(-2), ['yarn initialize --reinstall', 'yarn dev:classic --verbose --database-name club'])
  assert.deepEqual(io.overrideFlags, ['--database-name', 'club'])
  assert.deepEqual(devCommand(parseArgs([])), ['dev'])
})

test('the dev runtime exit code becomes the installer exit code', async () => {
  const io = installedIo({ statuses: { 'yarn dev': 130 } })
  assert.equal((await runSetup(io)).code, 130)
})

test('a database override reaches the inspection and every child command', async () => {
  const io = installedIo({ override: { applied: true, childEnv: { DATABASE_URL: 'postgres://u:p@localhost/club' } } })
  const childEnv = {}
  await runSetup(io, ['--database-name', 'club', '--no-dev'], childEnv)
  assert.deepEqual(io.inspected, ['postgres://u:p@localhost/club'])
  assert.deepEqual(childEnv, { DATABASE_URL: 'postgres://u:p@localhost/club' })
})

test('DATABASE_URL from the environment wins over packages/app/.env', async () => {
  const io = installedIo({ env: { DATABASE_URL: 'postgres://u:p@localhost/from-env' } })
  await runSetup(io, ['--no-dev'])
  assert.deepEqual(io.inspected, ['postgres://u:p@localhost/from-env'])
})

test('a deleted workspace node_modules makes the install run again', async () => {
  const io = installedIo()
  delete io.store['packages/app/node_modules']
  const { code } = await runSetup(io, ['--no-dev'])
  assert.equal(code, 0)
  assert.equal(io.ran[0], 'yarn install')
})

test('DB_SSL from packages/app/.env reaches the database inspection', async () => {
  const io = installedIo({ files: { 'packages/app/.env': `DATABASE_URL=${LOCAL_URL}\nDB_SSL=true\n` } })
  await runSetup(io, ['--no-dev'])
  assert.deepEqual(io.sslSeen, [{ rejectUnauthorized: true }])
  const fromEnv = installedIo({
    env: { DB_SSL: 'false' },
    files: { 'packages/app/.env': `DATABASE_URL=${LOCAL_URL}\nDB_SSL=true\n` },
  })
  await runSetup(fromEnv, ['--no-dev'])
  assert.deepEqual(fromEnv.sslSeen, [undefined])
})

test('a missing Yarn is enabled through Corepack', async () => {
  const io = installedIo({ yarnVersions: ['', '4.17.1'] })
  const { code, lines } = await runSetup(io, ['--no-dev'])
  assert.equal(code, 0)
  assert.equal(io.ran[0], 'corepack enable')
  assert.ok(lines.some((line) => line.includes('done  yarn         enabled Corepack, Yarn 4.17.1')))
})

const failures = [
  {
    name: 'an old Node.js',
    io: () => installedIo({ nodeVersion: '22.4.0' }),
    step: 'node',
    message: 'Node.js >= 24 required, found 22.4.0',
  },
  {
    name: 'a failing corepack enable',
    io: () => installedIo({ yarnVersions: ['1.22.22'], statuses: { 'corepack enable': 3 } }),
    step: 'yarn',
    message: 'run it once from an elevated shell',
    code: 3,
  },
  {
    name: 'a global Yarn that shadows Corepack',
    io: () => installedIo({ yarnVersions: ['1.22.22'] }),
    step: 'yarn',
    message: 'Yarn 4.17.1 required, found 1.22.22',
  },
  {
    name: 'no Yarn even after Corepack',
    io: () => installedIo({ yarnVersions: [''] }),
    step: 'yarn',
    message: 'Yarn 4.17.1 required, found none',
  },
  {
    name: 'a failing yarn install',
    io: () => installedIo({ freshInstall: true, statuses: { 'yarn install': 2 } }),
    step: 'dependencies',
    message: '`yarn install` failed',
    code: 2,
  },
  {
    name: 'an invalid database-name override',
    io: () => installedIo({ override: new Error('Invalid database name "1x"') }),
    step: 'database',
    message: 'Invalid database name "1x"',
  },
  {
    name: 'an override that throws a non-error',
    io: () => {
      const io = installedIo()
      io.resolveDatabaseOverride = async () => {
        throw 'boom'
      }
      return io
    },
    step: 'database',
    message: 'boom',
  },
  {
    name: 'an .env without DATABASE_URL',
    io: () => installedIo({ files: { 'packages/app/.env': 'APP_URL=http://localhost:3000\n' } }),
    step: 'database',
    message: 'DATABASE_URL is not set in packages/app/.env',
  },
  {
    name: 'an unreachable remote database',
    io: () =>
      installedIo({
        databases: ['unreachable'],
        files: { 'packages/app/.env': 'DATABASE_URL=postgres://u:p@db.example.com/club\n' },
      }),
    step: 'database',
    message: 'not reachable; start it or fix DATABASE_URL',
  },
  {
    name: 'Docker that is not running',
    io: () =>
      installedIo({
        databases: ['unreachable'],
        statuses: { 'docker compose --env-file packages/app/.env up -d --wait postgres redis': 18 },
      }),
    step: 'database',
    message: 'is Docker installed and running?',
    code: 18,
  },
  {
    name: 'a local server that refuses the credentials',
    io: () => installedIo({ databases: [new Error('PostgreSQL rejected the connection (28P01: password failed)')] }),
    step: 'database',
    message: 'PostgreSQL rejected the connection (28P01',
  },
  {
    name: 'a container on a port DATABASE_URL does not use',
    io: () => installedIo({ databases: ['unreachable'] }),
    step: 'database',
    message: 'still cannot connect',
  },
  {
    name: 'a failing generate',
    io: () => installedIo({ statuses: { 'yarn generate': 4 } }),
    step: 'generate',
    message: '`yarn generate` failed',
    code: 4,
  },
  {
    name: 'a failing migration',
    io: () => installedIo({ statuses: { 'yarn db:migrate': 1 } }),
    step: 'migrate',
    message: '`yarn db:migrate` failed',
  },
  {
    name: 'a failing initialize',
    io: () => installedIo({ databases: ['empty'], statuses: { 'yarn initialize': 1 } }),
    step: 'initialize',
    message: '`yarn initialize` failed',
  },
]

for (const failure of failures) {
  test(`${failure.name} stops the installer at ${failure.step} with exit code ${String(failure.code ?? 1)}`, async () => {
    const io = failure.io()
    const { code, lines } = await runSetup(io)
    assert.equal(code, failure.code ?? 1)
    assert.ok(
      lines.some((line) => line.includes(`FAIL  ${failure.step.padEnd(12)}`) && line.includes(failure.message)),
      lines.join('\n'),
    )
    assert.equal(
      lines.at(-1),
      `[setup] failed at ${failure.step}; fix it and run the installer again (completed steps are skipped)`,
    )
    assert.ok(!io.ran.some((line) => line.startsWith('yarn dev')))
    if (failure.step === 'database' && failure.message.startsWith('PostgreSQL rejected')) {
      assert.ok(!io.ran.some((line) => line.startsWith('docker')))
    }
  })
}

test('STEPS follow the README order', () => {
  assert.deepEqual(
    STEPS.map((step) => step.name),
    ['node', 'yarn', 'dependencies', 'env', 'database', 'generate', 'migrate', 'initialize'],
  )
})

test('createIo runs commands in the repository root with the shared child environment', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-setup-'))
  try {
    fs.mkdirSync(path.join(root, 'packages', 'app'), { recursive: true })
    fs.writeFileSync(path.join(root, 'packages', 'app', '.env.example'), 'DATABASE_URL=x\n')
    const spawned = []
    const spawn = (command, args, options) => {
      spawned.push({ command, args, options })
      if (command === 'missing') return { status: null }
      if (command === 'broken') return { status: 1, stdout: 'ignored' }
      return { status: 0, stdout: ' 4.17.1\n' }
    }
    const childEnv = { DATABASE_URL: 'postgres://override' }
    const client = fakeClient({ count: 1 })
    const Client = client.Client
    const io = createIo({ root, spawn, env: { PATH: '/bin' }, requireFromApp: () => ({ Client }), childEnv })

    assert.equal(io.run('yarn', ['generate']), 0)
    assert.equal(io.run('missing', []), 1)
    assert.equal(io.capture('yarn', ['--version']), '4.17.1')
    assert.equal(io.capture('broken', []), '')
    assert.equal(spawned[0].options.cwd, root)
    assert.equal(spawned[0].options.stdio, 'inherit')
    assert.deepEqual(spawned[0].options.env, {
      PATH: '/bin',
      COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      DATABASE_URL: 'postgres://override',
    })
    assert.equal(spawned[2].options.encoding, 'utf8')

    assert.equal(io.exists('packages/app/.env'), false)
    io.copyFile('packages/app/.env.example', 'packages/app/.env')
    io.writeFile('marker', 'hash')
    assert.equal(io.readFile('packages/app/.env'), 'DATABASE_URL=x\n')
    assert.equal(io.readFile('marker'), 'hash')
    assert.deepEqual(io.listDir('packages'), ['app'])
    assert.equal(io.nodeVersion, process.versions.node)
    assert.deepEqual(io.env, { PATH: '/bin' })

    assert.deepEqual(await io.resolveDatabaseOverride([]), { applied: false, remainingArgv: [] })
    io.writeFile('packages/app/.env', 'DATABASE_URL=postgres://u:p@localhost:5432/open-mercato\n')
    const override = await io.resolveDatabaseOverride(['--database-name', 'club', '--no-update-env'])
    assert.equal(override.childEnv.DATABASE_URL, 'postgres://u:p@localhost:5432/club')
    assert.equal(io.readFile('packages/app/.env'), 'DATABASE_URL=postgres://u:p@localhost:5432/open-mercato\n')
    assert.equal(await io.inspectDatabase('postgres://override', { rejectUnauthorized: true }), 'initialized')
    assert.deepEqual(client.calls[0][1].ssl, { rejectUnauthorized: true })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
