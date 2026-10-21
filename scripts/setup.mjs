// One-command local installer for the README "Getting started" steps (engineering standards S18, issue #5).
// Usage: npm run setup | yarn setup [--no-dev] [--reinstall] [--classic] [--verbose]
//        [--database-name <name>] [--update-env | --no-update-env]
// Every step first checks whether its work is already done and skips it, so a re-run is safe;
// the first failing step stops the run with a non-zero exit code.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectForwardedSetupFlags,
  readEnvDatabaseUrl,
  resolveDatabaseNameOverride,
} from '../packages/app/scripts/dev-database-url.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = 'packages/app/.env'
const ENV_EXAMPLE = 'packages/app/.env.example'
const INSTALL_MARKER = 'node_modules/.vereino-setup-install'
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]']
const CONNECT_TIMEOUT_MS = 5000
// Connection errors meaning no server answers at the address; any other error is a server that answered and refused.
const UNREACHABLE_CODES = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EHOSTUNREACH']

export function parseArgs(argv) {
  return {
    noDev: argv.includes('--no-dev'),
    reinstall: argv.includes('--reinstall'),
    classic: argv.includes('--classic'),
    verbose: argv.includes('--verbose'),
    databaseFlags: collectForwardedSetupFlags(argv),
  }
}

// Reads the required Node.js major and Yarn version from the root package.json.
export function readRequirements(packageJson) {
  return {
    nodeMajor: Number(/\d+/.exec(packageJson.engines.node)[0]),
    yarnVersion: packageJson.packageManager.split('@')[1].split('+')[0],
  }
}

// Dependency inputs: a change to any of them makes the install step run again.
export function dependencyInputs(io) {
  const workspaces = io
    .listDir('packages')
    .map((name) => `packages/${name}/package.json`)
    .filter((file) => io.exists(file))
  return ['package.json', 'yarn.lock', ...workspaces.sort()]
}

export function hashFiles(files, readFile) {
  const hash = createHash('sha256')
  for (const file of files) hash.update(`${file}\n`).update(readFile(file))
  return hash.digest('hex')
}

