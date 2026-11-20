// Shared helpers of the off-site backup job (`backup-dump.mjs`) and the restore drill (`backup-restore.mjs`),
// engineering standards S15.7, ENG-TEST-10, issue #464. Both scripts run inside the job image
// `docker/backup/Dockerfile`, which provides `pg_dump`/`pg_restore`/`psql` 17, `age` and `rclone`: no npm
// dependency is involved. Nothing here logs a connection string, a credential or a row of data.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// The age public key(s) the dump is encrypted to. The private key lives only in the password managers of the
// owner and a second person (ENG-Q-04), never in Railway or in this repository.
export const DEFAULT_RECIPIENTS_FILE = path.join(REPO_DIR, 'docker', 'backup', 'age-recipients.txt')

export const BUCKET_VARIABLES = [
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
]

export const DAILY_DIR = 'daily'
export const MONTHLY_DIR = 'monthly'
export const DAILY_KEEP = 30
export const MONTHLY_KEEP = 12
const DAILY_NAME = /^vereino-\d{4}-\d{2}-\d{2}\.dump\.age$/
const MONTHLY_NAME = /^vereino-\d{4}-\d{2}\.dump\.age$/
const STDERR_LIMIT = 4096

// Names of the required variables that are unset or blank, in the given order.
export function missingVariables(env, names) {
  return names.filter((name) => !env[name] || env[name].trim() === '')
}

// The bucket settings as rclone environment for an on-the-fly `:s3:` remote, so no rclone config file holds
// the credentials. The bucket already exists (owner action), so rclone never tries to create it.
export function rcloneEnv(env) {
  const region = env.BACKUP_S3_REGION ? { RCLONE_S3_REGION: env.BACKUP_S3_REGION } : {}
  return {
    PATH: env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: env.HOME ?? '/tmp',
    RCLONE_CONFIG: '/dev/null',
    RCLONE_S3_PROVIDER: 'Other',
    RCLONE_S3_ENDPOINT: env.BACKUP_S3_ENDPOINT,
    RCLONE_S3_ACCESS_KEY_ID: env.BACKUP_S3_ACCESS_KEY_ID,
    RCLONE_S3_SECRET_ACCESS_KEY: env.BACKUP_S3_SECRET_ACCESS_KEY,
    RCLONE_S3_FORCE_PATH_STYLE: 'true',
    RCLONE_S3_NO_CHECK_BUCKET: 'true',
    ...region,
  }
}

// `prefix` is an optional folder inside the bucket (`BACKUP_S3_PREFIX`), with or without slashes.
export function objectKey(prefix, ...parts) {
  const cleaned = (prefix ?? '').split('/').filter(Boolean)
  return [...cleaned, ...parts].join('/')
}

export function remotePath(bucket, key) {
  return `:s3:${bucket}/${key}`
}

// File names of the copies written on `now` (UTC): one daily copy per day, one monthly copy per month.
export function backupNames(now) {
  const iso = now.toISOString()
  return { daily: `vereino-${iso.slice(0, 10)}.dump.age`, monthly: `vereino-${iso.slice(0, 7)}.dump.age` }
}

// The copies beyond the newest `keep` ones. Only files named by `backupNames` are ever considered, so anything
// else in the bucket is left alone. Dated names sort chronologically.
export function expiredBackups(names, { monthly, keep }) {
  const pattern = monthly ? MONTHLY_NAME : DAILY_NAME
  const ours = names.filter((name) => pattern.test(name)).sort()
  return ours.slice(0, Math.max(0, ours.length - keep))
}

// The newest daily copy, or null.
export function latestDaily(names) {
  const ours = names.filter((name) => DAILY_NAME.test(name)).sort()
  return ours.length > 0 ? ours[ours.length - 1] : null
}

// Tool output may echo the connection target and, in `DETAIL`/`CONTEXT` lines, values of a row; keep only the
// headline of each message, with any URL or password redacted.
export function sanitizeStderr(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^(DETAIL|CONTEXT|HINT|LINE \d+):/.test(line))
    .map((line) =>
      line.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[redacted-url]').replace(/password=\S+/gi, 'password=[redacted]'),
    )
    .join(' | ')
    .slice(0, 500)
}

// Runs `steps` as a shell-free pipeline (each step's stdout feeds the next step's stdin) and resolves when every
// process has ended. The last step's stdout is returned when `capture` is set. A missing binary counts as exit 127.
export function runPipeline(steps, { spawnImpl = spawn, capture = false } = {}) {
  return new Promise((resolve) => {
    const results = steps.map((step) => ({ command: step.command, code: null, stderr: '' }))
    let pending = steps.length
    let stdout = ''
    const settle = (index, code) => {
      if (results[index].code !== null) return
      results[index].code = code
      pending -= 1
      if (pending === 0) resolve({ results, stdout, ok: results.every((result) => result.code === 0) })
    }
    let previous = null
    steps.forEach((step, index) => {
      const last = index === steps.length - 1
      const child = spawnImpl(step.command, step.args, {
        env: step.env,
        stdio: [index === 0 ? 'ignore' : 'pipe', last && !capture ? 'ignore' : 'pipe', 'pipe'],
      })
      child.on('error', () => {
        results[index].stderr += `${step.command}: command not found or not executable`
        settle(index, 127)
      })
      child.on('close', (code) => settle(index, code ?? 1))
      child.stderr?.on('data', (chunk) => {
        results[index].stderr = (results[index].stderr + String(chunk)).slice(-STDERR_LIMIT)
      })
      if (previous) {
        child.stdin.on('error', () => {})
        previous.stdout.pipe(child.stdin)
      }
      if (last && capture) {
        child.stdout.on('data', (chunk) => {
          stdout += String(chunk)
        })
      }
      previous = child
    })
  })
}

// Every step that failed, as `{ step, exitCode, detail }`, with the detail sanitized.
export function failures(run) {
  return run.results
    .filter((result) => result.code !== 0)
    .map((result) => ({ step: result.command, exitCode: result.code, detail: sanitizeStderr(result.stderr) }))
}

// Names of the files in a remote folder, read from `rclone lsjson` output.
export function parseListing(stdout) {
  return JSON.parse(stdout || '[]')
    .filter((entry) => !entry.IsDir)
    .map((entry) => entry.Name)
}
