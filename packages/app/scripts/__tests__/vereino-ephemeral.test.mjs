// Unit tests for the Vereino ephemeral-app runner (engineering standards S2.2, S13.1).
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { test } from 'node:test'
import {
  DEFAULT_PORT,
  DEFAULT_POSTGRES_IMAGE,
  POSTGRES_INIT_SQL,
  SEEDED_ADMIN,
  buildAppEnv,
  parseArgs,
  runEphemeral,
  runYarn,
  startApp,
  startDatabase,
  stopProcessTree,
  waitForReady,
  waitForSignal,
} from '../vereino-ephemeral.mjs'

test('parseArgs reads the mode and options', () => {
  assert.deepEqual(parseArgs(['test']), { mode: 'test', filter: null, build: true, port: DEFAULT_PORT })
  assert.deepEqual(parseArgs(['start', '--no-build', '--port', '6001', '--filter', 'ENG-TEST']), {
    mode: 'start',
    filter: 'ENG-TEST',
    build: false,
    port: 6001,
  })
})

test('parseArgs rejects unknown modes and incomplete options', () => {
  assert.throws(() => parseArgs([]), /usage/)
  assert.throws(() => parseArgs(['run']), /usage/)
  assert.throws(() => parseArgs(['test', '--filter']), /incomplete option: --filter/)
  assert.throws(() => parseArgs(['test', '--port', 'abc']), /incomplete option: --port/)
  assert.throws(() => parseArgs(['test', '--port']), /incomplete option: --port/)
  assert.throws(() => parseArgs(['test', '--verbose']), /unknown or incomplete option: --verbose/)
})

test('buildAppEnv points the app at the database and pins test-only values', () => {
  const env = buildAppEnv({
    databaseUrl: 'postgres://db',
    port: 6001,
    stateDir: '/tmp/state',
    baseEnv: { KEEP: '1', NODE_ENV: 'development' },
    secret: 'test-secret',
  })
  assert.equal(env.KEEP, '1')
  assert.equal(env.NODE_ENV, 'production')
  assert.equal(env.PORT, '6001')
  assert.equal(env.BASE_URL, 'http://127.0.0.1:6001')
  assert.equal(env.DATABASE_URL, 'postgres://db')
  assert.equal(env.JWT_SECRET, 'test-secret')
  assert.equal(env.OM_INIT_ADMIN_PASSWORD, SEEDED_ADMIN.password)
  assert.equal(env.OM_ENABLE_ENTERPRISE_MODULES, 'false')
})

test('buildAppEnv defaults to the process environment and a random secret', () => {
  const env = buildAppEnv({ databaseUrl: 'postgres://db', port: 1, stateDir: '/tmp' })
  assert.equal(env.JWT_SECRET.length, 64)
  assert.equal(env.PATH ?? env.Path, process.env.PATH ?? process.env.Path)
})

function fakeTestcontainers(calls) {
  class GenericContainer {
    constructor(image) {
      calls.push(['image', image])
    }
    withEnvironment(env) {
      calls.push(['env', env])
      return this
    }
    withCopyContentToContainer(files) {
      calls.push(['copy', files])
      return this
    }
    withExposedPorts(port) {
      calls.push(['port', port])
      return this
    }
    withWaitStrategy(strategy) {
      calls.push(['wait', strategy])
      return this
    }
    async start() {
      return {
        getHost: () => 'localhost',
        getMappedPort: () => 55432,
        stop: async () => {
          calls.push(['stop'])
        },
      }
    }
  }
  const Wait = { forLogMessage: (pattern, times) => ({ pattern, times }) }
  return { GenericContainer, Wait }
}

test('startDatabase starts PostgreSQL with the extensions and returns its URL', async () => {
  const calls = []
  const database = await startDatabase({ image: 'pg:test', testcontainers: fakeTestcontainers(calls) })
  assert.equal(database.databaseUrl, 'postgres://vereino:secret@localhost:55432/vereino_test')
  assert.deepEqual(calls[0], ['image', 'pg:test'])
  assert.equal(calls.find(([kind]) => kind === 'copy')[1][0].content, POSTGRES_INIT_SQL)
  assert.equal(calls.find(([kind]) => kind === 'wait')[1].times, 2)
  await database.stop()
  assert.deepEqual(calls.at(-1), ['stop'])
})

test('startDatabase defaults to the pgvector PostgreSQL 17 image', async () => {
  const calls = []
  await startDatabase({ testcontainers: fakeTestcontainers(calls) })
  assert.deepEqual(calls[0], ['image', DEFAULT_POSTGRES_IMAGE])
})