export function isLocalDatabaseUrl(url) {
  try {
    return LOCAL_HOSTS.includes(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}

// Reads one KEY=value line from an env file; quotes around the value are dropped.
export function readEnvValue(source, key) {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm').exec(source)
  return match ? match[1].trim().replace(/^(['"])(.*)\1$/, '$2') : undefined
}

// The same rule as `getSslConfig` in @open-mercato/shared/lib/db/ssl, which `mercato init` connects with,
// applied to the URL the installer inspects.
export function sslConfig(url, lookup) {
  const required = url.includes('sslmode=require') || url.includes('ssl=true') || lookup('DB_SSL') === 'true'
  return required ? { rejectUnauthorized: lookup('DB_SSL_REJECT_UNAUTHORIZED') !== 'false' } : undefined
}

// Classifies the database as 'unreachable', 'empty' (no users yet) or 'initialized'.
// Mirrors the guard in `mercato init`, which aborts when the users table already has rows.
// A server that answers but refuses the connection (credentials, pg_hba.conf) throws instead.
export async function inspectDatabase(url, { Client, ssl }) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS, ssl })
  try {
    await client.connect()
  } catch (error) {
    // 3D000: the server is up but the database does not exist yet.
    if (error?.code === '3D000') return 'empty'
    if (UNREACHABLE_CODES.includes(error?.code) || /timeout/i.test(String(error?.message))) return 'unreachable'
    throw new Error(
      `PostgreSQL rejected the connection (${String(error?.code ?? 'no code')}: ${String(error?.message)}); ` +
        `check the credentials in DATABASE_URL in ${ENV_FILE}`,
    )
  }
  try {
    const table = await client.query("SELECT to_regclass('public.users') IS NOT NULL AS present")
    if (!table.rows[0].present) return 'empty'
    const users = await client.query('SELECT COUNT(*)::int AS count FROM users')
    return users.rows[0].count > 0 ? 'initialized' : 'empty'
  } finally {
    await client.end().catch(() => {})
  }
}

const done = (detail) => ({ outcome: 'done', detail })
const skipped = (detail) => ({ outcome: 'skipped', detail })
// `status` is the installer's exit code: a failed child command's own code, otherwise 1.
const failed = (detail, status = 1) => ({ outcome: 'failed', detail, status })

function yarnStep(io, args) {
  const command = `yarn ${args.join(' ')}`
  const status = io.run('yarn', args)
  return status === 0 ? done(command) : failed(`\`${command}\` failed`, status)
}

export const STEPS = [
  {
    name: 'node',
    async run({ io, requirements }) {
      const major = Number(io.nodeVersion.split('.')[0])
      if (major < requirements.nodeMajor) {
        return failed(`Node.js >= ${String(requirements.nodeMajor)} required, found ${io.nodeVersion} (see .nvmrc)`)
      }
      return skipped(`Node.js ${io.nodeVersion}`)
    },
  },
  {
    name: 'yarn',
    async run({ io, requirements }) {
      const expected = requirements.yarnVersion
      if (io.capture('yarn', ['--version']) === expected) return skipped(`Yarn ${expected}`)
      const status = io.run('corepack', ['enable'])
      if (status !== 0) {
        return failed(
          '`corepack enable` failed; run it once from an elevated shell (Windows: as Administrator)',
          status,
        )
      }
      const found = io.capture('yarn', ['--version'])
      if (found !== expected) {
        return failed(`Yarn ${expected} required, found ${found || 'none'}; remove a globally installed Yarn`)
      }
      return done(`enabled Corepack, Yarn ${expected}`)
    },
  },
  {
    name: 'dependencies',
    async run({ io }) {
      const inputs = dependencyInputs(io)
      const hash = hashFiles(inputs, io.readFile)
      // With `nmHoistingLimits: workspaces` every workspace has its own node_modules, which can be deleted alone.
      const workspaceModules = inputs
        .filter((file) => file.startsWith('packages/'))
        .map((file) => file.replace(/package\.json$/, 'node_modules'))
      const installed = io.exists(INSTALL_MARKER) && workspaceModules.every((dir) => io.exists(dir))
      if (installed && io.readFile(INSTALL_MARKER) === hash) return skipped('up to date with yarn.lock')
      const result = yarnStep(io, ['install'])
      if (result.outcome === 'done') io.writeFile(INSTALL_MARKER, hash)
      return result
    },
  },
  {
    name: 'env',
    async run({ io }) {
      if (io.exists(ENV_FILE)) return skipped(`keeping existing ${ENV_FILE}`)
      io.copyFile(ENV_EXAMPLE, ENV_FILE)
      return done(`copied ${ENV_EXAMPLE} to ${ENV_FILE}`)
    },
  },
  {
    name: 'database',
    async run(context) {
      const { io, options } = context
      const override = await io.resolveDatabaseOverride(options.databaseFlags)
      if (override.applied) context.childEnv.DATABASE_URL = override.childEnv.DATABASE_URL
      const envText = io.readFile(ENV_FILE)
      // Process environment wins over the env file, as it does for the app's own commands.
      const lookup = (key) => io.env[key] ?? readEnvValue(envText, key)
      const url = context.childEnv.DATABASE_URL ?? io.env.DATABASE_URL ?? readEnvDatabaseUrl(envText)
      if (!url) return failed(`DATABASE_URL is not set in ${ENV_FILE}`)
      const ssl = sslConfig(url, lookup)
      context.database = await io.inspectDatabase(url, ssl)
      if (context.database !== 'unreachable') return skipped('PostgreSQL is reachable')
      if (!isLocalDatabaseUrl(url)) {
        return failed(`PostgreSQL in DATABASE_URL is not reachable; start it or fix DATABASE_URL in ${ENV_FILE}`)
      }
      const compose = ['compose', '--env-file', ENV_FILE, 'up', '-d', '--wait', 'postgres', 'redis']
      const status = io.run('docker', compose)
      if (status !== 0) {
        return failed(
          '`docker compose up` could not start postgres and redis; is Docker installed and running?',
          status,
        )
      }
      context.database = await io.inspectDatabase(url, ssl)
      if (context.database === 'unreachable') {
        return failed(
          `PostgreSQL started but DATABASE_URL in ${ENV_FILE} still cannot connect; check its port and credentials`,
        )
      }
      return done('started postgres and redis with docker compose')
    },
  },
  {
    name: 'generate',
    async run({ io }) {
      return yarnStep(io, ['generate'])
    },
  },
  {
    // Applies only pending migrations, so it is safe on every run.
    name: 'migrate',
    async run({ io }) {
      return yarnStep(io, ['db:migrate'])
    },
  },
  {
    name: 'initialize',
    async run({ io, options, database }) {
      if (!options.reinstall && database === 'initialized') {
        return skipped('database already has users (re-initialize with: yarn setup --reinstall)')
      }
      return yarnStep(io, options.reinstall ? ['initialize', '--reinstall'] : ['initialize'])
    },
  },
]

export function devCommand(options) {
  return [options.classic ? 'dev:classic' : 'dev', ...(options.verbose ? ['--verbose'] : []), ...options.databaseFlags]
}

// Runs the steps in order, prints a summary, then hands over to the dev runtime unless --no-dev.
// Returns the exit code of the first failing step, or of the dev runtime.
// `childEnv` is shared with createIo so a database override reaches every child command.
export async function setup({ argv, io, requirements, childEnv = {}, log = console.log }) {
  const options = parseArgs(argv)
  const context = { io, options, requirements, childEnv, database: undefined }
  const results = []
  for (const step of STEPS) {
    log(`\n[setup] ${step.name}`)
    let result
    try {
      result = await step.run(context)
    } catch (error) {
      result = failed(error instanceof Error ? error.message : String(error))
    }
    results.push({ name: step.name, ...result })
    if (result.outcome === 'failed') break
  }
  log('\n[setup] summary')
  for (const { name, outcome, detail } of results) {
    log(`  ${{ done: 'done', skipped: 'skip', failed: 'FAIL' }[outcome].padEnd(4)}  ${name.padEnd(12)} ${detail}`)
  }
  const failure = results.find((result) => result.outcome === 'failed')
  if (failure) {
    log(`[setup] failed at ${failure.name}; fix it and run the installer again (completed steps are skipped)`)
    return failure.status
  }
  if (options.noDev) {
    log('[setup] ready; start the app with: yarn dev')
    return 0
  }
  const command = devCommand(options)
  log(`[setup] ready; starting the app: yarn ${command.join(' ')}`)
  return io.run('yarn', command)
}

// Real process, file and database adapters.
export function createIo({ root = ROOT, spawn = spawnSync, env = process.env, requireFromApp, childEnv: overrides }) {
  const resolve = (file) => path.join(root, file)
  const shell = process.platform === 'win32'
  const childEnv = () => ({ ...env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', ...overrides })
  return {
    env,
    nodeVersion: process.versions.node,
    exists: (file) => fs.existsSync(resolve(file)),
    listDir: (dir) => fs.readdirSync(resolve(dir)),
    readFile: (file) => fs.readFileSync(resolve(file), 'utf8'),
    writeFile: (file, text) => fs.writeFileSync(resolve(file), text),
    copyFile: (from, to) => fs.copyFileSync(resolve(from), resolve(to)),
    // A command that cannot be spawned or is killed by a signal has no status and counts as failed.
    run: (command, args) => spawn(command, args, { cwd: root, stdio: 'inherit', shell, env: childEnv() }).status ?? 1,
    capture: (command, args) => {
      const result = spawn(command, args, { cwd: root, encoding: 'utf8', shell, env: childEnv() })
      return result.status === 0 ? String(result.stdout).trim() : ''
    },
    resolveDatabaseOverride: (flags) =>
      resolveDatabaseNameOverride({
        argv: flags,
        env,
        cwd: resolve('packages/app'),
        envFilePath: resolve(ENV_FILE),
        stdin: process.stdin,
        stdout: process.stdout,
        logger: { info: (message) => console.log(message) },
      }),
    // pg is a dependency of the app, so it is resolved only after the dependencies step.
    inspectDatabase: (url, ssl) => inspectDatabase(url, { Client: requireFromApp('pg').Client, ssl }),
  }
}

/* node:coverage disable */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const childEnv = {}
  const requireFromApp = createRequire(path.join(ROOT, 'packages', 'app', 'package.json'))
  const requirements = readRequirements(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')))
  const io = createIo({ requireFromApp, childEnv })
  process.exitCode = await setup({ argv: process.argv.slice(2), io, requirements, childEnv })
}
/* node:coverage enable */
