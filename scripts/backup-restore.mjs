// Restore drill for the nightly off-site backup (engineering standards S15.7, ENG-TEST-10, issue #464):
// download an encrypted dump from the bucket, decrypt it with the age identity (private key) from the password
// manager, restore it into a PostgreSQL 17 database and print the row count of every table for comparison.
// Decryption completes before any database is contacted, so a wrong key fails without touching the target.
// Procedure and record template: docs/ops/backups.md.
//
//   node scripts/backup-restore.mjs --identity <age key file> --target <database url> [--object <key>]
//   node scripts/backup-restore.mjs --counts-only --target <database url>
//
// `--object` is relative to BACKUP_S3_PREFIX (for example `monthly/vereino-2026-11.dump.age`); without it the
// newest daily copy is restored.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUCKET_VARIABLES,
  DAILY_DIR,
  failures,
  latestDaily,
  missingVariables,
  objectKey,
  parseListing,
  rcloneEnv,
  remotePath,
  runPipeline,
} from './backup-common.mjs'

export const USAGE =
  'Usage: node scripts/backup-restore.mjs --identity <age key file> --target <database url> [--object <key>]\n' +
  '       node scripts/backup-restore.mjs --counts-only --target <database url>'

// Row count of every table outside the system schemas, as `schema.table<TAB>count` lines in name order.
export const COUNTS_SQL = `select format('%I.%I', table_schema, table_name) || chr(9) ||
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables
where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
order by table_schema, table_name`

export function parseArgs(args) {
  const options = { identity: null, target: null, object: null, countsOnly: false }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--counts-only') options.countsOnly = true
    else if (arg === '--identity' || arg === '--target' || arg === '--object') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) return { error: `${arg} needs a value` }
      options[arg.slice(2)] = value
      index += 1
    } else return { error: `Unknown argument: ${arg}` }
  }
  if (!options.target) return { error: '--target is required' }
  if (!options.countsOnly && !options.identity) return { error: '--identity is required' }
  return options
}

// `schema.table<TAB>count` lines → `{ table: count }`.
export function parseCounts(stdout) {
  const counts = {}
  for (const line of stdout.split('\n')) {
    const [table, count] = line.split('\t')
    if (table && count !== undefined) counts[table] = Number(count)
  }
  return counts
}

export async function tableCounts(run, target, env) {
  const result = await run(
    [
      {
        command: 'psql',
        args: ['--no-psqlrc', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', `--dbname=${target}`, '--command', COUNTS_SQL],
        env,
      },
    ],
    { capture: true },
  )
  return result.ok ? { counts: parseCounts(result.stdout) } : { failed: failures(result) }
}

function printCounts(log, counts) {
  const tables = Object.keys(counts)
  for (const table of tables) log(`${table}\t${String(counts[table])}`)
  log(`${String(tables.length)} tables`)
}

function describe(failed) {
  return failed.map((entry) => `${entry.step} exited ${String(entry.exitCode)}${entry.detail ? `: ${entry.detail}` : ''}`).join('; ')
}

export async function main({
  args = process.argv.slice(2),
  env = process.env,
  log = console.log,
  logError = console.error,
  run = runPipeline,
  tmpDir = os.tmpdir(),
} = {}) {
  const options = parseArgs(args)
  if (options.error) {
    logError(options.error)
    logError(USAGE)
    return 2
  }
  const toolEnv = { PATH: env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: env.HOME ?? '/tmp' }
  if (options.countsOnly) {
    const counted = await tableCounts(run, options.target, toolEnv)
    if (counted.failed) {
      logError(`Counting rows failed: ${describe(counted.failed)}`)
      return 1
    }
    printCounts(log, counted.counts)
    return 0
  }
  const missing = missingVariables(env, BUCKET_VARIABLES)
  if (missing.length > 0) {
    logError(`Missing variable: ${missing.join(', ')}`)
    return 1
  }
  if (!fs.existsSync(options.identity)) {
    logError(`Identity file not found: ${options.identity}`)
    return 1
  }

  const s3 = rcloneEnv(env)
  const bucket = env.BACKUP_S3_BUCKET
  const workDir = fs.mkdtempSync(path.join(tmpDir, 'vereino-restore-'))
  fs.chmodSync(workDir, 0o700)
  try {
    let key = options.object ? objectKey(env.BACKUP_S3_PREFIX, options.object) : null
    if (!key) {
      const folder = objectKey(env.BACKUP_S3_PREFIX, DAILY_DIR)
      const listing = await run([{ command: 'rclone', args: ['lsjson', '--files-only', remotePath(bucket, folder)], env: s3 }], {
        capture: true,
      })
      const latest = listing.ok ? latestDaily(parseListing(listing.stdout)) : null
      if (!latest) {
        logError(`No daily backup found in ${folder}${listing.ok ? '' : `: ${describe(failures(listing))}`}`)
        return 1
      }
      key = `${folder}/${latest}`
    }
    log(`Restoring ${key}`)

    const encrypted = path.join(workDir, 'backup.dump.age')
    const download = await run([{ command: 'rclone', args: ['copyto', remotePath(bucket, key), encrypted], env: s3 }])
    if (!download.ok) {
      logError(`Download of ${key} failed: ${describe(failures(download))}`)
      return 1
    }

    const plain = path.join(workDir, 'backup.dump')
    const decrypt = await run([
      { command: 'age', args: ['--decrypt', '--identity', options.identity, '--output', plain, encrypted], env: toolEnv },
    ])
    if (!decrypt.ok) {
      logError(
        `Decryption failed: the identity ${options.identity} does not open ${key} (wrong key or damaged file). ` +
          `No database was touched. ${describe(failures(decrypt))}`,
      )
      return 1
    }

    const restore = await run([
      {
        command: 'pg_restore',
        args: ['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${options.target}`, plain],
        env: toolEnv,
      },
    ])
    if (!restore.ok) {
      logError(`pg_restore failed: ${describe(failures(restore))}`)
      return 1
    }
    const counted = await tableCounts(run, options.target, toolEnv)
    if (counted.failed) {
      logError(`Restored, but counting rows failed: ${describe(counted.failed)}`)
      return 1
    }
    log(`Restored ${key}. Row counts:`)
    printCounts(log, counted.counts)
    return 0
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main()
}