test('startDatabase loads the testcontainers package by default', async (context) => {
  const calls = []
  const mocked = context.mock.module('testcontainers', { namedExports: fakeTestcontainers(calls) })
  try {
    const database = await startDatabase({})
    assert.equal(database.databaseUrl, 'postgres://vereino:secret@localhost:55432/vereino_test')
  } finally {
    mocked.restore()
  }
})

test('runYarn returns the step status and treats a killed step as failed', () => {
  const seen = []
  const ok = runYarn(['initialize'], {
    env: { A: '1' },
    cwd: '/app',
    spawnSyncImpl: (command, args, options) => (seen.push([command, args, options.cwd]), { status: 0 }),
  })
  assert.equal(ok, 0)
  assert.deepEqual(seen, [['yarn', ['initialize'], '/app']])
  assert.equal(runYarn(['build'], { env: {}, spawnSyncImpl: () => ({ status: null }) }), 1)
  assert.equal(runYarn(['--version'], { env: process.env }), 0)
})

function fakeChild(pid = 4242) {
  const child = new EventEmitter()
  child.pid = pid
  return child
}

test('startApp starts yarn start and reports when it exits', () => {
  for (const platform of ['win32', 'linux']) {
    const child = fakeChild()
    let options
    const app = startApp({
      env: {},
      cwd: '/app',
      platform,
      spawnImpl: (_command, _args, opts) => ((options = opts), child),
    })
    assert.equal(options.detached, platform !== 'win32')
    assert.equal(app.hasExited(), false)
    child.emit('exit', 0)
    assert.equal(app.hasExited(), true)
  }
})

test('stopProcessTree kills the whole tree on Windows and the process group elsewhere', () => {
  const windows = []
  stopProcessTree(fakeChild(7), { platform: 'win32', spawnSyncImpl: (command, args) => windows.push([command, args]) })
  assert.deepEqual(windows, [['taskkill', ['/PID', '7', '/T', '/F']]])
  const signals = []
  stopProcessTree(fakeChild(8), { platform: 'linux', kill: (pid, signal) => signals.push([pid, signal]) })
  assert.deepEqual(signals, [[-8, 'SIGTERM']])
  stopProcessTree(fakeChild(9), {
    platform: 'linux',
    kill: () => {
      throw new Error('ESRCH')
    },
  })
})

test('stopProcessTree defaults to the current platform', () => {
  const calls = []
  stopProcessTree(fakeChild(10), { spawnSyncImpl: () => calls.push('taskkill'), kill: () => calls.push('kill') })
  assert.equal(calls.length, 1)
})

function response(status, json) {
  return { status, ok: status >= 200 && status < 300, json: async () => json }
}

function fakeFetch(answers) {
  let index = 0
  return async (url) => {
    const answer = answers[Math.min(index, answers.length - 1)]
    index += 1
    if (answer instanceof Error) throw answer
    return answer(url)
  }
}

test('waitForReady retries until the sign-in page and the seeded login work', async () => {
  const sleeps = []
  const fetchImpl = fakeFetch([
    () => response(503),
    () => response(200),
    () => response(401),
    () => response(200),
    () => response(200, { token: '' }),
    new Error('ECONNREFUSED'),
    () => response(200),
    () => response(200, { token: 'jwt' }),
  ])
  await waitForReady({
    baseUrl: 'http://app',
    hasExited: () => false,
    fetchImpl,
    sleep: async (ms) => sleeps.push(ms),
    intervalMs: 5,
  })
  assert.deepEqual(sleeps, [5, 5, 5, 5])
})

test('waitForReady fails when the app exits or the deadline passes', async () => {
  await assert.rejects(
    waitForReady({ baseUrl: 'http://app', hasExited: () => true, fetchImpl: fakeFetch([() => response(200)]) }),
    /exited before it became ready/,
  )
  let clock = 0
  await assert.rejects(
    waitForReady({
      baseUrl: 'http://app',
      hasExited: () => false,
      fetchImpl: fakeFetch([() => response(500)]),
      timeoutMs: 3000,
      sleep: async () => undefined,
      now: () => (clock += 1000),
    }),
    /not ready within 3s at http:\/\/app/,
  )
})

test('waitForReady uses the real timer and fetch by default', async () => {
  let clock = 0
  await assert.rejects(
    waitForReady({
      baseUrl: 'http://127.0.0.1:9',
      hasExited: () => false,
      intervalMs: 1,
      timeoutMs: 2,
      now: () => (clock += 1),
    }),
    /not ready within/,
  )
})

test('waitForSignal resolves on SIGINT or SIGTERM', async () => {
  const processRef = new EventEmitter()
  const waiting = waitForSignal(processRef)
  processRef.emit('SIGTERM')
  await waiting
  // The default listens on the real process; remove only the listeners it added.
  const before = { SIGINT: process.listeners('SIGINT'), SIGTERM: process.listeners('SIGTERM') }
  void waitForSignal()
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const added = process.listeners(signal).filter((listener) => !before[signal].includes(listener))
    assert.equal(added.length, 1)
    for (const listener of added) process.removeListener(signal, listener)
  }
})

function fakeDeps(overrides = {}) {
  const calls = []
  const child = fakeChild()
  const deps = {
    calls,
    startDatabaseImpl: async ({ image }) => (
      calls.push(['db', image]),
      { databaseUrl: 'postgres://db', stop: async () => calls.push(['db-stop']) }
    ),
    runYarnImpl: (args, { env }) => (calls.push(['yarn', args.join(' '), env.BASE_URL]), 0),
    startAppImpl: () => (calls.push(['app']), { child, hasExited: () => false }),
    waitForReadyImpl: async ({ baseUrl }) => calls.push(['ready', baseUrl]),
    stopImpl: (stopped) => calls.push(['app-stop', stopped.pid]),
    waitForSignalImpl: async () => calls.push(['signal']),
    image: 'pg:test',
    stateDir: fs.mkdtempSync(`${process.env.TEMP ?? '/tmp'}/vereino-ephemeral-test-`),
    ...overrides,
  }
  return deps
}

test('runEphemeral test mode builds, starts, runs Playwright and cleans up', async () => {
  const deps = fakeDeps()
  const lines = []
  const code = await runEphemeral({ argv: ['test', '--filter', 'ENG-TEST'], deps, log: (line) => lines.push(line) })
  assert.equal(code, 0)
  assert.deepEqual(deps.calls, [
    ['db', 'pg:test'],
    ['yarn', 'initialize', 'http://127.0.0.1:5001'],
    ['yarn', 'build', 'http://127.0.0.1:5001'],
    ['app'],
    ['ready', 'http://127.0.0.1:5001'],
    ['yarn', 'playwright install chromium', 'http://127.0.0.1:5001'],
    ['yarn', 'playwright test --config .ai/qa/tests/playwright.config.ts ENG-TEST', 'http://127.0.0.1:5001'],
    ['app-stop', 4242],
    ['db-stop'],
  ])
  assert.equal(fs.existsSync(deps.stateDir), false)
  assert.equal(lines.at(-1), '[ephemeral] stopped')
})

test('runEphemeral start mode skips the build on request and waits for a signal', async () => {
  const deps = fakeDeps()
  const code = await runEphemeral({ argv: ['start', '--no-build', '--port', '6001'], deps, log: () => undefined })
  assert.equal(code, 0)
  assert.deepEqual(
    deps.calls.map(([kind, detail]) => (kind === 'yarn' ? `yarn ${detail}` : kind)),
    ['db', 'yarn initialize', 'app', 'ready', 'signal', 'app-stop', 'db-stop'],
  )
})

test('runEphemeral returns the Playwright status without a filter', async () => {
  const deps = fakeDeps({
    runYarnImpl: (args) => (args[1] === 'test' ? (deps.calls.push(['pw', args.join(' ')]), 3) : 0),
  })
  assert.equal(await runEphemeral({ argv: ['test'], deps, log: () => undefined }), 3)
  assert.deepEqual(
    deps.calls.find(([kind]) => kind === 'pw'),
    ['pw', 'playwright test --config .ai/qa/tests/playwright.config.ts'],
  )
})

test('runEphemeral stops the app and the database when the browser install fails', async () => {
  const deps = fakeDeps({ runYarnImpl: (args) => (args[1] === 'install' ? 1 : 0) })
  await assert.rejects(
    runEphemeral({ argv: ['test'], deps, log: () => undefined }),
    /playwright install chromium failed/,
  )
  assert.deepEqual(deps.calls.slice(-2), [['app-stop', 4242], ['db-stop']])
})

test('runEphemeral stops the database when a setup step fails', async () => {
  const deps = fakeDeps({ runYarnImpl: () => 1 })
  await assert.rejects(runEphemeral({ argv: ['test'], deps, log: () => undefined }), /yarn initialize failed/)
  assert.deepEqual(deps.calls, [['db', 'pg:test'], ['db-stop']])
})

test('runEphemeral uses the default image, state directory and console', async () => {
  const deps = fakeDeps()
  delete deps.image
  delete deps.stateDir
  const original = console.log
  const lines = []
  console.log = (line) => lines.push(line)
  try {
    await runEphemeral({ argv: ['test'], deps })
  } finally {
    console.log = original
  }
  assert.equal(
    lines[0],
    `[ephemeral] starting PostgreSQL (${process.env.VEREINO_IT_POSTGRES_IMAGE ?? DEFAULT_POSTGRES_IMAGE})`,
  )
})
